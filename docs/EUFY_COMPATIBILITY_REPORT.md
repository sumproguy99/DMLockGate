# Eufy T85D0 Compatibility Report

**Device:** eufy Smart Lock C30, model T85D0 (built-in Wi-Fi, no bridge)
**Report date:** 2026-10-14
**Report stage:** Phase Zero research (source review). **No code has been run against the physical lock yet.**

## Status legend

| Status | Meaning |
|---|---|
| VERIFIED | Tested successfully against the actual device |
| IMPLEMENTED | Implemented, not yet verified against the actual device |
| SIMULATED | Demonstrated using a mock or simulator |
| PARTIAL | Some required behavior is implemented |
| UNSUPPORTED | No reliable implementation has been established |
| BLOCKED | Requires credentials, hardware, account access, or external approval |

## 1. Integration options evaluated

### 1.1 Official Eufy API
Eufy publishes no public developer API for locks. The C30 is advertised as working with Alexa and Google Assistant. No source confirms Matter support for the C30; Matter is documented for other models (C34/E30). **Not a usable path today.**

### 1.2 `eufy-security-client` (bropat), Node.js
- License: MIT. Requires Node >= 24 (installed: 24.14.1).
- Latest published: `4.1.1-1` (npm, modified 2026-09-12); dev tag `4.1.1-dev.39`.
- Talks to the Eufy cloud API, with P2P and push notifications. Login supports captcha and 2FA verification codes, plus persisted session data.
- The docs list T85D0 as **"Supported", firmware 1.0.7.1 (20240801)**.

Source review of `4.1.1-1` and `4.1.1-dev.39` (`build/http/types.js`, `build/http/station.js`):

