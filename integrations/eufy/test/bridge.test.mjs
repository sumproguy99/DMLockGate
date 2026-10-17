// Bridge tests with a fake adapter. Never touches Eufy or a real lock.
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createBridgeServer } from "../src/bridge/app.mjs";
import { signedHeaders, sign, verify } from "../src/bridge/auth.mjs";
import { createForwarder } from "../src/bridge/forwarder.mjs";

const SECRET = "test-secret-test-secret-test-secret-123";
const SN = "T85D0ABCDEF123";

class FakeAdapter extends EventEmitter {
  constructor() {
    super();
    this.connected = true;
    this.sent = [];
    this.sendImpl = async () => {};
  }
  ready() { return this.connected; }
  health() { return { status: this.connected ? "connected" : "needs_login" }; }
  async hasLock(sn) { return sn === SN; }
  async listLocks() { return [{ external_id: SN, name: "Front Door", model: "T85D0", firmware_version: null }]; }
  async readState(sn) { return { external_id: sn, state: "locked", battery_level: 80, observed_at: new Date().toISOString() }; }
  async send(sn, action) { this.sent.push({ sn, action }); return this.sendImpl(); }
}

async function withServer(adapter, fn, options = {}) {
  const server = createBridgeServer({ adapter, secret: SECRET, ...options });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(async (method, path, payload, { secret = SECRET, headers, now } = {}) => {
      const body = payload === undefined ? "" : JSON.stringify(payload);
      const res = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", ...(headers ?? signedHeaders(secret, method, path, body, now)) },
        body: body === "" ? undefined : body,
      });
      return { status: res.status, json: await res.json() };
    });
  } finally {
    server.close();
  }
}

test("refuses a short secret", () => {
  assert.throws(() => createBridgeServer({ adapter: new FakeAdapter(), secret: "short" }));
});

test("rejects unsigned and wrongly signed requests without sending", async () => {
  const adapter = new FakeAdapter();
  await withServer(adapter, async (call) => {
    assert.equal((await call("GET", "/v1/health", undefined, { headers: {} })).status, 401);
    const bad = await call("POST", `/v1/locks/${SN}/commands`, { action: "unlock", command_id: "abcdefgh-1" }, { secret: "x".repeat(40) });
    assert.equal(bad.status, 401);
    assert.equal(bad.json.result, "rejected");
  });
  assert.equal(adapter.sent.length, 0);
});

test("refuses a replayed signature", async () => {
  const adapter = new FakeAdapter();
  await withServer(adapter, async (call) => {
    const headers = signedHeaders(SECRET, "GET", "/v1/health", "");
    assert.equal((await call("GET", "/v1/health", undefined, { headers })).status, 200);
    assert.equal((await call("GET", "/v1/health", undefined, { headers })).status, 401);
  });
});

test("refuses a stale timestamp", () => {
  const ts = String(Math.floor(Date.now() / 1000) - 300);
  const signature = sign(SECRET, ts, "GET", "/v1/health", "");
  assert.equal(verify(SECRET, { timestamp: ts, signature, method: "GET", path: "/v1/health", body: "" }, new Map()), "stale_timestamp");
});

test("sends once and reports acknowledged", async () => {
  const adapter = new FakeAdapter();
  await withServer(adapter, async (call) => {
    const res = await call("POST", `/v1/locks/${SN}/commands`, { action: "lock", command_id: "cmd-0000001" });
    assert.equal(res.status, 200);
    assert.equal(res.json.result, "acknowledged");
  });
  assert.deepEqual(adapter.sent, [{ sn: SN, action: "lock" }]);
});

test("a repeated command id is never sent again", async () => {
  const adapter = new FakeAdapter();
  await withServer(adapter, async (call) => {
    await call("POST", `/v1/locks/${SN}/commands`, { action: "unlock", command_id: "cmd-0000002" });
    const again = await call("POST", `/v1/locks/${SN}/commands`, { action: "unlock", command_id: "cmd-0000002" }, { now: Date.now() + 1500 });
    assert.equal(again.status, 409);
    assert.equal(again.json.result, "ambiguous");
  });
  assert.equal(adapter.sent.length, 1);
});

test("a send the lock never acknowledged is ambiguous, not acknowledged", async () => {
  const adapter = new FakeAdapter();
  adapter.sendImpl = async () => ({ deviceAcked: false, broker: "203.0.113.7" });
  await withServer(adapter, async (call) => {
    const res = await call("POST", `/v1/locks/${SN}/commands`, { action: "lock", command_id: "cmd-0000009" });
    assert.equal(res.status, 502);
    assert.equal(res.json.result, "ambiguous");
    assert.equal(res.json.error, "no_device_ack");
  });
  assert.equal(adapter.sent.length, 1);
});

