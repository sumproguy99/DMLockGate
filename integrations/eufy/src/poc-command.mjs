// DM LockGuard - Phase Zero COMMAND test for one Eufy T85D0.
//
// SAFETY
// - Physically moves a real lock. Run only with explicit operator authorization, while standing at the door.
// - Unlock additionally requires typing a confirmation phrase at the prompt.
// - Sends exactly one command, never retries (a timed-out command may already have reached the lock).
// - Success is reported only when the lock itself reports the new state (push event or cloud re-read),
//   never because the command call returned.
//
// Run:  npm run poc:lock -- "Front Door"
//       npm run poc:unlock -- "Front Door"

import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { EufyMega, FileSessionStore, FileFcmStore, LoginStatus } from "@mega-yfue/eufy-sdk";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const CONFIRM_TIMEOUT_MS = 45_000;
const POLL_EVERY_MS = 5_000;

const log = (step, msg, extra) =>
  console.log(`${new Date().toISOString()} [${step}] ${msg}${extra === undefined ? "" : " " + JSON.stringify(extra)}`);

const [action, doorName] = process.argv.slice(2);
if (!["lock", "unlock"].includes(action) || !doorName) {
  console.error('Usage: npm run poc:lock -- "<lock name>"   |   npm run poc:unlock -- "<lock name>"');
  process.exit(2);
}
const wantLocked = action === "lock";
const VERB = action.toUpperCase();

const eufy = new EufyMega({
  email: process.env.EUFY_USERNAME,
  password: process.env.EUFY_PASSWORD,
  countryCode: process.env.EUFY_COUNTRY || "US",
  store: new FileSessionStore(join(DATA_DIR, "session.json")),
  pushStore: new FileFcmStore(join(DATA_DIR, "push.json")),
});
eufy.on("error", (err) => log("error", err?.message ?? String(err)));

async function readLocked(sn) {
  return (await eufy.getDevice(sn)).lock?.()?.locked;
}

async function confirmPhrase(phrase) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(`Type exactly "${phrase}" to send the command (anything else cancels): `)).trim() === phrase;
  } finally {
    rl.close();
  }
}

async function main() {
  const res = await eufy.login();
  if (res.status !== LoginStatus.Ok) throw new Error(`Session needs ${res.status}; run poc:readonly first to log in.`);
  await eufy.waitForRealtime({ timeoutMs: 30_000 }).catch((e) => log("realtime", `not ready: ${e.message}`));

  const target = (await eufy.getDevices()).find((d) => d.model?.startsWith("T85D0") && d.name === doorName);
  if (!target) throw new Error(`No T85D0 named "${doorName}" on this account.`);

  const before = await readLocked(target.sn);
  log("precheck", `${doorName} reported locked=${before}`);
  if (before !== !wantLocked) {
    log("abort", `Door is not reported ${wantLocked ? "UNLOCKED" : "LOCKED"}, so ${VERB} would prove nothing. Change it by hand, wait 10 s, and rerun.`);
    return eufy.disconnect();
  }

  if (!wantLocked && !(await confirmPhrase(`UNLOCK ${doorName}`))) {
    log("abort", "Confirmation not given. No command sent.");
    return eufy.disconnect();
  }

  // Watch for the lock's own confirmation BEFORE sending.
  let confirmedBy;
  const pushConfirmed = new Promise((resolve) => {
    eufy.on("event", (e) => {
      if (e?.deviceSn === target.sn && e?.eventName === "lockState" && e.locked === wantLocked) {
        confirmedBy ??= `push event ${e.eventType}`;
        resolve();
      }
    });
  });

  const sentAt = Date.now();
  log("command", `Sending ${VERB} to ${doorName} (one attempt, no retry)`);
  try {
    const lock = (await eufy.getDevice(target.sn)).lock();
    await (wantLocked ? lock.lock() : lock.unlock());
    log("command", `${action}() returned after ${Date.now() - sentAt} ms (this is only a send, not a confirmation)`);
  } catch (err) {
    log("command", `${action}() threw: ${err.message}. Outcome UNKNOWN; checking reported state anyway.`);
  }

  const deadline = sentAt + CONFIRM_TIMEOUT_MS;
  while (!confirmedBy && Date.now() < deadline) {
    await Promise.race([pushConfirmed, new Promise((r) => setTimeout(r, POLL_EVERY_MS))]);
    if (!confirmedBy && (await readLocked(target.sn)) === wantLocked) confirmedBy = "cloud re-read";
  }

  if (confirmedBy) {
    log("result", `CONFIRMED_SUCCESS: ${doorName} reports ${wantLocked ? "LOCKED" : "UNLOCKED"} via ${confirmedBy}, ${Date.now() - sentAt} ms after send`);
  } else {
    log("result", `UNKNOWN_RESULT: no ${wantLocked ? "locked" : "unlocked"} state reported within ${CONFIRM_TIMEOUT_MS / 1000} s. Check the door physically.`);
  }
  await eufy.disconnect();
}

main().catch((err) => {
  log("fatal", err?.stack ?? String(err));
  process.exit(1);
});
