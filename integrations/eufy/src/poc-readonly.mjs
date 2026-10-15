// DM LockGuard - Phase Zero read-only proof of concept for the Eufy T85D0 (Smart Lock C30).
//
// SAFETY: this script never calls lock(), unlock(), setAutoLock() or any other write.
// It only logs in, discovers devices, reads reported state, and listens for events.
//
// Run:  npm run poc:readonly   (credentials come from .env, see .env.example)

import { mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { EufyMega, FileSessionStore, FileFcmStore, LoginStatus } from "@mega-yfue/eufy-sdk";

const TARGET_MODEL = "T85D0";
const DATA_DIR = join(import.meta.dirname, "..", "data");
const LISTEN_SECONDS = Number(process.env.POC_LISTEN_SECONDS ?? 120);

const log = (step, msg, extra) =>
  console.log(`${new Date().toISOString()} [${step}] ${msg}${extra === undefined ? "" : " " + JSON.stringify(extra)}`);

// Serial numbers identify a physical lock; show only enough to tell devices apart.
const maskSn = (sn) => (sn && sn.length > 6 ? `${sn.slice(0, 5)}…${sn.slice(-3)}` : sn);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(2);
  }
  return v;
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function login(eufy) {
  let res = await eufy.login();
  for (let attempt = 0; attempt < 3 && res.status !== LoginStatus.Ok; attempt++) {
    if (res.status === LoginStatus.Captcha) {
      const file = join(DATA_DIR, "captcha.png");
      writeFileSync(file, Buffer.from(res.image.replace(/^data:image\/\w+;base64,/, ""), "base64"));
      log("auth", `Captcha required. Open ${file}`);
      res = await eufy.solveCaptcha(await ask("Captcha answer: "));
    } else if (res.status === LoginStatus.TwoFactor) {
      log("auth", `Verification code sent via ${res.method}`);
      res = await eufy.submitVerifyCode(await ask("Verification code: "));
    }
  }
  if (res.status !== LoginStatus.Ok) throw new Error(`Login did not complete (last status: ${res.status})`);
  log("auth", "Authenticated");
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  const eufy = new EufyMega({
    email: requireEnv("EUFY_USERNAME"),
    password: requireEnv("EUFY_PASSWORD"),
    countryCode: process.env.EUFY_COUNTRY || "US",
    store: new FileSessionStore(join(DATA_DIR, "session.json")),
    pushStore: new FileFcmStore(join(DATA_DIR, "push.json")),
  });

  eufy.on("error", (err) => log("error", err?.message ?? String(err)));
  eufy.on("connect", () => log("realtime", "connected"));
  eufy.on("disconnect", (reason) => log("realtime", "disconnected", { reason: String(reason ?? "") }));

  // 1. Authenticate
  await login(eufy);

  // 2. Wait for realtime transports (MQTT/push) so state reports can arrive
  try {
    const rt = await eufy.waitForRealtime({ timeoutMs: 30_000 });
    log("realtime", "readiness", rt);
  } catch (err) {
    log("realtime", `not ready: ${err.message}`);
  }

  // 3. Discover
  const devices = await eufy.getDevices();
  log("discover", `${devices.length} device(s) on account`);
  for (const d of devices) {
    log("discover", "device", { sn: maskSn(d.sn), name: d.name, model: d.model, class: d.deviceClass, realtime: d.realtime });
  }
  const targets = devices.filter((d) => d.model?.toUpperCase().startsWith(TARGET_MODEL));
  if (targets.length === 0) {
    log("discover", `No ${TARGET_MODEL} found. Check that the lock is shared with this account.`);
  }

  // 4. Read reported state
  for (const t of targets) {
    const dev = await eufy.getDevice(t.sn);
    const lock = dev.lock?.();
    log("state", `${t.name ?? maskSn(t.sn)}`, {
      capabilities: dev.capabilities,
      locked: lock?.locked ?? "not reported",
      battery: lock?.battery ?? "not reported",
      rssi: lock?.rssi ?? "not reported",
      lastSeen: eufy.deviceState(t.sn)?.lastSeenMs ? new Date(eufy.deviceState(t.sn).lastSeenMs).toISOString() : "unknown",
      availability: eufy.deviceAvailability(t.sn) ?? "unknown",
    });
    log("state", "all reported properties", dev.getProperties());
  }

  // 5. Listen for live events (operate the lock by hand or from the Eufy app to see them)
  const targetSns = new Set(targets.map((t) => t.sn));
  eufy.on("event", (e) => {
    if (e?.deviceSn && !targetSns.has(e.deviceSn)) return;
    log("event", e?.eventName ?? "event", {
      ...e,
      deviceSn: maskSn(e?.deviceSn),
      stationSn: maskSn(e?.stationSn),
      device_sn: maskSn(e?.device_sn),
      user_id: e?.user_id ? "[redacted]" : undefined,
      receivedAt: new Date().toISOString(),
      eventTime: e?.event_time ? new Date(e.event_time).toISOString() : undefined,
    });
  });
  log("listen", `Listening ${LISTEN_SECONDS}s. Lock/unlock by hand or in the Eufy app to test event delivery.`);
  await new Promise((r) => setTimeout(r, LISTEN_SECONDS * 1000));

  for (const t of targets) {
    const lock = (await eufy.getDevice(t.sn)).lock?.();
    log("state", `final ${t.name ?? maskSn(t.sn)}`, { locked: lock?.locked ?? "not reported", battery: lock?.battery ?? "not reported" });
  }

  await eufy.disconnect();
  log("done", "Read-only PoC finished. No commands were sent to any lock.");
}

main().catch((err) => {
  log("fatal", err?.stack ?? String(err));
  process.exit(1);
});
