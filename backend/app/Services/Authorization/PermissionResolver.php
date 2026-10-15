<?php

namespace App\Services\Authorization;

use App\Enums\PermissionEffect;
use App\Enums\PermissionKey;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Resolves a user's effective permissions. The algorithm, applied to every catalog permission:
 *
 *  1. An inactive account (suspended, revoked or expired) is granted nothing.
 *  2. An individual DENY override denies, whatever any role grants.
 *  3. An individual ALLOW override grants.
 *  4. Otherwise the permission is granted if any assigned role includes it.
 *  5. Otherwise it is denied (deny by default). Keys outside the catalog are always denied.
 *
 * Registered as a scoped binding, so results are memoized for one request only and a
 * suspension or permission change takes effect on the next request.
 */
class PermissionResolver
{
    /** @var array<int, array<string, PermissionDecision>> */
    private array $memo = [];

    public function allows(User $user, PermissionKey $permission): bool
    {
        return $this->decisionsFor($user)[$permission->value]->granted;
    }

    /**
     * @return list<PermissionKey>
     */
    public function effectivePermissions(User $user): array
    {
        return array_values(array_map(
            fn (PermissionDecision $decision): PermissionKey => $decision->permission,
            array_filter($this->decisionsFor($user), fn (PermissionDecision $decision): bool => $decision->granted),
        ));
    }

    /**
     * @return array<string, PermissionDecision>
     */
    public function decisionsFor(User $user): array
    {
        if ($user->getKey() !== null && isset($this->memo[$user->getKey()])) {
            return $this->memo[$user->getKey()];
        }

        $user->loadMissing('roles.permissions', 'permissionOverrides');

        $decisions = $this->resolve(
            $user->isActive(),
            $this->rolePermissionMap($user->roles),
            $user->permissionOverrides
                ->mapWithKeys(fn ($permission): array => [
                    $permission->key->value => PermissionEffect::from($permission->pivot->effect),
                ])
                ->all(),
        );

        if ($user->getKey() !== null) {
            $this->memo[$user->getKey()] = $decisions;
        }

        return $decisions;
    }

    /**
     * Resolve what a user's permissions WOULD be with the given roles and overrides, without saving.
     *
     * @param  list<int>  $roleIds
     * @param  array<string, PermissionEffect>  $overrides  Keyed by permission key.
     * @return array<string, PermissionDecision>
     */
    public function preview(User $user, array $roleIds, array $overrides): array
    {
        $roles = Role::query()->with('permissions')->whereKey($roleIds)->get();

        return $this->resolve($user->isActive(), $this->rolePermissionMap($roles), $overrides);
    }

    public function forget(User $user): void
    {
        unset($this->memo[$user->getKey()]);
    }

    /**
     * @param  array<string, list<string>>  $rolePermissions  Role key => permission keys.
     * @param  array<string, PermissionEffect>  $overrides  Permission key => effect.
     * @return array<string, PermissionDecision>
     */
    public function resolve(bool $accountActive, array $rolePermissions, array $overrides): array
    {
        $decisions = [];

        foreach (PermissionKey::cases() as $permission) {
            $grantingRoles = array_keys(array_filter(
                $rolePermissions,
                fn (array $keys): bool => in_array($permission->value, $keys, true),
            ));
            $override = $overrides[$permission->value] ?? null;

            [$granted, $reason] = match (true) {
                ! $accountActive => [false, 'The account is suspended, revoked or expired.'],
                $override === PermissionEffect::Deny => [false, 'Denied by an individual override.'],
                $override === PermissionEffect::Allow => [true, 'Allowed by an individual override.'],
                $grantingRoles !== [] => [true, 'Granted by role: '.implode(', ', $grantingRoles).'.'],
                default => [false, 'Not granted by any role (denied by default).'],
            };

            $decisions[$permission->value] = new PermissionDecision($permission, $granted, $grantingRoles, $override, $reason);
        }

        return $decisions;
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
}
