<?php

namespace App\Services\Auth;

use App\Models\AppSetting;
use App\Models\Role;
use App\Models\User;

/**
 * The security policy administrators set in the app (app_settings 'security').
 *
 * mfa_required_roles: holders of any of these roles must use two-step sign-in. An account that
 * must but has no authenticator (never set up, or just removed to move to a new phone) can only
 * set one up (EnsureMfaIsEnrolled). Until the policy is saved, the roles come from
 * config('lockguard.auth.mfa_required_roles').
 */
class SecurityPolicy
{
    public const KEY = 'security';

    /**
     * The role keys whose holders must use two-step sign-in.
     *
     * @return list<string>
     */
    public function mfaRequiredRoles(): array
    {
        $stored = $this->row()?->value;
        $roles = is_array($stored) && array_key_exists('mfa_required_roles', $stored)
            ? (array) $stored['mfa_required_roles']
            : (array) config('lockguard.auth.mfa_required_roles');

        return array_values(array_unique(array_filter($roles, 'is_string')));
    }

    /**
     * Whether the user holds a role that must use two-step sign-in.
     */
    public function requiresMfa(User $user): bool
    {
        $required = $this->mfaRequiredRoles();
        if ($required === []) {
            return false;
        }

        return $user->roles->contains(fn (Role $role): bool => in_array($role->key, $required, true));
    }

    /**
     * Whether the user must set up an authenticator before doing anything else.
     */
    public function owesMfaSetup(User $user): bool
    {
        return $user->mfa_confirmed_at === null && $this->requiresMfa($user);
    }

    /**
     * The policy as the settings page shows it: every role, whether it requires two-step sign-in,
     * and how many of its active holders have no authenticator yet.
     *
     * @return array<string, mixed>
     */
    public function forDisplay(): array
    {
        $row = $this->row(withUpdater: true);
        $required = $this->mfaRequiredRoles();

        $roles = Role::query()
            ->orderBy('id')
            ->get()
            ->map(fn (Role $role): array => [
                'key' => $role->key,
                'name' => $role->name,
                'mfa_required' => in_array($role->key, $required, true),
                'members' => $role->users()->count(),
                'members_without_mfa' => $role->users()->whereNull('mfa_confirmed_at')->count(),
            ])
            ->all();

        return [
            'mfa_required_roles' => $required,
            'roles' => $roles,
            'updated_at' => $row?->updated_at?->toIso8601ZuluString('millisecond'),
            'updated_by' => $row?->updatedBy?->name,
        ];
    }

    /**
     * @param  list<string>  $mfaRequiredRoles  Existing role keys.
     * @return array{added: list<string>, removed: list<string>}
     */
    public function save(array $mfaRequiredRoles, User $actor): array
    {
        $before = $this->mfaRequiredRoles();
        $after = array_values(array_unique($mfaRequiredRoles));

        $row = AppSetting::query()->firstOrNew(['key' => self::KEY]);
        $value = is_array($row->value) ? $row->value : [];
        $row->forceFill(['value' => [...$value, 'mfa_required_roles' => $after], 'updated_by' => $actor->id])->save();

        return [
            'added' => array_values(array_diff($after, $before)),
            'removed' => array_values(array_diff($before, $after)),
        ];
    }

    private function row(bool $withUpdater = false): ?AppSetting
    {
        $query = AppSetting::query()->where('key', self::KEY);

        return ($withUpdater ? $query->with('updatedBy:id,name') : $query)->first();
    }
}
