// DM LockGuard Eufy bridge. Run: npm run bridge
//
// Listens on 127.0.0.1 only by default. LockGuard is the only client; every request must be signed
// with LOCKGUARD_BRIDGE_SECRET.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createBridgeServer, mask } from "./app.mjs";
import { EufyAdapter } from "./eufy-adapter.mjs";
import { createForwarder } from "./forwarder.mjs";

const log = (level, msg, extra) =>
  console.log(`${new Date().toISOString()} [${level}] ${msg}${extra === undefined ? "" : " " + JSON.stringify(extra)}`);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    log("error", `Missing ${name}. See .env.example.`);
    process.exit(2);
  }
  return value;
}

const dataDir = join(import.meta.dirname, "..", "..", "data");
mkdirSync(dataDir, { recursive: true });

const secret = requireEnv("LOCKGUARD_BRIDGE_SECRET");
const host = process.env.BRIDGE_HOST || "127.0.0.1";
const port = Number(process.env.BRIDGE_PORT || 8787);

const adapter = new EufyAdapter({
  email: requireEnv("EUFY_USERNAME"),
  password: requireEnv("EUFY_PASSWORD"),
  countryCode: process.env.EUFY_COUNTRY,
  brokerIp: process.env.EUFY_MQTT_BROKER_IP || null,
  dataDir,
  log,
});

const forward = createForwarder({ url: requireEnv("LOCKGUARD_EVENTS_URL"), secret, log });
adapter.on("state", (event) => {
  log("info", "lock event", { lock: mask(event.external_id), kind: event.kind, state: event.state, event_type: event.event_type });
  void forward(event);
});

const server = createBridgeServer({ adapter, secret, log });
server.listen(port, host, () => log("info", `bridge listening on http://${host}:${port}`));

adapter.start().catch((err) => {
  adapter.status = "error";
  adapter.noteError(err);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    log("info", "shutting down");
    server.close();
    await adapter.stop();
    process.exit(0);
  });
}
