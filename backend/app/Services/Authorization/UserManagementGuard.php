<?php

namespace App\Services\Authorization;

use App\Enums\AuditOutcome;
use App\Enums\PermissionEffect;
use App\Enums\PermissionKey;
use App\Enums\RoleTemplate;
use App\Enums\UserStatus;
use App\Exceptions\ApiException;
use App\Models\Role;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use Illuminate\Support\Collection;

/**
 * Enforces the anti-escalation rules for user administration. Every denial is audited.
 *
 *  1. The actor must hold the catalog permission for the action.
 *  2. Nobody may change their own account through user administration (status, profile, roles, overrides).
 *  3. The actor's "ceiling" is their own effective permissions; Super Administrators' ceiling is the
 *     whole catalog. The actor may only manage a user whose potential permissions (what the user
 *     would hold if active) fit inside that ceiling.
 *  4. A role or override change may only produce potential permissions inside the ceiling, and
 *     every newly assigned role must itself fit inside the ceiling.
 *  5. Revoked accounts are permanent and cannot be changed.
 *
 * The ceiling governs administrative power only: door-access permissions
 * ({@see PermissionKey::isDoorAccess()}) are ignored, so a Property Manager can assign the Resident
 * role and a Security Administrator can suspend a Resident. Proximity unlocking is not door access
 * in this sense and stays under the ceiling.
 */
