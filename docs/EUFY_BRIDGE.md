# DM LockGuard — Eufy Bridge

LockGuard (PHP) cannot talk to Eufy directly. The only working library is `@mega-yfue/eufy-sdk` (Node.js, MQTT). A small Node service, the **bridge** (`integrations/eufy/src/bridge/`), wraps that library. It exposes a signed internal API that only LockGuard calls.

```text
Phone/browser ──► LockGuard (Laravel) ──signed HTTP──► Bridge (Node) ──MQTT──► Eufy cloud ──► lock
                        ▲                                   │
                        └──── signed webhook (lock events) ◄┘
```

## Security

- **Signed requests:** every request in both directions is HMAC-SHA256 signed with `LOCKGUARD_BRIDGE_SECRET`, which must be at least 32 random characters.
  - The signed string is `<unix seconds>\n<METHOD>\n<path>\n<sha256 of body>`.
  - It is sent in the `X-LockGuard-Timestamp` and `X-LockGuard-Signature` headers.
- **Refused requests:** a request whose timestamp is more than 60 s off is refused, and so is a repeated signature.
- **Fails closed:** if the secret is missing or shorter than 32 characters:
  - The bridge refuses to start.
  - LockGuard falls back to the `unconfigured` driver.
  - The webhook refuses every request.
- **Loopback only:** the bridge listens on `127.0.0.1` by default.
- **Eufy session:** the Eufy session is kept in `integrations/eufy/data/`, which is git-ignored. The bridge never attempts interactive login. If Eufy asks for a captcha or 2FA, run `npm run poc:readonly` once to sign in.

## Bridge API (called by LockGuard)

| Endpoint | Purpose |
|---|---|
| `GET /v1/health` | Shows `status` (`starting`, `connected`, `needs_login` or `error`), the lock count, the last sync and the last error. |
| `GET /v1/locks` | Lists the T85D0 locks this Eufy account can see. |
| `GET /v1/locks/{sn}/state` | A fresh cloud re-read: `locked`, `unlocked` or `unknown`, plus the battery level. `503 eufy_degraded` when the cloud returned no fresh state (see below). |
| `POST /v1/locks/{sn}/commands` `{action, command_id}` | Sends one lock or unlock command. See the table below. |

Each command reply says whether the command could have reached the lock:

| Reply | Meaning | What LockGuard does |
|---|---|---|
| `200 acknowledged` | The lock replied that it received the command (`device_acked: true`). This does not prove the bolt moved. | Waits for confirmation. |
| `401/404/422/423/503 rejected` | Not sent. Causes: bad signature, unknown lock, invalid request, a command already in flight for this lock, Eufy not connected, or the Eufy cloud degraded (`eufy_degraded`, see below). | FAILED |
| `504 rejected not_sent_timeout` | The bridge gave up after 25 s before the command was published, and the publish guard stopped it from going out later (see below). Certainly not sent. | FAILED |
| `409 ambiguous` | This `command_id` was already accepted. | Waits for confirmation; never sends again. |
| `502 ambiguous` | The send failed, had no reply within 25 s, or the lock never replied (`no_device_ack`: Eufy's broker took the message but the lock did not answer). It may still have reached the lock. | Waits for confirmation, then UNKNOWN_RESULT if none comes. |

On the LockGuard side (`EufyBridgeDriver`), only two things count as "not sent":
- a `rejected` reply, or
- cURL error 6 or 7 (host not resolved, or connection refused).

Timeouts and every other failure count as **outcome unknown**.

**Why `no_device_ack` matters:** eufy-sdk's `lock()`/`unlock()` resolve whether or not the lock replied. The lock's reply arrives only on the SDK's `commandAck` event, which the bridge waits for. Before 2026-10-17 the bridge reported any resolved send as `acknowledged`, which hid the broker problem below.

## Eufy cloud health

When eufy-sdk's live state fetch fails, `getDevice()` quietly answers from its cached device list. On 2026-10-16 the bridge reported "unlocked" for hours this way while every cloud call failed. The bridge therefore watches every cloud call (it wraps the SDK's `mega.post`):

