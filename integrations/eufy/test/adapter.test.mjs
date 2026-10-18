// EufyAdapter cloud-health tests with a fake Eufy client. Never touches Eufy or a real lock.

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { EufyAdapter, StaleStateError, CommandNotSentError, DEGRADED_AFTER_SILENT_MS } from "../src/bridge/eufy-adapter.mjs";

const FRONT = "T85D0FRONT0001";
const BACK = "T85D0BACK00002";
const PARAMS = "/app/devicemanage/get_device_param_list";
const LIST = "/app/house/get_devs_list";

/**
 * Behaves like eufy-sdk's getDevice(): fetch the device's params, and when that fails fall back to
 * the device list, and when that fails too, answer from the cached list without an error.
 */
class FakeEufy extends EventEmitter {
  constructor() {
    super();
    this.fail = new Set();
    this.mega = {
      post: async (service, path) => {
        if (this.fail.has(path)) {
          const err = new Error(path === PARAMS && this.ownerOnly ? "Only the owner can change settings" : "fetch failed");
          if (path === PARAMS && this.ownerOnly) err.code = 20004;
          throw err;
        }
        return {};
      },
    };
  }

  async getDevice(sn) {
    try {
      await this.mega.post("devicemanage", PARAMS, { device_sns: [sn] });
    } catch {
      try {
        await this.mega.post("house", LIST, {});
      } catch {
        // The SDK swallows this and uses its cache.
      }
    }
    return { lock: () => ({ locked: true, battery: 80 }) };
  }
}

function adapterWith(eufy, clock = { ms: 1_000_000 }) {
  return new EufyAdapter({ eufy, now: () => clock.ms });
}

test("a read whose state fetch succeeded is answered", async () => {
  const adapter = adapterWith(new FakeEufy());
  const state = await adapter.readState(FRONT);
  assert.equal(state.state, "locked");
  assert.equal(adapter.degraded(), null);
});

test("a read that fell back to the cached list is refused and marks the cloud degraded", async () => {
  const eufy = new FakeEufy();
  eufy.fail = new Set([PARAMS, LIST]);
  const adapter = adapterWith(eufy);
  adapter.status = "connected";

  await assert.rejects(adapter.readState(FRONT), StaleStateError);
  assert.equal(adapter.degraded(), "cloud_errors");
  assert.equal(adapter.health().status, "degraded");

  eufy.fail.clear();
  await adapter.readState(FRONT);
  assert.equal(adapter.degraded(), null);
  assert.equal(adapter.health().status, "connected");
});

test("the device list counts as a fresh read when the per-lock fetch is owner-gated", async () => {
  const eufy = new FakeEufy();
  eufy.ownerOnly = true;
  eufy.fail = new Set([PARAMS]);
  const adapter = adapterWith(eufy);

  assert.equal((await adapter.readState(FRONT)).state, "locked");
  assert.equal(adapter.degraded(), null);
});

test("one lock's fresh fetch does not vouch for another lock's failed one", async () => {
  const eufy = new FakeEufy();
  const adapter = adapterWith(eufy);
  await adapter.readState(BACK);

  eufy.fail = new Set([PARAMS, LIST]);
  await assert.rejects(adapter.readState(FRONT), StaleStateError);
});

test("a cloud that has not answered for too long is degraded", async () => {
  const clock = { ms: 1_000_000 };
  const adapter = adapterWith(new FakeEufy(), clock);
  await adapter.readState(FRONT);

  clock.ms += DEGRADED_AFTER_SILENT_MS + 1;
  assert.equal(adapter.degraded(), "cloud_silent");
});

test("a device list the SDK reuses from moments ago counts as fresh, an older one does not", async () => {
  const clock = { ms: 1_000_000 };
  const eufy = new FakeEufy();
  const adapter = adapterWith(eufy, clock);
  await eufy.mega.post("house", LIST, {});

  // Owner-gated lock: the SDK skips the per-lock fetch and reuses the recent list.
  eufy.getDevice = async () => ({ lock: () => ({ locked: false }) });
  clock.ms += 3_000;
  assert.equal((await adapter.readState(BACK)).state, "unlocked");

  clock.ms += 10_000;
  await assert.rejects(adapter.readState(BACK), StaleStateError);
});

/**
 * The SDK's command path for a T85D0: lock()/unlock() find the broker instance through the router
 * (ensureSecurityMqttFor), then publish on that one-shot connection.
 */
class CommandEufy extends FakeEufy {
  constructor({ discoverMs = 0 } = {}) {
    super();
    this.published = [];
    this.disconnects = 0;
    const eufy = this;
    this.mqtt = {
      async ensureSecurityMqttFor(dev) {
        await new Promise((r) => setTimeout(r, discoverMs));
        const mqtt = {
          o: { instanceIp: "198.51.100.1" },
          async publish(topic) {
            eufy.published.push(topic);
          },
          async disconnect() {
            eufy.disconnects += 1;
          },
          async connect() {},
        };
        return { mqtt, instanceIp: "198.51.100.1" };
      },
    };
  }

  async getDevice(sn) {
    const router = this.mqtt;
    return {
      lock: () => ({
        lock: async () => {
          const { mqtt } = await router.ensureSecurityMqttFor({ sn });
          await mqtt.publish(`cmd/${sn}/req`);
          await mqtt.disconnect();
        },
        unlock: async () => {
          const { mqtt } = await router.ensureSecurityMqttFor({ sn });
          await mqtt.publish(`cmd/${sn}/req`);
          await mqtt.disconnect();
        },
      }),
    };
  }
}

test("a command publishes once and records that it did", async () => {
  const eufy = new CommandEufy();
  const adapter = new EufyAdapter({ eufy });
  const control = { signal: new AbortController().signal, published: false };

  await adapter.send(FRONT, "lock", control);

  assert.equal(adapter.publishGuarded, true);
  assert.equal(control.published, true);
  assert.deepEqual(eufy.published, [`cmd/${FRONT}/req`]);
});

test("a command whose deadline passed during broker discovery is never published", async () => {
  const eufy = new CommandEufy({ discoverMs: 30 });
  const adapter = new EufyAdapter({ eufy });
  const deadline = new AbortController();
  const control = { signal: deadline.signal, published: false };

  const sending = adapter.send(FRONT, "unlock", control);
  setTimeout(() => deadline.abort(), 5);

  await assert.rejects(sending, CommandNotSentError);
  assert.equal(control.published, false);
  assert.deepEqual(eufy.published, []);
  assert.equal(eufy.disconnects, 1, "the one-shot connection is closed");
});

test("a command aborted before it starts is never published", async () => {
  const eufy = new CommandEufy();
  const adapter = new EufyAdapter({ eufy });

  await assert.rejects(adapter.send(FRONT, "unlock", { signal: AbortSignal.abort(), published: false }), CommandNotSentError);
  assert.deepEqual(eufy.published, []);
});

test("the command broker is pinned when configured", async () => {
  const eufy = new CommandEufy();
  const logs = [];
  const adapter = new EufyAdapter({ eufy, brokerIp: "203.0.113.9", log: (level, msg, extra) => logs.push({ msg, extra }) });

  await adapter.send(FRONT, "lock", { signal: new AbortController().signal, published: false });

  assert.ok(logs.some((l) => l.msg === "command broker pinned" && l.extra.used === "203.0.113.9"));
  assert.ok(logs.some((l) => l.msg === "command step: publishing"));
});

test("without the SDK hook, commands still send but cannot be proved unsent", async () => {
  const adapter = new EufyAdapter({ eufy: new FakeEufy() });
  assert.equal(adapter.publishGuarded, false);
});
