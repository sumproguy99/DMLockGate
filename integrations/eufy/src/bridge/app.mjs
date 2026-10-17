// The bridge's internal HTTP API. Only LockGuard calls it, with HMAC-signed requests.
//
// SAFETY
// - A command is sent at most once: each command_id is accepted once, and one command per lock may be
//   in flight at a time.
// - The response says whether the command was certainly NOT delivered ("rejected") or might have been
//   ("ambiguous"). "acknowledged" means the vendor accepted delivery, never that the bolt moved.
// - Nothing here retries a command.

import { createServer } from "node:http";
import { verify } from "./auth.mjs";

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

    let timer;
    try {
      const sent = await Promise.race([
        adapter.send(sn, action),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`no acknowledgement within ${commandTimeoutMs} ms`)), commandTimeoutMs);
        }),
      ]);
      const latencyMs = Date.now() - startedAt;
      if (sent?.deviceAcked === false) {
        // The broker took the message but the lock never replied. It may still have acted.
        log("warn", "lock did not acknowledge", { command_id: commandId, broker: sent.broker, latency_ms: latencyMs });

        return [502, { result: "ambiguous", error: "no_device_ack", latency_ms: latencyMs }];
      }
      log("info", "command acknowledged", { command_id: commandId, device_acked: sent?.deviceAcked ?? null, broker: sent?.broker ?? null, latency_ms: latencyMs });

      return [200, { result: "acknowledged", device_acked: sent?.deviceAcked ?? null, latency_ms: latencyMs }];
    } catch (err) {
      log("warn", "command outcome unknown", { command_id: commandId, error: err?.message });

      return [502, { result: "ambiguous", error: String(err?.message ?? err).slice(0, 200), latency_ms: Date.now() - startedAt }];
    } finally {
      clearTimeout(timer);
      inFlight.delete(sn);
    }
  }

  async function route(method, path, body) {
    if (method === "GET" && path === "/v1/health") {
      return [200, adapter.health()];
    }
    if (method === "GET" && path === "/v1/locks") {
      if (!adapter.ready()) return [503, { error: "eufy_not_connected" }];
      return [200, { data: await adapter.listLocks() }];
    }

    const state = path.match(/^\/v1\/locks\/([A-Za-z0-9_-]{4,64})\/state$/);
    if (method === "GET" && state) {
      if (!adapter.ready()) return [503, { error: "eufy_not_connected" }];
      if (!(await adapter.hasLock(state[1]))) return [404, { error: "unknown_lock" }];
      return [200, { data: await adapter.readState(state[1]) }];
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
