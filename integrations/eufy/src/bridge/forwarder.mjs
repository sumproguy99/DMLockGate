// Delivers lock events to LockGuard's signed internal webhook. Events are idempotent on the
// LockGuard side (external_event_id), so redelivery is safe. Delivery gives up after a few attempts;
// LockGuard's polling still catches the state.

import { signedHeaders } from "./auth.mjs";

export function createForwarder({ url, secret, log = () => {}, attempts = 5, fetchImpl = fetch, delay = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const path = new URL(url).pathname;

  return async function forward(event) {
    const body = JSON.stringify(event);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const res = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", ...signedHeaders(secret, "POST", path, body) },
          body,
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) return true;
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          log("error", "LockGuard refused event", { status: res.status });
          return false;
        }
        log("warn", "LockGuard event delivery failed", { status: res.status, attempt });
      } catch (err) {
        log("warn", "LockGuard event delivery failed", { error: err?.message, attempt });
      }
      if (attempt < attempts) await delay(Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
    }
    return false;
  };
}
