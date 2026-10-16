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

## 7. Known gaps

- No policy yet forces MFA for administrators. It is planned as a security-policy setting (default on for admin roles).
- Users created through the API get an administrator-chosen password. There is no forced password change or emailed invitation yet.
- Creating custom roles through the API is not built yet. Custom roles can only come from the database for now.