class UserManagementGuard
{
    public function __construct(
        private readonly PermissionResolver $resolver,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * Permissions that let an actor see user-management screens (users, roles, history, preview).
     */
    public const VIEW_PERMISSIONS = [
        PermissionKey::UsersCreate,
        PermissionKey::UsersEdit,
        PermissionKey::UsersSuspend,
        PermissionKey::UsersReactivate,
        PermissionKey::UsersRevoke,
        PermissionKey::UsersAssignRoles,
        PermissionKey::UsersModifyPermissions,
    ];

    /**
     * Rule 1, for actions without a target user (creating, previewing).
     */
    public function requirePermission(User $actor, PermissionKey $permission, string $action, ?User $target = null): void
    {
        if (! $this->resolver->allows($actor, $permission)) {
            $this->deny($actor, $target, $action, 'forbidden', 'You do not have permission to do this.', ['required_permission' => $permission->value]);
        }
    }

    /**
     * Read access to user management: any one of the given permissions.
     *
     * @param  list<PermissionKey>  $permissions
     */
    public function requireAnyPermission(User $actor, array $permissions, string $action): void
    {
        foreach ($permissions as $permission) {
            if ($this->resolver->allows($actor, $permission)) {
                return;
            }
        }

        $this->deny($actor, null, $action, 'forbidden', 'You do not have permission to do this.', [
            'required_any' => array_map(fn (PermissionKey $key): string => $key->value, $permissions),
        ]);
    }

    /**
     * Rules 1, 2, 3 and 5 for an action on an existing user.
     */
    public function authorizeOnTarget(User $actor, User $target, PermissionKey $permission, string $action): void
    {
        $this->requirePermission($actor, $permission, $action, $target);

        $problem = $this->targetProblem($actor, $target);
        if ($problem !== null) {
            $this->deny($actor, $target, $action, ...$problem);
        }
    }

    /**
     * Rules 2, 3 and 5 without throwing: why the actor may not manage the target, or null.
     *
     * @return array{code: string, message: string, details: array<string, mixed>, status: int}|null
     */
    public function targetProblem(User $actor, User $target): ?array
    {
        if ($actor->is($target)) {
            return ['code' => 'self_modification_forbidden', 'message' => 'You cannot change your own account here. Ask another administrator.', 'details' => [], 'status' => 403];
        }

        if ($target->status === UserStatus::Revoked) {
            return ['code' => 'account_revoked', 'message' => 'This account has been revoked. Revocation is permanent.', 'details' => [], 'status' => 409];
        }

        $outranking = $this->exceeding($actor, $this->potentialPermissions($target));
        if ($outranking !== []) {
            return ['code' => 'target_outranks_actor', 'message' => 'This user holds permissions you do not have, so you cannot manage them.', 'details' => ['permissions' => $outranking], 'status' => 403];
        }

        return null;
    }

    /**
     * Rule 4: the proposed roles and overrides must stay within the actor's ceiling.
     *
     * @param  Collection<int, Role>  $newRoles  The complete proposed role set.
     * @param  list<int>  $currentRoleIds  Role ids the user already holds (empty for a new user).
     * @param  array<string, PermissionEffect>  $overrides  The complete proposed override set.
     */
    public function authorizeGrant(User $actor, ?User $target, Collection $newRoles, array $currentRoleIds, array $overrides, string $action): void
    {
        $violations = $this->grantViolations($actor, $newRoles, $currentRoleIds, $overrides);

        if ($violations['roles'] !== []) {
            $this->deny($actor, $target, $action, 'role_exceeds_your_permissions', 'You cannot assign a role that includes permissions you do not have.', $violations);
        }
        if ($violations['permissions'] !== []) {
            $this->deny($actor, $target, $action, 'grant_exceeds_your_permissions', 'This change would give the user permissions you do not have.', $violations);
        }
    }

    /**
     * The same checks as {@see authorizeGrant()}, returned instead of thrown, for the permission preview.
     *
     * @param  Collection<int, Role>  $newRoles
     * @param  list<int>  $currentRoleIds
     * @param  array<string, PermissionEffect>  $overrides
     * @return array{roles: list<string>, permissions: list<string>}
     */
    public function grantViolations(User $actor, Collection $newRoles, array $currentRoleIds, array $overrides): array
    {
        $newRoles->loadMissing('permissions');

        $roles = $newRoles
            ->reject(fn (Role $role): bool => in_array($role->id, $currentRoleIds, true))
            ->filter(fn (Role $role): bool => $this->exceeding($actor, $role->permissions->map(fn ($p): PermissionKey => $p->key)->all()) !== [])
            ->map(fn (Role $role): string => $role->key)
            ->values()
            ->all();

        $decisions = $this->resolver->resolve(true, $this->rolePermissionMap($newRoles), $overrides);
        $granted = array_values(array_map(
            fn (PermissionDecision $decision): PermissionKey => $decision->permission,
            array_filter($decisions, fn (PermissionDecision $decision): bool => $decision->granted),
        ));

        return ['roles' => $roles, 'permissions' => $this->exceeding($actor, $granted)];
    }

    /**
     * What the user would hold if their account were active. Used so that a suspended administrator
     * (whose effective permissions are empty) is still protected from lower-ranked actors.
     *
     * @return list<PermissionKey>
     */
    public function potentialPermissions(User $user): array
    {
        $user->loadMissing('roles.permissions', 'permissionOverrides');

        $decisions = $this->resolver->resolve(
            true,
            $this->rolePermissionMap($user->roles),
            $user->permissionOverrides
                ->mapWithKeys(fn ($permission): array => [$permission->key->value => PermissionEffect::from($permission->pivot->effect)])
                ->all(),
        );

        return array_values(array_map(
            fn (PermissionDecision $decision): PermissionKey => $decision->permission,
            array_filter($decisions, fn (PermissionDecision $decision): bool => $decision->granted),
        ));
    }

    public function isSuperAdministrator(User $user): bool
    {
        $user->loadMissing('roles');

        return $user->roles->contains('key', RoleTemplate::SuperAdministrator->value);
    }

    /**
     * Permissions in the list that the actor may not grant.
     *
     * @param  list<PermissionKey>  $permissions
     * @return list<string>
     */
    private function exceeding(User $actor, array $permissions): array
    {
        if ($this->isSuperAdministrator($actor) && $actor->isActive()) {
            return [];
        }

        $ceiling = array_map(fn (PermissionKey $key): string => $key->value, $this->resolver->effectivePermissions($actor));

        $governed = array_filter($permissions, fn (PermissionKey $key): bool => ! $key->isDoorAccess());

        return array_values(array_diff(
            array_map(fn (PermissionKey $key): string => $key->value, $governed),
            $ceiling,
        ));
    }

    /**
     * @param  Collection<int, Role>  $roles
     * @return array<string, list<string>>
     */
    private function rolePermissionMap(Collection $roles): array
    {
        return $roles
            ->mapWithKeys(fn (Role $role): array => [
                $role->key => $role->permissions->map(fn ($permission): string => $permission->key->value)->values()->all(),
            ])
            ->all();
    }

    /**
     * @param  array<string, mixed>  $details
     */
    private function deny(User $actor, ?User $target, string $action, string $code, string $message, array $details = [], int $status = 403): never
    {
        $this->audit->record(
            $action,
            AuditOutcome::Denied,
            actor: $actor,
            targets: ['user' => $target?->id],
            reason: $message,
            metadata: ['denial' => $code, ...$details],
        );

        throw new ApiException($status, $code, $message, $details);
    }
}
