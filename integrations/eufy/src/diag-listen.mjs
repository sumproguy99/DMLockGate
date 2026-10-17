// Read-only diagnostic: listens on every broker instance that grants a SUBSCRIBE for a lock's topics
// and prints which instance carries the lock's traffic while the operator uses the Eufy app.
// Never publishes and never sends a command. Usage: npm run diag:listen -- "Front Door" [seconds]

import { join } from "node:path";
import tls from "node:tls";
import mqtt from "mqtt";
import { EufyMega, FileSessionStore, FileFcmStore, LoginStatus, resolveBrokerIps, mergeCandidateIps, mqttUuidFrom } from "@mega-yfue/eufy-sdk";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const KNOWN_IPS = ["3.139.229.186", "18.224.90.2", "3.138.226.206", "3.138.64.16", "3.139.229.1", "3.147.137.189", "52.39.57.62", "52.42.98.25"];
const args = process.argv.slice(2);
const seconds = /^\d+$/.test(args.at(-1) ?? "") ? Number(args.pop()) : 120;
const doorName = args.join(" ").trim();
const stamp = () => new Date().toISOString();

const eufy = new EufyMega({
  email: process.env.EUFY_USERNAME,
  password: process.env.EUFY_PASSWORD,
  countryCode: process.env.EUFY_COUNTRY || "US",
  store: new FileSessionStore(join(DATA_DIR, "session.json")),
  pushStore: new FileFcmStore(join(DATA_DIR, "push.json")),
});
if ((await eufy.login()).status !== LoginStatus.Ok) {
  console.error('Login needed. Run "npm run poc:readonly" first.');
  process.exit(1);
}
const dev = (await eufy.getDevices()).find((d) => d.model?.startsWith("T85D0") && (!doorName || d.name === doorName));
if (!dev) {
  console.error(`No T85D0 named "${doorName}".`);
  process.exit(1);
}

const creds = await eufy.mega.getUserMqttInfo("eufy_security");
const mqttUuid = mqttUuidFrom(eufy.mega.openudid);
const topic = `cmd/eufy_security/${dev.model}/${dev.sn}/+`;
const ips = mergeCandidateIps(await resolveBrokerIps(creds.endpoint_addr), KNOWN_IPS);
const clients = [];

for (const ip of ips) {
  // Client ids end in a unix second, so wait a little over a second between connections to keep them distinct.
  await new Promise((r) => setTimeout(r, 1100));
  const client = mqtt.connect({
    host: ip,
    port: creds.endpoint_port ?? 8883,
    protocol: "mqtts",
    servername: creds.endpoint_addr,
    cert: creds.certificate_pem,
    key: creds.private_key,
    ca: creds.aws_root_ca1_pem,
    rejectUnauthorized: true,
    checkServerIdentity: (_host, cert) => tls.checkServerIdentity(creds.endpoint_addr, cert),
    clientId: `android-eufy_security-${creds.user_id ?? ""}-${mqttUuid}-${Math.floor(Date.now() / 1000)}`,
    protocolVersion: 4,
    keepalive: 60,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 8000,
  });
  client.on("connect", () =>
    client.subscribe(topic, { qos: 1 }, (err, granted) => {
      const ok = !err && granted?.[0] && granted[0].qos !== 128;
      console.log(`${stamp()} ${ip.padEnd(16)} ${ok ? "listening" : "subscribe denied"}`);
      if (!ok) client.end(true);
    }),
  );
  client.on("message", (t, payload) => {
    const leg = t.split("/").at(-1);
    console.log(`${stamp()} ${ip.padEnd(16)} MESSAGE on /${leg} (${payload.length} bytes)`);
  });
  client.on("error", () => client.end(true));
  client.on("close", () => {});
  clients.push(client);
}

console.log(`\n${stamp()} Ready. Lock or unlock "${dev.name}" from the Eufy app now. Listening for ${seconds}s.\n`);
setTimeout(async () => {
  clients.forEach((c) => c.end(true));
  await eufy.disconnect().catch(() => {});
  console.log(`${stamp()} done`);
  process.exit(0);
}, seconds * 1000);