- **State reads must be fresh.** A read is answered only if this lock's params were fetched during the read, or the device list (which carries every lock's state) within the SDK's 5 s reuse window. Otherwise it returns `503 eufy_degraded`, which LockGuard treats as "could not read": the check before sending ends FAILED with nothing sent, and `lockguard:sync-locks` marks the lock degraded.
- **Degraded cloud.** After 2 consecutive failed cloud calls, or 15 minutes without a successful one, `GET /v1/health` reports `status: degraded` with `degraded_reason` (`cloud_errors` or `cloud_silent`), and commands are refused with `503 rejected eufy_degraded`: their outcome could not be confirmed. Any successful cloud call clears it.
- Health also reports `cloud_ok_at`, `cloud_failures` and `cloud_last_error`.

This relies on SDK internals (`EufyMega.mega.post`), so re-check it after any eufy-sdk upgrade.

## Command delivery and the publish guard

The SDK sends each lock command over a **one-shot** connection to Eufy's command broker:
1. a cloud lookup;
2. probing broker instances (up to 8 s each);
3. connect, publish, then wait 5 s for the lock's reply;
4. disconnect.

No port-8883 connection between commands is normal.

The bridge gives up after 25 s, but the SDK would carry on in the background. To keep a command the bridge has given up on from being published later, the adapter hooks the SDK's broker step (`ensureSecurityMqttFor`) and its `publish`:
- **After the deadline:** a command is never published.
- **The publish flag** is set in the same step publishing starts, so after the deadline the bridge knows for certain whether the command could have left.
- **"Not sent" (`504 rejected not_sent_timeout`)** is reported only when the command was still in the cloud lookup or in the guarded broker step and had not started publishing. Anything else stays `502 ambiguous`.
- **Why it was not sent:** a `rejected` reply for `not_sent` or `not_sent_timeout` carries `detail`, the bridge's reason in full (up to 1,000 characters; for `not_sent`, every broker instance's answer). LockGuard stores it with the command and the lock's last error. A refused command does not change the lock's connection status, which only the lock's own state reports set.
- **If the SDK internals change** and the hook cannot be installed, the bridge logs it and every timeout stays ambiguous.

**Broker order:** the SDK probes broker instances one at a time, 8 s each: DNS answers first, then its built-in list. On 2026-10-18 three built-in addresses never answered from this network, which used up the whole 25 s deadline before a working instance was tried. The bridge now runs its own discovery with the same SDK pieces (`findBroker` in `eufy-adapter.mjs`):

- It checks in parallel which candidates accept a TCP connection (about 1.5 s at most; nothing is sent) and skips the ones that do not.
- It probes the rest with a SUBSCRIBE only, never a publish, allowing 5 s each. The order is `EUFY_MQTT_BROKER_IP`, then the last instance that carried a command, then DNS answers, then the built-in list.
- It connects to the first instance that grants and stops probing once the command's deadline passes.
- It logs every instance's answer (`command step: broker probed`).

If no instance grants, nothing was published and the bridge reports `not_sent`, with each instance's answer in the error. If the SDK's router does not have the expected shape, the bridge falls back to the SDK's own discovery. In that case it only reorders the SDK's built-in list in the same way and moves unreachable addresses to the end.

**Step log:** each command logs its steps with elapsed times (`command step: device looked up`, `broker found`, `publishing`, `finished`), plus the SDK's broker and connection lines (`smqtt`, `ensureSecurityMqtt`), so a slow step is visible in `data/bridge.log`.

**Health:** `GET /v1/health` includes `commands`: `consecutive_failures`, `last_failure`, `last_failure_at` and `last_success_at`. The cloud can answer state reads while commands fail; LockGuard therefore reports the integration as `degraded` (`commands_failing`) after 2 failures in a row, and the header and dashboard say so. Commands are still allowed in that case (a success clears it), and every one still waits for the lock to confirm.

## Command broker (`EUFY_MQTT_BROKER_IP`)

