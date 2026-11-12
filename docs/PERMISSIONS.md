# DM LockGuard — Permissions and User Administration

This document covers how LockGuard decides what a user may do, and the rules that stop administrators from granting more power than they hold.

Source of truth in code:

| Concern | File |
|---|---|
| Permission catalog (34 keys) | `backend/app/Enums/PermissionKey.php` |
| Built-in role templates (7) | `backend/app/Enums/RoleTemplate.php` |
| Resolution algorithm | `backend/app/Services/Authorization/PermissionResolver.php` |
| Anti-escalation rules | `backend/app/Services/Authorization/UserManagementGuard.php` |
| Tests | `backend/tests/Feature/Services/Authorization/PermissionResolverTest.php`, `backend/tests/Feature/Http/Controllers/Api/V1/Users/UserManagementTest.php` |

---

## 1. Permission resolution

Each catalog permission is evaluated independently, in this order. The first rule that applies decides.

1. **Inactive account → denied.** Suspended, revoked, or expired (`account_expires_at` in the past) accounts are granted nothing.
2. **Individual DENY override → denied**, whatever any role grants.
3. **Individual ALLOW override → granted.**
4. **Any assigned role includes it → granted.** Roles are additive. One granting role is enough.
5. **Otherwise → denied** (deny by default).

Any key not in the catalog is always denied. The `permissions` table is synchronized from the enum by `PermissionCatalogSeeder`, and stale rows are deleted.

**Conflicts:** roles never conflict with each other, because they only grant. A user override always beats roles, and a deny override always beats an allow, so a user has at most one override per permission.

**When changes take effect:** results are memoized for one request only. The `active` middleware re-reads the account status from the database on every request. So a suspension, role change, or override change takes effect on the user's next request.

**Enforcement:** every catalog key is registered as a Laravel Gate, and all checks run on the backend. The GUI only hides what the backend would refuse anyway.

## 2. Built-in roles

| Role | Summary |
|---|---|
| Super Administrator | Every permission except `lock.proximity_unlock` |
| Security Administrator | Suspend/reactivate/revoke users, devices, sessions, incidents, security policies |
| Property Manager | Create/edit/suspend/reactivate users, access grants, schedules, code metadata |
| Resident | Lock, unlock, remote unlock, history, location use |
| Temporary Guest / Service Provider | View status, lock, unlock |
| Read-Only Auditor | History, incidents, location-access audit, report export |

No template grants proximity unlocking. It must be granted deliberately with an individual ALLOW override (see §4).

The seeder creates missing built-in roles only. It never overwrites a role an administrator has customized.

## 3. User administration API (`/api/v1`)

All routes require a signed-in, active account. "Step-up" means the user must have signed in or re-confirmed (`POST auth/confirm`) within `LOCKGUARD_STEP_UP_SECONDS` (default 600).

| Method & path | Required permission | Step-up |
|---|---|---|
| `GET users`, `GET users/{id}`, `GET users/{id}/security-history`, `GET roles`, `GET permissions` | any `users.*` permission | no |
| `POST permission-preview` | `users.create`, `users.assign_roles`, or `users.modify_permissions` | no |
| `POST users` | `users.create` (+ `users.assign_roles` if `roles` is given) | yes |
| `PATCH users/{id}` | `users.edit` | yes |
| `POST users/{id}/suspend` | `users.suspend` | **no** — so access can be cut off immediately |
| `POST users/{id}/reactivate` | `users.reactivate` | yes |
| `POST users/{id}/revoke` | `users.revoke` | yes |
| `PUT users/{id}/roles` | `users.assign_roles` | yes |
| `PUT users/{id}/permissions` | `users.modify_permissions` | yes |

Status changes need a `reason`, which is stored in the audit record. Allowed transitions:

- active → suspended
- suspended → active
- active or suspended → revoked

Revocation is permanent. Suspension and revocation also delete the account's database sessions and API tokens.

`PUT users/{id}/roles` and `PUT users/{id}/permissions` replace the whole set. Send the complete list you want.

## 4. Anti-escalation rules

Checked by `UserManagementGuard` before any change is made. Every refusal is written to the audit log with outcome `denied`.

1. **Permission:** the actor must hold the catalog permission for the action. Error code: `forbidden`.
2. **No self-modification:** nobody can change their own status, profile, roles, or overrides through user administration. Error code: `self_modification_forbidden`.
3. **Rank:** the actor may only manage a user whose *potential* permissions fit inside the actor's **ceiling**. Error code: `target_outranks_actor`.
   - Potential permissions are what the user would hold if active. A suspended Super Administrator is still protected.
4. **Grants:** a role or override change may only produce potential permissions inside the ceiling, and every newly added role must fit inside the ceiling. Error codes: `grant_exceeds_your_permissions`, `role_exceeds_your_permissions`.
5. **Revoked accounts** cannot be changed. Error code: `account_revoked` (HTTP 409).

**The ceiling** is the actor's own effective permissions. A Super Administrator's ceiling is the whole catalog, so only a Super Administrator can grant proximity unlocking.

