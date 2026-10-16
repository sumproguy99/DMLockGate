// HMAC request signing shared by the bridge and LockGuard (see docs/EUFY_BRIDGE.md).
//
// Signed string: "<unix seconds>\n<METHOD>\n<path>\n<sha256 hex of body>"
// Headers:       X-LockGuard-Timestamp, X-LockGuard-Signature (hex HMAC-SHA256)

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MAX_SKEW_SECONDS = 60;

export function sign(secret, timestamp, method, path, body) {
  const digest = createHash("sha256").update(body ?? "").digest("hex");
  return createHmac("sha256", secret).update(`${timestamp}\n${method.toUpperCase()}\n${path}\n${digest}`).digest("hex");
}

export function signedHeaders(secret, method, path, body, now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000));
  return {
    "X-LockGuard-Timestamp": timestamp,
    "X-LockGuard-Signature": sign(secret, timestamp, method, path, body),
  };
}

/**
 * Verifies a signed request. `seen` is a Map used to refuse replays of a signature inside the skew
 * window. Returns null when valid, or a short reason when not.
 */
export function verify(secret, { timestamp, signature, method, path, body }, seen, now = Date.now()) {
  if (!timestamp || !signature || !/^\d+$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) {
    return "missing_signature";
  }
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) {
    return "stale_timestamp";
  }

  const expected = Buffer.from(sign(secret, timestamp, method, path, body), "hex");
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) {
    return "bad_signature";
  }

  for (const [sig, at] of seen) {
    if (now - at > MAX_SKEW_SECONDS * 2000) seen.delete(sig);
  }
  if (seen.has(signature)) {
    return "replayed";
  }
  seen.set(signature, now);

  return null;
}