Commands travel over MQTT through `aiot-mqtt-us.anker.com`, which fronts several broker instances. Several of them accept a subscription for a lock, but only the instance holding the lock's own session delivers commands to it. The SDK picks the first instance DNS returns. On 2026-10-17 the Front Door's session was on `3.139.229.186`, an instance DNS never returned, so every command was accepted and silently dropped.

`EUFY_MQTT_BROKER_IP` in `integrations/eufy/.env` makes the bridge send commands through that instance. The SDK's own discovery and connection are kept; only the chosen instance is replaced. This reaches into SDK internals, so re-check it after any eufy-sdk upgrade. The setting applies to every lock, so check each lock before enabling its commands.

Finding the instance (both scripts only subscribe; they never publish or send a command):
- `npm run diag:brokers -- "Front Door"`: which instances accept a subscription for the lock.
- `npm run diag:listen -- "Front Door" 240`: listens on all of them. Lock and unlock from the Eufy app meanwhile; the instance that shows `/req` and `/res` messages holds the lock's session.

Eufy can move a lock's session. Commands then end `no_device_ack`; run `diag:listen` again and update the setting.

## Lock events (bridge → LockGuard)

The bridge forwards Eufy push events to `POST /api/internal/eufy/events`:

| Field | Meaning |
|---|---|
| `kind` | `state` or `connectivity`. |
| `external_id` | The lock's serial number. |
| `state` | `locked`, `unlocked` or `jammed`. Event types 517/519 (mechanical anomaly) count as jammed. |
| `online` | For connectivity events: offline is type 516, back online is type 771. |
| `observed_at` | The lock's own event time. Its clock can be off by ±5 s. |
| `external_event_id` | Used to ignore redelivered events. |
| `actor` | The Eufy user name, if the event has one. |

LockGuard records these through `LockStateRecorder` with source `push`. Eufy's cloud copy, which polls read, trails the lock by a few seconds, so within `LOCKGUARD_POLL_LAG_SECONDS` (default 15) of each other the push wins, whichever arrives first. A lock timestamp more than 60 s in the future is replaced with the time LockGuard received the event. If delivery fails, the bridge retries with backoff. Polling also catches anything that is missed.

**Late events:** a push confirms a command only if the lock *observed* it after the command was submitted. A push that arrives late but describes an earlier manual operation therefore cannot confirm a command.

## Keeping state fresh

`lockguard:sync-locks` runs every five minutes from the scheduler. It never sends a command.
- For registered locks, it updates the model and firmware and records a fresh reported state (source `poll`).
- It lists Eufy locks that LockGuard does not know yet. With `--register --property=<id>`, it registers them with commands **disabled**.
- If the bridge is unreachable, every Eufy lock is marked `degraded`.

## Running it

1. In `integrations/eufy/.env`, set:
   - `LOCKGUARD_BRIDGE_SECRET`
   - `LOCKGUARD_EVENTS_URL`
   - `EUFY_MQTT_BROKER_IP` (see Command broker above)
   - optionally `BRIDGE_HOST` / `BRIDGE_PORT`
2. In `backend/.env`, set:
   - `LOCKGUARD_LOCK_DRIVER=eufy_bridge`
   - `LOCKGUARD_BRIDGE_URL`
   - the same `LOCKGUARD_BRIDGE_SECRET`
3. Run `npm run bridge` (in `integrations/eufy`). Also run `php artisan queue:work` and `php artisan schedule:work`.
4. Run `php artisan lockguard:sync-locks --register --property=<id>`, then enable commands per lock (`PATCH /api/v1/locks/{id}`).
5. To give yourself access to a lock as the only administrator, run `php artisan lockguard:grant-lock-access <email> <lock id>` at the server. The API never lets anyone change their own access.

**Prerequisite (from the compatibility report):** in the Eufy app, turn on both the **Locked** and **Unlocked** notifications for each lock. Otherwise "locked" push events are never sent.

## Tests

- Bridge: `npm test` in `integrations/eufy` (Node test runner, fake adapter; never touches Eufy).
- LockGuard: `EufyBridgeDriverTest`, `EufyEventControllerTest` and `SyncLocksCommandTest` use HTTP fakes.