**Door access is outside the ceiling.** The ceiling ignores `lock.view_status`, `lock.lock`, `lock.unlock`, `lock.remote_unlock`, `lock.view_history`, and `location.use`. Without this, a Property Manager could not assign the Resident role, and a Security Administrator could not suspend a Resident whose phone was stolen. The ceiling therefore governs administrative power, while everyday door access can be delegated by anyone who holds `users.assign_roles` / `users.modify_permissions`. `lock.proximity_unlock` is not treated as door access and stays under the ceiling.

## 5. Permission preview

`POST /api/v1/permission-preview` with `{ user_id?, roles: [...], overrides: [{permission, effect}] }` returns:

- `permissions`: every catalog permission with `granted`, `granting_roles`, `override`, and a plain-language `reason`
- `changes`: `gained`, `lost`, `sensitive_gained` compared with the user's current permissions (`null` for a new user)
- `violations`: the roles and permissions the signed-in administrator is not allowed to grant
- `target_problem`: why the administrator cannot manage this user, if they cannot
- `can_save`: whether saving this exact proposal would be accepted

Nothing is saved.

## 6. Audit actions

| Action | Written on |
|---|---|
| `user.created` | Account created (console or API) |
| `user.updated` | Profile changed. Records changed fields with from/to values. For `admin_notes`, only records that the notes changed. |
| `user.suspended`, `user.reactivated`, `user.revoked` | Status change, with reason and sign-out counts |
| `user.roles_changed` | Roles added/removed |
| `user.permissions_changed` | Override set before/after |
| `user.list`, `user.view`, `user.permission_preview`, `role.list`, `permission.list`, `user.security_history_viewed` | Written only when access is **denied** |

## 7. Two-step sign-in required by role

The security policy (`SecurityPolicy`, stored in `app_settings` under `security`) lists the roles whose holders must use two-step sign-in. Until it is saved in the app, the roles come from `LOCKGUARD_MFA_REQUIRED_ROLES` (default `super_administrator,security_administrator`); once saved, the saved list wins, and an empty list turns the requirement off.

- **Enforcement:** the `mfa-enrolled` middleware (`EnsureMfaIsEnrolled`) runs on every signed-in route, sessions and API tokens alike. An account that must use two-step sign-in but has no authenticator may only call `auth/me`, `auth/confirm`, `auth/mfa` (start), `auth/mfa/confirm` and `auth/logout`. Everything else answers 403 `mfa_setup_required`. Because it is checked on every request, a policy change or a new role takes effect on the account's next request.
- **Sign-in:** the password (and device) checks are unchanged. The sign-in succeeds, the audit row `auth.login` records `mfa_setup_required: true`, and `auth/me` and the sign-in response carry `mfa_required` and `mfa_setup_required`. The app shows only the setup screen until it is done.
- **Moving to a new phone:** removing the authenticator still works (it needs step-up with the password and a current code). For a required role the account is then back to setup-only until a new authenticator is confirmed; the audit row `auth.mfa_disabled` records `mfa_setup_required: true`.
- **Settings:** `GET /api/v1/settings/security` and `PUT /api/v1/settings/security` (`admin.security_policies`; saving needs step-up), audited as `settings.security_updated` with the roles added and removed. The page is Settings > Security policy.
- **Resetting someone else's authenticator:** `POST /api/v1/users/{user}/mfa/reset` (`admin.security_policies`, step-up, a reason) is for someone who has lost both their phone and their recovery codes. It clears the authenticator and recovery codes and signs them out everywhere. The usual target rules apply (not your own account, not a revoked one, not someone who holds permissions you lack). It answers 409 `mfa_not_enabled` when there is nothing to reset. It is audited as `user.mfa_reset` (with the reason, `signed_out`, and `mfa_setup_required: true` when their role must use two-step sign-in) and raises a medium **Two-step sign-in turned off** alert. At their next sign-in a required role sets up a new authenticator before anything else; anyone else can sign in with their password alone until they set one up.

## 8. Choosing your own password

An account created directly (`POST /api/v1/users`, where the administrator types the password) gets `password_change_required`. Invitations, `lockguard:create-admin` and existing accounts do not.

- **Enforcement:** the `password-changed` middleware (`EnsurePasswordIsChanged`) runs on every signed-in route before `mfa-enrolled`, sessions and API tokens alike. Until the password is changed the account may only call `auth/me`, `auth/password` and `auth/logout`; everything else answers 403 `password_change_required`. So someone who owes both picks a password first, then sets up two-step sign-in.
- **Changing it:** `PUT /api/v1/auth/password` (any signed-in user; the current password, a new one of at least 12 characters with letters and numbers, confirmed and different). Five wrong current passwords lock it for five minutes. It clears `password_change_required`, ends the account's other sessions (this one carries on, with the new hash for Sanctum's AuthenticateSession), sends the "password was changed" email, and is audited as `auth.password_changed` (`signed_out`, and `was_required` when it was forced; a wrong current password is a Failure row). A reset by emailed link also clears the requirement.
- **Sign-in:** `auth.login` records `change_required_by_admin: true` while it is owed. (Audit metadata keys containing "password" are redacted, hence the name.)

## 9. Known gaps

- Creating custom roles through the API is not built yet. Custom roles can only come from the database for now.