| Finding | Evidence |
|---|---|
| T85D0 is a known device type (`LOCK_85D0 = 202`) | `types.js` |
| T85D0 exposes properties: battery, locked, advanced lock status, auto-lock, wrong-try protection, notifications, lock event origin, person name | `types.js` device property map |
| T85D0 commands: **only `DeviceLockCalibration`**. No add user / delete user / update passcode / update schedule. Sibling models (T8502, T85L0 C33) do have these. | `types.js` command map |
| `Station.lockDevice()` has **no branch for T85D0**. It falls to `else { throw NotSupportedError }` | `station.js` |
| The original C30 support PR (#806) states: "I did expose a property to lock or unlock but that doesnt work." The author suspects the C30 uses MQTT rather than P2P. | GitHub PR #806 |
| Home Assistant users report C30 lock/unlock failing with `device_not_supported` (issue #1440, March 2026, no response) | fuatakgun/eufy_security #1440, #1227 |
| Upstream fix PR #758 was described as "very preliminary"; not present in the dev build | fuatakgun/eufy_security PR #1369 thread |

**Conclusion:** status, battery and events are plausible. Lock/unlock and PIN management are **not implemented** for T85D0 in this library.

**The repository was archived on 2026-09-12 and the npm package is marked "no longer supported".** Its README says active development moved to `eufy-sdk`. **Rejected for LockGuard.**

### 1.3 `@mega-yfue/eufy-sdk`, TypeScript (SELECTED)
- npm `@mega-yfue/eufy-sdk`, pinned to `0.4.0` (released 2026-10-06; beta 0.5.0-beta.29). License Apache-2.0. Node >= 24.5 (installed 24.14.1).
- Uses the Anker "mega" cloud API for login and devices, plus secure MQTT. The T85D0 has no P2P endpoint, so it is MQTT-only. Login supports captcha and 2FA, with a file-based persistent session.
- Source review of 0.4.0 (`dist/model/capabilities/lock.d.ts`, `dist/transport/mqtt/command-router.d.ts`):
  - `dev.lock()` exposes `locked` (param 6000: 4 = locked, 3 = unlocked), `battery` (param 1101/6001), `rssi`, `lock()`, `unlock()` and `setAutoLock()`.
  - Upstream notes for the T85D0 MQTT path: **unlock "LIVE-VERIFIED" (3/3 on a real T85D0, 2026-07-16)**. **Lock** is byte-exact against captured app frames but **never physically observed**.
  - `lock()`/`unlock()` are **fire-and-forget**. The MQTT `/res` reply is only a delivery ack, not "motion complete". LockGuard must confirm the outcome from the reported `locked` state.
  - Upstream comments call the T85D0 a "garage door" in places. Device type 202 may be shared with other hardware, which is a classification risk to verify on the real lock.
  - No PIN or keypad-user management for T85D0.
- **Issue #257 (opened 2026-09-25 against 0.2/0.3, open, no maintainer reply):** T85D0 commands not acknowledged by the device, and reported state not tracking the physical lock. Unknown whether 0.4.0 fixes it. A related C32 issue (#362) shows the MQTT broker answering "Not authorized".
- **Conclusion:** the only maintained library with a T85D0 command path. Used for the proof of concept. Commands remain unverified on the operator's lock.

## 2. Capability matrix (T85D0)

| Capability | Status | Notes |
|---|---|---|
| Eufy account authentication (incl. 2FA) | VERIFIED | 2026-10-15 operator run. 2FA code delivered by email (SDK default `message_type=2`) |
| Device discovery | VERIFIED | Found 2× T85D0 ("Front Door", "Back Door"). SDK classifies them `class: other`, `realtime: p2p` (see risks) |
| Lock-state retrieval | VERIFIED | `locked` (param 6000) tracked operator-driven lock/unlock sequences on both doors across 3 runs. Final cloud state matched the last event each time |
| Battery level | VERIFIED | Param 6001/1101 reported on both locks; values moved 98→97 and 84→83 between runs |
| Event delivery (push) | VERIFIED (with prerequisite) | Run 3 (2026-10-15 05:07), after the operator enabled the **"Locked" notification** in the Eufy app: 9/9 operator actions delivered in the correct alternating order. Locked = event type **264**, param 6000 = 4. Unlocked = event type **261**, param 6000 = 3. Latency 2–5 s. **Prerequisite: both Locked and Unlocked notifications must be enabled in the Eufy app for each lock**, or "locked" events are never pushed (runs 1–2 delivered only type 261). Param 1919 changed 3 → 7 when the setting was enabled, so it is probably a notification bitmask (hypothesis). Each lock's clock differs from the server by up to ±5 s |
| Command transport | VERIFIED (routing only) | Both locks: `api: mega`, no `p2pDid`, so eufy-sdk routes `ff09-actuate` to the **MQTT** command router, the same path upstream live-tested on a T85D0. The `realtime: "p2p"` label in `getDevices()` is cosmetic and not used for command routing |
| State by cloud re-read | IMPLEMENTED | `getDevice()` re-reads the cloud device record. At the end of run 2 it reported Back Door **locked**, even though the last push event for it said unlocked. So the cloud record catches state changes that push missed. Polling is a viable confirmation path; its refresh interval is unmeasured |
| Event actor attribution | IMPLEMENTED | Events carry `nick_name` and `user_id` of the Eufy user who acted |
| `lastSeenMs` (device last report time) | UNSUPPORTED | SDK returns an impossible value (year 58756, looks scaled ×1000 twice). LockGuard must not use it for staleness |
| Push token registration | PARTIAL | `/v1/apppush/register_push_token` returned 401, yet push reported ready and events arrived. Monitor in longer runs |
| **Lock command** | **VERIFIED** (1 trial, Front Door) | 2026-10-15 05:15 UTC, operator-authorized, `poc:lock`. Precheck reported unlocked. The `lock()` send/ack took **7.0 s**. **CONFIRMED_SUCCESS via cloud re-read 12.5 s after send.** Source review confirmed the re-read is a fresh `getDeviceParamList` cloud call and the SDK makes no optimistic local write. No push 264 event arrived within that window. **Operator confirmed the bolt physically moved.** More trials (Back Door, repeats) are needed before calling this reliable |
| **Lock command through LockGuard** | **VERIFIED** (1 trial, Front Door, with broker pin) | 2026-10-17 09:39 UTC, operator-run. Device ack in **2.8 s**, CONFIRMED_SUCCESS via push 264 observed 7 s after submission, **operator saw the bolt move**. Before the pin, 4 sends that day (bridge and a fresh `poc:lock`) were accepted by the broker but never acknowledged by the lock and did not move it. Cause: see "Command broker instance" below |
| **Unlock command through LockGuard** | **VERIFIED** (1 trial, Front Door, with broker pin) | 2026-10-17 10:12 UTC, operator-run with password step-up and typed confirmation. Device ack in **2.0 s**, CONFIRMED_SUCCESS via push 261 about 7 s after submission, **operator saw the bolt retract**. Here the trailing cloud read ("locked", 10:12:23) arrived before the push ("unlocked", lock clock 10:12:22), so the lag rule applies in both arrival orders |
| Repeat trials through LockGuard | **VERIFIED** (7/7, Front Door) | 2026-10-17 10:21–10:25 UTC, operator at the door, one step-up for the run. Alternating lock/unlock, 15 s apart: every command device-acked in 2.0–2.7 s and was confirmed by its own push (lock 264 / unlock 261) observed 6–7 s after submission. Each push came from a separate observation; LockGuard's reported state tracked every step |
| Back Door through LockGuard | **VERIFIED** (4/4) | 2026-10-17 10:32–10:34 UTC. `diag:listen` showed its session on the same instance as the Front Door (3.139.229.186), so the one pin covers both. Commands enabled (audited, console). Alternating unlock/lock: device ack 1.8–2.5 s, each confirmed by its own push, ended locked |
| Command broker instance | VERIFIED (cause found) | `aiot-mqtt-us.anker.com` fronts several instances; 3 of 8 granted a SUBSCRIBE for the Front Door (DNS answers .189 and .206, plus seed `3.139.229.186`). Listening on all three while the operator used the app showed every `/req` and `/res` only on **3.139.229.186**, which DNS does not return. eufy-sdk 0.4.0 (and 0.5.0-beta.58, identical code) publishes through the first granting DNS instance, so commands were silently dropped. The bridge now pins `EUFY_MQTT_BROKER_IP`. The 2026-10-15 success presumably happened while the session sat on a DNS-listed instance |
| Device command ack | VERIFIED | `lock()`/`unlock()` resolve even without a device reply (5 s wait). The real reply is the `commandAck` event (`acked`, `instanceIp`); the bridge reports `no_device_ack` when it is false |
| Cloud re-read lag | VERIFIED | 2026-10-17: push "locked" observed 09:39:20, cloud re-read at 09:39:21 still "unlocked". A poll just after a push is not trusted over it (`LOCKGUARD_POLL_LAG_SECONDS`) |
| **Unlock command** | **VERIFIED** (1 trial, Front Door) | 2026-10-15 05:21 UTC, operator-authorized, `poc:unlock` with typed confirmation. Precheck reported locked. The `unlock()` send/ack took **3.7 s**. **CONFIRMED_SUCCESS via push event 261, 10.9 s after send.** **Operator confirmed the bolt physically retracted.** More trials (Back Door, repeats) are needed before calling this reliable |
| Command confirmation via reported state | VERIFIED | Lock was confirmed by cloud re-read (12.5 s); unlock by push event 261 (10.9 s). Both paths are needed: push did not fire for the API-originated lock within 12.5 s |
| Keypad PIN create/modify/delete/expire | **UNSUPPORTED** | No PIN/user commands for T85D0 in any library |
| Auto-lock settings | BLOCKED | eufy-sdk `setAutoLock` (upstream live-verified); not needed for MVP |
| Firmware info | BLOCKED | Not exposed in lock capability; check PoC property dump |
| Session expiry / re-auth | BLOCKED | Persistent file session; needs live testing |
| Rate limits | UNSUPPORTED (undocumented) | Rapid/failed logins can trigger captcha or cooldown |

## 3. Risks

1. **No supported lock/unlock path for T85D0 today.** This is the core feature of DM LockGuard.
2. All options are reverse-engineered, unofficial integrations. Eufy can break them with a cloud or firmware change at any time.
3. Logging in with the same account the phone app uses may cause session conflicts. Use a dedicated Eufy account shared from the owner account (common practice for these libraries; to be verified).
4. Server-side expiration cannot remove keypad PINs from the lock (no PIN commands). LockGuard must warn administrators.

## 4. Next verification steps

1. Operator runs `npm run poc:readonly` in `integrations/eufy` (login, discover, read state/battery, listen for events). No lock commands.
2. Test `eufy-sdk`'s MQTT command path against the real lock **only with explicit operator authorization**, starting with a *lock* command.
3. Update this report with VERIFIED/UNSUPPORTED results.

## Sources
- https://github.com/bropat/eufy-security-client (supported_devices.md, npm 4.1.1-1 source)
- https://github.com/bropat/eufy-security-client/pull/806
- https://github.com/fuatakgun/eufy_security/issues/1440
- https://github.com/fuatakgun/eufy_security/issues/1227
- https://github.com/fuatakgun/eufy_security/pull/1369
- https://github.com/mega-yfue/eufy-sdk
- https://github.com/mega-yfue/eufy-sdk/issues/257
- https://github.com/mega-yfue/eufy-sdk/issues/362
- https://www.eufy.com/products/t85d0112