test("a send error or timeout is ambiguous, never retried", async () => {
  const adapter = new FakeAdapter();
  adapter.sendImpl = () => new Promise(() => {});
  await withServer(adapter, async (call) => {
    const res = await call("POST", `/v1/locks/${SN}/commands`, { action: "unlock", command_id: "cmd-0000003" });
    assert.equal(res.status, 502);
    assert.equal(res.json.result, "ambiguous");
  }, { commandTimeoutMs: 50 });
  assert.equal(adapter.sent.length, 1);
});

test("refuses commands while the Eufy cloud is degraded, without sending", async () => {
  const adapter = new FakeAdapter();
  adapter.degraded = () => "cloud_errors";
  await withServer(adapter, async (call) => {
    const res = await call("POST", `/v1/locks/${SN}/commands`, { action: "lock", command_id: "cmd-0000010" });
    assert.equal(res.status, 503);
    assert.equal(res.json.result, "rejected");
    assert.equal(res.json.error, "eufy_degraded");
  });
  assert.equal(adapter.sent.length, 0);
});

test("a state read without fresh cloud data is refused, not answered from cache", async () => {
  const adapter = new FakeAdapter();
  adapter.readState = async () => {
    const err = new Error("not fresh");
    err.name = "StaleStateError";
    throw err;
  };
  await withServer(adapter, async (call) => {
    const res = await call("GET", `/v1/locks/${SN}/state`);
    assert.equal(res.status, 503);
    assert.equal(res.json.error, "eufy_degraded");
  });
});

test("rejects before sending when disconnected, unknown lock, invalid action or busy", async () => {
  const adapter = new FakeAdapter();
  let release;
  adapter.sendImpl = () => new Promise((r) => { release = r; });
  await withServer(adapter, async (call) => {
    assert.equal((await call("POST", "/v1/locks/OTHERLOCK1/commands", { action: "lock", command_id: "cmd-0000004" })).json.result, "rejected");
    assert.equal((await call("POST", `/v1/locks/${SN}/commands`, { action: "open", command_id: "cmd-0000005" })).status, 422);

    const first = call("POST", `/v1/locks/${SN}/commands`, { action: "lock", command_id: "cmd-0000006" });
    await new Promise((r) => setTimeout(r, 20));
    const busy = await call("POST", `/v1/locks/${SN}/commands`, { action: "lock", command_id: "cmd-0000007" });
    assert.equal(busy.status, 423);
    assert.equal(busy.json.result, "rejected");
    release();
    assert.equal((await first).json.result, "acknowledged");

    adapter.connected = false;
    const offline = await call("POST", `/v1/locks/${SN}/commands`, { action: "lock", command_id: "cmd-0000008" });
    assert.equal(offline.status, 503);
    assert.equal(offline.json.result, "rejected");
  });
  assert.equal(adapter.sent.length, 1);
});

test("reads state and lists locks", async () => {
  await withServer(new FakeAdapter(), async (call) => {
    assert.equal((await call("GET", `/v1/locks/${SN}/state`)).json.data.state, "locked");
    assert.equal((await call("GET", "/v1/locks")).json.data[0].external_id, SN);
    assert.equal((await call("GET", "/v1/locks/OTHERLOCK1/state")).status, 404);
  });
});

test("forwarder signs events and retries server errors only", async () => {
  const calls = [];
  const responses = [{ ok: false, status: 503 }, { ok: true, status: 202 }];
  const forward = createForwarder({
    url: "http://lockguard.test/api/internal/eufy/events",
    secret: SECRET,
    delay: async () => {},
    fetchImpl: async (url, init) => { calls.push(init); return responses.shift(); },
  });

  assert.equal(await forward({ kind: "state", external_id: SN, state: "locked" }), true);
  assert.equal(calls.length, 2);
  const { "X-LockGuard-Timestamp": ts, "X-LockGuard-Signature": signature } = calls[0].headers;
  assert.equal(verify(SECRET, { timestamp: ts, signature, method: "POST", path: "/api/internal/eufy/events", body: calls[0].body }, new Map()), null);

  const refused = createForwarder({ url: "http://lockguard.test/x", secret: SECRET, delay: async () => {}, fetchImpl: async () => ({ ok: false, status: 401 }) });
  assert.equal(await refused({}), false);
});
