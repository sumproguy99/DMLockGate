// Wraps @mega-yfue/eufy-sdk for the bridge. The only file that talks to Eufy.
//
// Verified behaviour (docs/EUFY_COMPATIBILITY_REPORT.md):
// - lock()/unlock() are fire-and-forget over MQTT; resolving means "sent", not "bolt moved".
// - getDevice(sn) re-reads the cloud record, but when that cloud call fails it silently falls back
//   to the cached device list. readState() therefore only answers when a state fetch succeeded.
// - Push lockState events carry `locked` for lock/unlock transitions (types 257..269).
// - lastSeenMs is broken and is never used.

import { EventEmitter } from "node:events";
import net from "node:net";
import { join } from "node:path";
import {
  EufyMega,
  FileSessionStore,
  FileFcmStore,
  LoginStatus,
  SecureMqtt,
  buildAppShapedClientId,
  mqttUuidFrom,
  probeBrokerInstance,
  resolveBrokerIps,
  secureTopic,
} from "@mega-yfue/eufy-sdk";

const TARGET_MODEL = /^T85D0/i;
// LockPushEvent MECHANICAL_ANOMALY (517) and LOCK_MECHANICAL_ANOMALY (519).
const JAM_EVENT_TYPES = new Set([517, 519]);
const OFFLINE_EVENT = 516;
const ONLINE_EVENT = 771;
// The mega cloud calls that carry device params: one device's, and every device's.
const PARAM_LIST_PATH = "/app/devicemanage/get_device_param_list";
const DEVICE_LIST_PATH = "/app/house/get_devs_list";
// The SDK answers from a device list fetched this recently instead of fetching again (LIST_REUSE_MS).
const LIST_REUSE_MS = 5_000;
// Mega API code for "only the owner can change settings": the cloud answered, so it is healthy.
const OWNER_ONLY_CODE = 20004;
export const DEGRADED_AFTER_FAILURES = 2;
export const DEGRADED_AFTER_SILENT_MS = 15 * 60 * 1000;
// How long one broker instance may take to grant a SUBSCRIBE during discovery (the SDK allows 8 s).
export const BROKER_PROBE_MS = 5_000;
// Longest error text the bridge keeps or reports. Long enough for every broker's answer in one failure.
export const ERROR_TEXT_MAX = 1000;

/** The SDK's MQTT pieces the bridge's own broker discovery uses; replaced in tests. */
const SDK_MQTT = { SecureMqtt, buildAppShapedClientId, mqttUuidFrom, probeBrokerInstance, resolveBrokerIps, secureTopic };

/** The Eufy cloud did not return fresh state, so any value would be a cached guess. */
export class StaleStateError extends Error {
  name = "StaleStateError";
}

/**
 * Whether a TCP connection to a broker instance opens within timeoutMs. Only opens and closes a
 * socket: nothing is sent, so it cannot affect a lock.
 */
