// Wraps @mega-yfue/eufy-sdk for the bridge. The only file that talks to Eufy.
//
// Verified behaviour (docs/EUFY_COMPATIBILITY_REPORT.md):
// - lock()/unlock() are fire-and-forget over MQTT; resolving means "sent", not "bolt moved".
// - getDevice(sn) re-reads the cloud record, so lock().locked is a fresh reported state.
// - Push lockState events carry `locked` for lock/unlock transitions (types 257..269).
// - lastSeenMs is broken and is never used.

import { EventEmitter } from "node:events";
import { join } from "node:path";
import { EufyMega, FileSessionStore, FileFcmStore, LoginStatus } from "@mega-yfue/eufy-sdk";

const TARGET_MODEL = /^T85D0/i;
// LockPushEvent MECHANICAL_ANOMALY (517) and LOCK_MECHANICAL_ANOMALY (519).
const JAM_EVENT_TYPES = new Set([517, 519]);
const OFFLINE_EVENT = 516;
const ONLINE_EVENT = 771;

export class EufyAdapter extends EventEmitter {
  constructor({ email, password, countryCode, brokerIp = null, dataDir, log = () => {} }) {
    super();
    this.log = log;
    this.status = "starting";
    this.lastError = null;
    this.lastSyncAt = null;
    this.locks = new Map();
    this.eufy = new EufyMega({
      email,
      password,
      countryCode: countryCode || "US",
      store: new FileSessionStore(join(dataDir, "session.json")),
      pushStore: new FileFcmStore(join(dataDir, "push.json")),
      logger: this.sdkLogger(),
    });
    this.eufy.on("error", (err) => this.noteError(err));
    this.eufy.on("connect", () => this.log("info", "realtime connected"));
    this.eufy.on("disconnect", () => this.log("warn", "realtime disconnected"));
    this.eufy.on("event", (e) => this.onVendorEvent(e));
    if (brokerIp) this.pinCommandBroker(brokerIp);
  }

  /**
   * Sends lock commands through one broker instance. Several instances behind the Eufy broker
   * hostname accept a subscription for a lock, but only the one holding the lock's own session
   * delivers to it, and the SDK takes the first one DNS returns. Commands through the others are
   * accepted and silently dropped. Find the right instance with `npm run diag:listen` while
   * operating the lock from the Eufy app.
   *
   * The SDK's own discovery and connection are kept; only the chosen instance is replaced. This
   * reaches into SDK internals (MqttCommandRouter.ensureSecurityMqttFor, SecureMqtt options), so
   * re-check it after any eufy-sdk upgrade.
   */
  pinCommandBroker(brokerIp) {
    const router = this.eufy.mqtt;
    const discover = router?.ensureSecurityMqttFor?.bind(router);
    if (!discover) {
      this.log("error", "cannot pin the command broker: the SDK internals changed");
      return;
    }
    router.ensureSecurityMqttFor = async (dev) => {
      const chosen = await discover(dev);
      if (chosen.instanceIp === brokerIp) return chosen;
      await chosen.mqtt.disconnect();
      chosen.mqtt.o.instanceIp = brokerIp;
      await chosen.mqtt.connect();
      this.log("info", "command broker pinned", { discovered: chosen.instanceIp, used: brokerIp });

      return { mqtt: chosen.mqtt, instanceIp: brokerIp };
    };
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
    return {
      status: this.status,
      locks: this.locks.size,
      last_sync_at: this.lastSyncAt,
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

  async readState(sn) {
    const lock = (await this.eufy.getDevice(sn)).lock?.();
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
   */
  async send(sn, action) {
    let ack = null;
    const onAck = (info) => {
      if (info?.sn === sn && info?.kind === "ff09-actuate") ack = info;
    };
    this.eufy.on("commandAck", onAck);
    try {
      const lock = (await this.eufy.getDevice(sn)).lock();
      await (action === "lock" ? lock.lock() : lock.unlock());
    } finally {
      this.eufy.off("commandAck", onAck);
    }

    return { deviceAcked: ack === null ? null : ack.acked === true, broker: ack?.instanceIp ?? null };
  }

  /**
   * Passes on only the SDK's command-delivery lines (broker choice, missing replies). The rest of its
   * debug output is too noisy for the bridge log.
   */
  sdkLogger() {
    const relevant = /dispatchFf09|broker|instance/i;
    const pass = (level) => (message) => {
      if (relevant.test(String(message))) this.log(level, `sdk: ${String(message).slice(0, 300)}`);
    };

    return { debug: pass("info"), info: pass("info"), warn: pass("warn"), error: pass("error") };
  }

  noteError(err) {
    this.lastError = { message: String(err?.message ?? err).slice(0, 200), at: new Date().toISOString() };
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
