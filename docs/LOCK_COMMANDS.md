# DM LockGuard — Lock Command Service

Every lock and unlock request goes through `LockCommandService` (`backend/app/Services/Locks/`). Controllers never authorize lock operations themselves.

## Request lifecycle

```text
RECEIVED → AUTHENTICATING → DENIED
                          → AUTHORIZED → QUEUED → EXPIRED            (never sent)
                                                → ALREADY_IN_STATE   (fresh read already showed it; never sent)
                                                → SUBMITTED → CONFIRMED_SUCCESS
                                                            → FAILED          (certainly not delivered)
                                                            → UNKNOWN_RESULT  (may have reached the lock)
```

These are separate records, never collapsed into one status:

| Concept | Where it is stored |
|---|---|
| Access request | `access_requests` (`status` holds the lifecycle state) |
| Authorization decision | `authorization_decisions` (every check and its result) |
| Command submission | `lock_commands.submitted_at` |
| Integration response | `lock_commands.integration_result`: `acknowledged`, `rejected` or `ambiguous` |
| Reported physical state | `lock_state_events`, append-only |
| Final confirmation | `lock_commands.confirmation` and `confirming_state_event_id` |

## Authorization checks (in order; the first failure denies)

1. `account_active`: the account is not suspended, revoked or expired.
2. `valid_operation`: the lock is registered and its commands are enabled. Proximity requests are refused until proximity unlocking exists.
3. `permission`:
   - Locking needs `lock.lock`.
   - Unlocking needs `lock.unlock`, plus `lock.remote_unlock` when the request is remote.
4. `lock_access`: the user has a `user_lock_access` row for this lock.
5. `schedule`: the current time is inside that row's `valid_from` / `valid_until` window.
6. `remote_unlock_policy`: rejects remote unlock when the policy is `disabled`, or when the policy value is not recognized.
7. `authentication_strength`: under the `step_up` policy (the default), a remote unlock needs a password (and MFA) confirmation within `LOCKGUARD_STEP_UP_SECONDS`.
8. `location`: under the `location_required` policy, remote unlock is rejected because location-aware access does not exist yet.
9. `security_hold`: recorded as `not_applicable` until lockdown mode is built.
10. `lock_busy`: rejected while another command for the same lock is queued or submitted.

**Every request from the app is treated as remote.** Until location reporting exists, LockGuard cannot tell that the user is at the door, and a missing location report is never treated as evidence of presence. So a Temporary Guest, who holds `lock.unlock` but not `lock.remote_unlock`, can lock but cannot unlock yet.

## Sending and confirmation (`SubmitLockCommand` job)

- **Checked before it is sent.** The job first reads the lock's current state fresh, records it, and uses the lock's resulting state. Eufy's cloud copy trails the lock by a few seconds, so a push from the lock within `LOCKGUARD_POLL_LAG_SECONDS` (default 15) outranks that read. A door locked by hand moments before a lock command is therefore seen as locked.
  - **Already in the requested state:** nothing is sent, and the request becomes ALREADY_IN_STATE. A later confirmation could not tell a working command from a door that was already locked. The first live test on 2026-10-16 showed exactly this.
  - **State unreadable, unknown or jammed:** nothing is sent, and the request becomes FAILED.
- **Claimed before it is sent.** The job moves the request from QUEUED to SUBMITTED in its own transaction before it calls the integration. A crash or a duplicate job therefore cannot send the command twice.
- **Never retried.** The job has `$tries = 1`.
- **Integration results:**
  - `rejected`: the bridge was unreachable or refused the command, so it certainly was not delivered. The request becomes FAILED.
  - `ambiguous`: for example, a timeout after sending. The command may already have reached the lock, so the request continues to confirmation.
- **Success means the lock reported the new state.** A request becomes CONFIRMED_SUCCESS only when the lock reports the expected state after submission. That report can come from either:
  - a push event that the lock observed, and LockGuard received, after submission (so a late event about an earlier manual action cannot confirm), or
  - a fresh state read every `LOCKGUARD_CONFIRM_POLL_SECONDS`.
- **Unconfirmed commands are never retried.** If no confirmation arrives within `LOCKGUARD_CONFIRM_TIMEOUT_SECONDS`, or the lock reports jammed, the request becomes UNKNOWN_RESULT. It is not retried, and the user is told to check the door.
- **The integration's acknowledgement is not proof.** An ack means the command was delivered, not that the bolt moved, so it is never treated as success.

## Expiry policy

- An authorized request that has not been sent within `LOCKGUARD_COMMAND_TTL_SECONDS` (default 30) expires and is never sent. Nothing is queued for execution at a later, unexpected time.
- `lockguard:expire-commands` runs every minute from the scheduler:
  - It expires unsent requests even when no queue worker is running.
  - It closes SUBMITTED requests whose worker died as UNKNOWN_RESULT.

## Idempotency

Clients send an `idempotency_key` (8–64 characters, unique per user).

- Repeating a key returns the original request and never sends a second command.
- Reusing a key for a different lock or action returns 409 `idempotency_key_reused`.

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/locks/{id}/commands` `{action, idempotency_key}` | Returns 202 when accepted. A denial returns 403 with the reason code and `request_id`. Rate limited to 10 per minute per user. |
| `GET /api/v1/lock-requests/{request_id}` | Poll until `is_final`. Only `confirmed_success` means the door moved. |
| `GET /api/v1/locks`, `GET /api/v1/locks/{id}` | Reported state with `state_freshness`: `current`, `stale` or `unknown`. |
| `GET /api/v1/locks/{id}/history` | Recent reported states and requests. |
| `POST /api/v1/locks`, `PATCH /api/v1/locks/{id}` | Register a lock or change its settings. Requires `admin.integration_settings` and step-up. New locks start with commands disabled. |
| `PUT` / `DELETE /api/v1/locks/{id}/access/{user}` | Grant or remove a user's access, with an optional time window. Requires `access.grants_create` / `access.grants_revoke` and step-up, and follows the anti-escalation rules in `PERMISSIONS.md`. |

**Console grant:** nobody can change their own access through the API. A household with only one administrator therefore uses `php artisan lockguard:grant-lock-access <email> <lock id> [--until=<date>] [--revoke]` at the server.
- It asks for confirmation, refuses inactive accounts, and is audited with channel `console`.
- It gives access to the lock only. The user's role still decides what they may do with it.

## Lock driver

Set with `LOCKGUARD_LOCK_DRIVER`:

| Value | Behavior |
|---|---|
| `unconfigured` (default) | Every command fails safely as FAILED. Nothing is sent. |
| `fake` | Simulated lock for tests and development. Never use it in production. |
| `eufy_bridge` | The signed internal bridge to the Node.js Eufy integration. See `EUFY_BRIDGE.md`. Falls back to `unconfigured` when the secret is missing or short. |

A queue worker must be running (`php artisan queue:work`) for commands to be sent. The scheduler (`php artisan schedule:work`, or a cron entry for `schedule:run`) must also be running.