export function tcpReachable(ip, port = 8883, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: ip, port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/** The bridge gave up on a command before it was published, and the publish guard stopped it. */
export class CommandNotSentError extends Error {
  name = "CommandNotSentError";
}

export class EufyAdapter extends EventEmitter {
  /**
   * @param {object} [options.eufy] An EufyMega-shaped client, for tests. Defaults to the real SDK.
   * @param {(ip: string) => Promise<boolean>} [options.reachable] Broker reachability check, for tests.
   * @param {object} [options.mqttTools] The SDK's MQTT helpers (SDK_MQTT), for tests.
   */
  constructor({ email, password, countryCode, brokerIp = null, dataDir, log = () => {}, eufy = null, now = Date.now, reachable = tcpReachable, mqttTools = SDK_MQTT }) {
    super();
    this.reachable = reachable;
    this.mqttTools = mqttTools;
    /** The broker instance the last command was sent through; tried first next time. */
    this.lastBrokerIp = null;
    this.log = log;
    this.now = now;
    this.status = "starting";
    this.lastError = null;
    this.lastSyncAt = null;
    this.locks = new Map();
    this.cloud = { okAt: null, failedAt: null, error: null, failures: 0, listFetchedAt: 0, paramsFetchedAt: new Map() };
    this.eufy = eufy ?? new EufyMega({
      email,
      password,
      countryCode: countryCode || "US",
      store: new FileSessionStore(join(dataDir, "session.json")),
      pushStore: new FileFcmStore(join(dataDir, "push.json")),
      logger: this.sdkLogger(),
    });
    this.watchCloud();
    this.eufy.on("error", (err) => this.noteError(err));
    this.eufy.on("connect", () => this.log("info", "realtime connected"));
    this.eufy.on("disconnect", () => this.log("warn", "realtime disconnected"));
    this.eufy.on("event", (e) => this.onVendorEvent(e));
    /** Commands in progress, by lock serial: { signal, published, log }. */
    this.commands = new Map();
    this.publishGuarded = this.guardCommandBroker(brokerIp);
  }

  /**
   * Hooks the SDK's per-command broker connection (MqttCommandRouter.ensureSecurityMqttFor). The SDK
   * opens one fresh connection per command and closes it afterwards.
   *
   * The hook does two things:
   * - It guards publishing. A command whose deadline has passed is never published, and a command
   *   records the moment it is published. That is what lets the bridge say "not sent" with certainty
   *   instead of "unknown" when it gives up early (see send()).
   * - It orders the broker candidates before the SDK probes them. The SDK tries them one at a time
   *   with 8 s each, so a few instances that never answer used up the whole command deadline
   *   (2026-10-18: three of the eight built-in addresses time out from this network). The configured
   *   and last successful instances go first, and instances that do not accept a connection go last.
   * - With EUFY_MQTT_BROKER_IP it pins the broker instance. Several instances behind the Eufy broker
   *   hostname accept a subscription for a lock, but only the one holding the lock's own session
   *   delivers to it. Find the right one with `npm run diag:listen` while using the Eufy app.
   *
   * This reaches into SDK internals (ensureSecurityMqttFor, SecureMqtt options and publish), so
   * re-check it after any eufy-sdk upgrade. Returns false when they are missing: commands then still
   * work, but a timeout is always reported as "unknown".
   */
  guardCommandBroker(brokerIp) {
    const router = this.eufy.mqtt;
    const discover = router?.ensureSecurityMqttFor?.bind(router);
    if (!discover) {
      this.log("error", "cannot guard command publishing: the SDK internals changed");
      return false;
    }
    router.ensureSecurityMqttFor = async (dev) => {
      const command = this.commands.get(dev?.sn);
      if (command) command.stage = "broker";
      const ownDiscovery = typeof router.deps?.mega?.getUserMqttInfo === "function";
      if (!ownDiscovery) {
        const order = await this.orderBrokerCandidates(router, brokerIp);
        if (order) command?.log("broker candidates ordered", order);
      }
      let chosen;
      try {
        chosen = ownDiscovery ? await this.findBroker(router, dev, brokerIp, command) : await discover(dev);
      } catch (err) {
        if (err instanceof CommandNotSentError) throw err;
        // Discovery only subscribes; it never publishes, so a failure here means nothing was sent.
        command?.log("broker not found", { error: String(err?.message ?? err).slice(0, ERROR_TEXT_MAX) });
        throw new CommandNotSentError(`No Eufy command server would carry this command: ${String(err?.message ?? err).slice(0, ERROR_TEXT_MAX)}`);
      }
      command?.log("broker found", { instance: chosen.instanceIp });
      if (!ownDiscovery && brokerIp && chosen.instanceIp !== brokerIp) {
        await chosen.mqtt.disconnect();
        chosen.mqtt.o.instanceIp = brokerIp;
        await chosen.mqtt.connect();
        this.log("info", "command broker pinned", { discovered: chosen.instanceIp, used: brokerIp });
        chosen = { mqtt: chosen.mqtt, instanceIp: brokerIp };
      }
      this.lastBrokerIp = chosen.instanceIp;
      if (command?.signal.aborted) {
        await chosen.mqtt.disconnect().catch(() => {});
        throw new CommandNotSentError("The bridge gave up before the command was published.");
      }

      const publish = chosen.mqtt.publish.bind(chosen.mqtt);
      chosen.mqtt.publish = async (topic, body, opts) => {
        // Checked and recorded in the same synchronous step as the publish starts, so a deadline that
        // passes after this point is reported as "may have been sent".
        if (command?.signal.aborted) {
          throw new CommandNotSentError("The bridge gave up before the command was published.");
        }
        if (command) command.published = true;
        command?.log("publishing");
        return publish(topic, body, opts);
      };

      return chosen;
    };

    return true;
  }

  /**
   * The bridge's own version of the SDK's ensureSecurityMqttFor(), with the same SDK pieces: probe
   * broker instances with a SUBSCRIBE (never a publish) and open one connection pinned to the first
   * that grants it. Unlike the SDK it tries EUFY_MQTT_BROKER_IP and the last working instance first,
   * skips instances that do not accept a TCP connection, allows BROKER_PROBE_MS per instance instead
   * of 8 s, stops when the command's deadline passes, and logs every instance's answer.
   * SDK internals (router.deps, router.constructor.KNOWN_AIOT_BROKER_IPS); re-check after an upgrade.
   */
  async findBroker(router, dev, brokerIp, command) {
    const tools = this.mqttTools;
    const { mega } = router.deps;
    const creds = await mega.getUserMqttInfo("eufy_security");
    command?.log("command server credentials fetched");
    const uid = creds.user_id ?? "";
    const mqttUuid = tools.mqttUuidFrom(mega.openudid);
    const clientId = () => tools.buildAppShapedClientId({ appName: "eufy_security", uid, mqttUuid });

    const dnsIps = await tools.resolveBrokerIps(creds.endpoint_addr);
    const seed = Array.isArray(router.constructor?.KNOWN_AIOT_BROKER_IPS) ? router.constructor.KNOWN_AIOT_BROKER_IPS : [];
    const candidates = [...new Set([brokerIp, this.lastBrokerIp, ...dnsIps, ...seed].filter(Boolean))];
    const open = await Promise.all(candidates.map((ip) => this.reachable(ip).catch(() => false)));
    const reachable = candidates.filter((_, i) => open[i]);
    command?.log("broker candidates", { order: reachable, unreachable: candidates.filter((_, i) => !open[i]) });

    const probes = [];
    for (const ip of reachable) {
      if (command?.signal.aborted) {
        throw new CommandNotSentError("The bridge gave up before the command was published.");
      }
      const result = await tools.probeBrokerInstance(
        ip,
        {
          hostname: creds.endpoint_addr,
          port: creds.endpoint_port,
          certificate_pem: creds.certificate_pem,
          private_key: creds.private_key,
          aws_root_ca1_pem: creds.aws_root_ca1_pem,
        },
        { clientId: clientId(), topic: tools.secureTopic(dev, "res"), timeoutMs: BROKER_PROBE_MS },
      );
      command?.log("broker probed", { instance: ip, granted: result.granted, ms: result.ms, error: result.error ?? null });
      probes.push(`${ip} ${result.granted ? "granted" : result.error ?? "denied"}`);
      if (result.granted) {
        const mqtt = new tools.SecureMqtt({
          credentials: creds,
          clientId: clientId(),
          instanceIp: ip,
          // One-shot, as in the SDK: never leave a client retrying in the background.
          reconnectPeriod: 0,
          logger: router.deps.logger,
        });
        mqtt.on("error", (e) => router.deps.onError?.(e));
        await mqtt.connect();
        return { mqtt, instanceIp: ip };
      }
    }
    throw new CommandNotSentError(`No Eufy command server would accept this lock (${probes.join("; ") || "none reachable"}).`);
  }

  /**
   * Reorders the SDK's built-in broker list (MqttCommandRouter.KNOWN_AIOT_BROKER_IPS, read on every
   * discovery): preferred instances first, then the rest that accept a TCP connection, then those that
   * do not. Nothing is removed, so discovery can still reach every instance. Returns what it did for
   * the step log, or null when the SDK has no such list.
   */
  async orderBrokerCandidates(router, brokerIp) {
    const holder = router.constructor;
    if (!Array.isArray(holder?.KNOWN_AIOT_BROKER_IPS)) return null;
    this.brokerSeed ??= [...holder.KNOWN_AIOT_BROKER_IPS];
    const candidates = [...new Set([brokerIp, this.lastBrokerIp, ...this.brokerSeed].filter(Boolean))];
    const open = await Promise.all(candidates.map((ip) => this.reachable(ip).catch(() => false)));
    const unreachable = candidates.filter((_, i) => !open[i]);
    holder.KNOWN_AIOT_BROKER_IPS = [...candidates.filter((_, i) => open[i]), ...unreachable];
    return { first: holder.KNOWN_AIOT_BROKER_IPS[0], unreachable };
  }

  /**
   * Every Eufy cloud call goes through mega.post(). Watching it is the only reliable way to know
   * whether the cloud is answering, because the SDK swallows failed state fetches (see the header).
   * Every argument is passed through: getUserMqttInfo("eufy_security") sends its app-name header as
   * the fourth one, and without it Eufy hands back a credential that every broker refuses for a lock
   * (the cause of every failed command until 2026-10-18).
   * SDK internal (EufyMega.mega); re-check after any eufy-sdk upgrade.
   */
  watchCloud() {
    const mega = this.eufy.mega;
    if (typeof mega?.post !== "function") {
      this.log("error", "cannot watch Eufy cloud calls: the SDK internals changed");
      return;
    }
    const post = mega.post.bind(mega);
    mega.post = async (service, path, body, ...rest) => {
      try {
        const result = await post(service, path, body, ...rest);
        this.cloud.okAt = this.now();
        this.cloud.failures = 0;
        if (path === DEVICE_LIST_PATH) this.cloud.listFetchedAt = this.now();
        if (path === PARAM_LIST_PATH) {
          for (const sn of body?.device_sns ?? []) this.cloud.paramsFetchedAt.set(sn, this.now());
        }
        return result;
      } catch (err) {
        if (err?.code === OWNER_ONLY_CODE) {
          this.cloud.okAt = this.now();
          this.cloud.failures = 0;
        } else {
          this.cloud.failedAt = this.now();
          this.cloud.failures += 1;
          this.cloud.error = String(err?.message ?? err).slice(0, ERROR_TEXT_MAX);
        }
        throw err;
      }
    };
  }

  /**
   * Why the Eufy cloud should not be trusted right now, or null. Commands are refused while this
   * is set: their outcome could not be confirmed.
   */
  degraded() {
    if (this.cloud.failures >= DEGRADED_AFTER_FAILURES) return "cloud_errors";
    if (this.cloud.okAt !== null && this.now() - this.cloud.okAt > DEGRADED_AFTER_SILENT_MS) return "cloud_silent";
    return null;
  }

  /**
   * Log in from the saved session. Interactive steps (captcha, 2FA) are never attempted here: the
   * operator completes them once with `npm run poc:readonly`.
   */
  async start() {
    const res = await this.eufy.login();
    if (res.status !== LoginStatus.Ok) {
      this.status = "needs_login";
      this.log("error", `Eufy login needs ${res.status}. Run "npm run poc:readonly" once to sign in.`);
      return;
    }
    await this.eufy.waitForRealtime({ timeoutMs: 30_000 }).catch((e) => this.log("warn", `realtime not ready: ${e.message}`));
    await this.refreshLocks();
    this.status = "connected";
  }

  async stop() {
    await this.eufy.disconnect().catch(() => {});
  }

  ready() {
    return this.status === "connected";
  }

  health() {
    const reason = this.degraded();
    const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());
    return {
      status: this.status === "connected" && reason !== null ? "degraded" : this.status,
      degraded_reason: reason,
      locks: this.locks.size,
      last_sync_at: this.lastSyncAt,
      cloud_ok_at: iso(this.cloud.okAt),
      cloud_failures: this.cloud.failures,
      cloud_last_error: this.cloud.error,
      last_error: this.lastError,
    };
  }

  async refreshLocks() {
    const devices = await this.eufy.getDevices();
    this.locks = new Map(devices.filter((d) => TARGET_MODEL.test(d.model ?? "")).map((d) => [d.sn, d]));
    this.lastSyncAt = new Date().toISOString();
  }

  async hasLock(sn) {
    return this.locks.has(sn);
  }

  async listLocks() {
    await this.refreshLocks();
    return [...this.locks.values()].map((d) => ({
      external_id: d.sn,
      name: d.name ?? null,
      model: d.model ?? null,
      firmware_version: d.raw?.main_sw_version ?? null,
    }));
  }

  /**
   * A fresh cloud read. Throws StaleStateError unless this lock's params were fetched during the
   * read, or the device list (which carries every lock's params) within the SDK's reuse window;
   * otherwise the SDK would hand back an old cached device list.
   */
  async readState(sn) {
    const startedAt = this.now();
    const lock = (await this.eufy.getDevice(sn)).lock?.();
    const paramsFresh = (this.cloud.paramsFetchedAt.get(sn) ?? 0) >= startedAt;
    const listFresh = this.cloud.listFetchedAt >= startedAt - LIST_REUSE_MS;
    if (!paramsFresh && !listFresh) {
      throw new StaleStateError("The Eufy cloud did not return fresh state for this lock.");
    }
    this.lastSyncAt = new Date().toISOString();
    return {
      external_id: sn,
      state: lock?.locked === true ? "locked" : lock?.locked === false ? "unlocked" : "unknown",
      battery_level: Number.isInteger(lock?.battery) ? lock.battery : null,
      observed_at: new Date().toISOString(),
    };
  }

  /**
   * Sends the command. lock()/unlock() resolve even when the lock never replies, so the lock's own
   * reply comes from the SDK's `commandAck` event: deviceAcked is true or false, or null when no
   * ack event arrived at all.
   *
   * `control` lets the caller give up: once `control.signal` is aborted the command is never
   * published. `control.published` turns true the moment publishing starts, so after aborting the
   * caller knows for certain whether the command could have left (see guardCommandBroker()).
   * `control.stage` says how far it got: "lookup", "dispatching" (inside the SDK, before the guarded
   * broker step), "broker" (inside the guarded step). Only "lookup" and "broker" prove the command
   * was on the guarded path.
   * Each step is logged with its elapsed time.
   */
  async send(sn, action, control = { signal: new AbortController().signal, published: false }) {
    const startedAt = this.now();
    control.stage = "lookup";
    const command = {
      signal: control.signal,
      set stage(value) {
        control.stage = value;
      },
      get published() {
        return control.published;
      },
      set published(value) {
        control.published = value;
      },
      log: (step, extra = {}) => this.log("info", `command step: ${step}`, { lock: maskSn(sn), elapsed_ms: this.now() - startedAt, ...extra }),
    };
    let ack = null;
    const onAck = (info) => {
      if (info?.sn === sn && info?.kind === "ff09-actuate") ack = info;
    };
    this.commands.set(sn, command);
    this.eufy.on("commandAck", onAck);
    try {
      const lock = (await this.eufy.getDevice(sn)).lock();
      command.log("device looked up");
      if (control.signal.aborted) {
        throw new CommandNotSentError("The bridge gave up before the command was published.");
      }
      control.stage = "dispatching";
      await (action === "lock" ? lock.lock() : lock.unlock());
      command.log("finished", { device_acked: ack === null ? null : ack.acked === true });
    } finally {
      this.eufy.off("commandAck", onAck);
      if (this.commands.get(sn) === command) this.commands.delete(sn);
    }

    return { deviceAcked: ack === null ? null : ack.acked === true, broker: ack?.instanceIp ?? null };
  }

  /**
   * Passes on only the SDK's command-delivery lines (broker choice, missing replies). The rest of its
   * debug output is too noisy for the bridge log.
   */
  sdkLogger() {
    const relevant = /dispatchFf09|broker|instance|smqtt|ensureSecurityMqtt/i;
    const pass = (level) => (message) => {
      if (relevant.test(String(message))) this.log(level, `sdk: ${String(message).slice(0, 300)}`);
    };

    return { debug: pass("info"), info: pass("info"), warn: pass("warn"), error: pass("error") };
  }

  noteError(err) {
    this.lastError = { message: String(err?.message ?? err).slice(0, ERROR_TEXT_MAX), at: new Date().toISOString() };
    this.log("error", this.lastError.message);
  }

  /**
   * Turns a vendor event into a LockGuard state event and emits it as "state". Events for other
   * devices, and events that say nothing about the bolt, are dropped.
   */
  onVendorEvent(e) {
    const sn = e?.deviceSn ?? e?.device_sn;
    if (!sn || !this.locks.has(sn)) return;

    let kind = "state";
    let state = null;
    if (e.eventName === "lockState" && e.locked === true) state = "locked";
    else if (e.eventName === "lockState" && e.locked === false) state = "unlocked";
    else if (JAM_EVENT_TYPES.has(e.eventType)) state = "jammed";
    else if (e.eventType === OFFLINE_EVENT || e.eventType === ONLINE_EVENT) kind = "connectivity";
    else return;

    const eventTime = Number(e.event_time);
    this.emit("state", {
      kind,
      external_id: sn,
      state,
      online: kind === "connectivity" ? e.eventType === ONLINE_EVENT : null,
      event_type: e.eventType ?? null,
      // The lock's clock may differ from the server's by a few seconds.
      observed_at: Number.isFinite(eventTime) && eventTime > 0 ? new Date(eventTime).toISOString() : new Date().toISOString(),
      external_event_id: Number.isFinite(eventTime) && eventTime > 0 ? `${e.eventType}:${eventTime}` : null,
      actor: typeof e.nick_name === "string" ? e.nick_name.slice(0, 120) : null,
    });
  }
}

/** "T85D0K1024460592" → "T85D0…592", as the bridge log masks serials elsewhere. */
function maskSn(sn) {
  return typeof sn === "string" && sn.length > 8 ? `${sn.slice(0, 5)}…${sn.slice(-3)}` : "?";
}
