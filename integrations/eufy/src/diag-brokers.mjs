// Read-only diagnostic: which Eufy MQTT broker instances accept a SUBSCRIBE for a lock's topics.
// Never publishes and never sends a command. Usage: npm run diag:brokers -- "Front Door"

import { join } from "node:path";
import {
  EufyMega,
  FileSessionStore,
  FileFcmStore,
  LoginStatus,
  probeBrokerInstance,
  resolveBrokerIps,
  mergeCandidateIps,
  mqttUuidFrom,
  secureTopic,
} from "@mega-yfue/eufy-sdk";

const DATA_DIR = join(import.meta.dirname, "..", "data");
// The SDK's own fallback list (MqttCommandRouter.KNOWN_AIOT_BROKER_IPS in 0.4.0).
const KNOWN_IPS = ["3.139.229.186", "18.224.90.2", "3.138.226.206", "3.138.64.16", "3.139.229.1", "3.147.137.189", "52.39.57.62", "52.42.98.25"];
const doorName = process.argv.slice(2).join(" ").trim();

const eufy = new EufyMega({
  email: process.env.EUFY_USERNAME,
  password: process.env.EUFY_PASSWORD,
  countryCode: process.env.EUFY_COUNTRY || "US",
  store: new FileSessionStore(join(DATA_DIR, "session.json")),
  pushStore: new FileFcmStore(join(DATA_DIR, "push.json")),
});

const res = await eufy.login();
if (res.status !== LoginStatus.Ok) {
  console.error(`Login needs ${res.status}. Run "npm run poc:readonly" first.`);
  process.exit(1);
}

const dev = (await eufy.getDevices()).find((d) => d.model?.startsWith("T85D0") && (!doorName || d.name === doorName));
if (!dev) {
  console.error(`No T85D0 named "${doorName}".`);
  process.exit(1);
}
console.log("device", { name: dev.name, model: dev.model, category: dev.category, deviceClass: dev.deviceClass, api: dev.api });

const creds = await eufy.mega.getUserMqttInfo("eufy_security");
const dnsIps = await resolveBrokerIps(creds.endpoint_addr);
console.log("broker host", creds.endpoint_addr, "DNS answers", dnsIps);

const topics = [...new Set([secureTopic(dev, "res"), `cmd/eufy_security/${dev.model}/${dev.sn}/res`])];
const mqttUuid = mqttUuidFrom(eufy.mega.openudid);
for (const topic of topics) {
  console.log(`\ntopic ${topic.replace(dev.sn, dev.sn.slice(0, 5) + "…")}`);
  for (const ip of mergeCandidateIps(dnsIps, KNOWN_IPS)) {
    const r = await probeBrokerInstance(ip, {
      hostname: creds.endpoint_addr,
      port: creds.endpoint_port,
      certificate_pem: creds.certificate_pem,
      private_key: creds.private_key,
      aws_root_ca1_pem: creds.aws_root_ca1_pem,
    }, {
      clientId: `android-eufy_security-${creds.user_id ?? ""}-${mqttUuid}-${Math.floor(Date.now() / 1000)}`,
      topic,
      timeoutMs: 8000,
    });
    console.log(`  ${ip.padEnd(16)} ${dnsIps.includes(ip) ? "dns " : "seed"} ${r.granted ? "GRANTED" : "denied "} qos=${r.grantedQos ?? "-"} ${r.ms}ms ${r.error ?? ""}`);
  }
}

await eufy.disconnect().catch(() => {});
process.exit(0);
