// The bridge's internal HTTP API. Only LockGuard calls it, with HMAC-signed requests.
//
// SAFETY
// - A command is sent at most once: each command_id is accepted once, and one command per lock may be
//   in flight at a time.
// - The response says whether the command was certainly NOT delivered ("rejected") or might have been
//   ("ambiguous"). "acknowledged" means the vendor accepted delivery, never that the bolt moved.
// - Nothing here retries a command.
// - When a command takes too long the bridge gives up and the adapter's publish guard stops it from
//   being published later. If it had not been published yet the reply is "rejected" (certainly not
//   sent); otherwise "ambiguous".

import { createServer } from "node:http";
import { verify } from "./auth.mjs";
import { ERROR_TEXT_MAX } from "./eufy-adapter.mjs";

const COMMAND_ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_BODY_BYTES = 16 * 1024;

/**
 * @param {object} options
 * @param {import("./eufy-adapter.mjs").EufyAdapter} options.adapter
 * @param {string} options.secret
 * @param {number} [options.commandTimeoutMs]
 * @param {(level: string, msg: string, extra?: object) => void} [options.log]
 */
export function createBridgeServer({ adapter, secret, commandTimeoutMs = 25_000, log = () => {} }) {
  if (!secret || secret.length < 32) {
    throw new Error("LOCKGUARD_BRIDGE_SECRET must be at least 32 characters.");
  }

  const seenSignatures = new Map();
  const acceptedCommandIds = new Map();
  const inFlight = new Set();
  /** Recent command outcomes, reported in /v1/health so a failing command path is visible. */
  const commands = { consecutiveFailures: 0, lastFailure: null, lastFailureAt: null, lastSuccessAt: null };
  const noteFailure = (reason) => {
    commands.consecutiveFailures += 1;
    commands.lastFailure = String(reason).slice(0, ERROR_TEXT_MAX);
    commands.lastFailureAt = new Date().toISOString();
  };

  async function sendCommand(sn, body) {
    const { action, command_id: commandId } = body ?? {};
    if (!["lock", "unlock"].includes(action) || typeof commandId !== "string" || !COMMAND_ID.test(commandId)) {
      return [422, { result: "rejected", error: "invalid_command" }];
    }
    if (acceptedCommandIds.has(commandId)) {
      // It may have been sent already; the caller must reconcile from reported state.
      return [409, { result: "ambiguous", error: "duplicate_command_id" }];
    }
    if (!adapter.ready()) {
      return [503, { result: "rejected", error: "eufy_not_connected" }];
    }
    if (adapter.degraded?.()) {
      // The outcome could not be confirmed, so the command is not sent at all.
      return [503, { result: "rejected", error: "eufy_degraded" }];
    }
    if (!(await adapter.hasLock(sn))) {
      return [404, { result: "rejected", error: "unknown_lock" }];
    }
    if (inFlight.has(sn)) {
      return [423, { result: "rejected", error: "lock_busy" }];
    }

    acceptedCommandIds.set(commandId, Date.now());
    inFlight.add(sn);
    const startedAt = Date.now();
    log("info", "command sending", { lock: mask(sn), action, command_id: commandId });

    const deadline = new AbortController();
    const control = { signal: deadline.signal, published: false };
    let timer;
    let timedOut = false;
    try {
      const sent = await Promise.race([
        adapter.send(sn, action, control),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            // Abort first: from here on the adapter's guard refuses to publish, so control.published
            // can no longer change.
            timedOut = true;
            deadline.abort();
            reject(new Error(`no acknowledgement within ${commandTimeoutMs} ms`));
          }, commandTimeoutMs);
        }),
      ]);
      const latencyMs = Date.now() - startedAt;
      if (sent?.deviceAcked === false) {
        // The broker took the message but the lock never replied. It may still have acted.
        log("warn", "lock did not acknowledge", { command_id: commandId, broker: sent.broker, latency_ms: latencyMs });
        noteFailure("The lock did not acknowledge the command.");

        return [502, { result: "ambiguous", error: "no_device_ack", latency_ms: latencyMs }];
      }
      log("info", "command acknowledged", { command_id: commandId, device_acked: sent?.deviceAcked ?? null, broker: sent?.broker ?? null, latency_ms: latencyMs });
      commands.consecutiveFailures = 0;
      commands.lastSuccessAt = new Date().toISOString();

      return [200, { result: "acknowledged", device_acked: sent?.deviceAcked ?? null, latency_ms: latencyMs }];
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      // Unsent is claimed only on proof: the guard refused it, or it timed out while still in a
      // stage the guard covers and had not started publishing.
      const guardedStage = control.stage === "lookup" || control.stage === "broker";
      const notSent =
        err?.name === "CommandNotSentError" || (timedOut && adapter.publishGuarded === true && guardedStage && !control.published);
      if (notSent) {
        log("warn", "command not sent", { command_id: commandId, error: err?.message, latency_ms: latencyMs });
        noteFailure(`Not sent: ${err?.message}`);

        // detail says why, for LockGuard's diagnostics: for "not_sent", every broker's answer.
        const detail = err?.message ? String(err.message).slice(0, ERROR_TEXT_MAX) : null;

        return [504, { result: "rejected", error: timedOut ? "not_sent_timeout" : "not_sent", detail, latency_ms: latencyMs }];
      }
      log("warn", "command outcome unknown", { command_id: commandId, error: err?.message, stage: control.stage ?? null, published: control.published });
      noteFailure(err?.message ?? err);

      return [502, { result: "ambiguous", error: String(err?.message ?? err).slice(0, ERROR_TEXT_MAX), latency_ms: latencyMs }];
    } finally {
      clearTimeout(timer);
      inFlight.delete(sn);
    }
  }

  async function route(method, path, body) {
    if (method === "GET" && path === "/v1/health") {
      return [200, {
        ...adapter.health(),
        commands: {
          consecutive_failures: commands.consecutiveFailures,
          last_failure: commands.lastFailure,
          last_failure_at: commands.lastFailureAt,
          last_success_at: commands.lastSuccessAt,
        },
      }];
    }
    if (method === "GET" && path === "/v1/locks") {
      if (!adapter.ready()) return [503, { error: "eufy_not_connected" }];
      return [200, { data: await adapter.listLocks() }];
    }

    const state = path.match(/^\/v1\/locks\/([A-Za-z0-9_-]{4,64})\/state$/);
    if (method === "GET" && state) {
      if (!adapter.ready()) return [503, { error: "eufy_not_connected" }];
      if (!(await adapter.hasLock(state[1]))) return [404, { error: "unknown_lock" }];
      try {
        return [200, { data: await adapter.readState(state[1]) }];
      } catch (err) {
        if (err?.name !== "StaleStateError") throw err;
        log("warn", "state read not fresh", { lock: mask(state[1]) });

        return [503, { error: "eufy_degraded" }];
      }
    }

    const command = path.match(/^\/v1\/locks\/([A-Za-z0-9_-]{4,64})\/commands$/);
    if (method === "POST" && command) {
      return sendCommand(command[1], body);
    }

    return [404, { error: "not_found" }];
  }

  return createServer((req, res) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", async () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const path = new URL(req.url, "http://bridge").pathname;
      const reply = (status, payload) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      };

      const denied = verify(secret, {
        timestamp: req.headers["x-lockguard-timestamp"],
        signature: req.headers["x-lockguard-signature"],
        method: req.method,
        path,
        body: raw,
      }, seenSignatures);
      if (denied) {
        log("warn", "request refused", { reason: denied, path });
        return reply(401, { result: "rejected", error: "unauthorized" });
      }

      let body = null;
      if (raw !== "") {
        try {
          body = JSON.parse(raw);
        } catch {
          return reply(400, { result: "rejected", error: "invalid_json" });
        }
      }

      try {
        const [status, payload] = await route(req.method, path, body);
        reply(status, payload);
      } catch (err) {
        log("error", "request failed", { path, error: err?.message });
        reply(500, { error: "internal_error" });
      }
    });
  });
}

export const mask = (sn) => (sn && sn.length > 6 ? `${sn.slice(0, 5)}…${sn.slice(-3)}` : sn);
