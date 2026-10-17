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
| `GET /v1/locks/{sn}/state` | A fresh cloud re-read: `locked`, `unlocked` or `unknown`, plus the battery level. |
| `POST /v1/locks/{sn}/commands` `{action, command_id}` | Sends one lock or unlock command. See the table below. |

Each command reply says whether the command could have reached the lock:

| Reply | Meaning | What LockGuard does |
|---|---|---|
| `200 acknowledged` | The lock replied that it received the command (`device_acked: true`). This does not prove the bolt moved. | Waits for confirmation. |
| `401/404/422/423/503 rejected` | Not sent. Causes: bad signature, unknown lock, invalid request, a command already in flight for this lock, or Eufy not connected. | FAILED |
| `409 ambiguous` | This `command_id` was already accepted. | Waits for confirmation; never sends again. |
| `502 ambiguous` | The send failed, had no reply within 25 s, or the lock never replied (`no_device_ack`: Eufy's broker took the message but the lock did not answer). It may still have reached the lock. | Waits for confirmation, then UNKNOWN_RESULT if none comes. |

On the LockGuard side (`EufyBridgeDriver`), only two things count as "not sent":
- a `rejected` reply, or
- cURL error 6 or 7 (host not resolved, or connection refused).

Timeouts and every other failure count as **outcome unknown**.

**Why `no_device_ack` matters:** eufy-sdk's `lock()`/`unlock()` resolve whether or not the lock replied. The lock's reply arrives only on the SDK's `commandAck` event, which the bridge waits for. Before 2026-10-17 the bridge reported any resolved send as `acknowledged`, which hid the broker problem below.

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
