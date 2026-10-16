<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\Lock;
use App\Models\User;
use App\Services\Authorization\PermissionResolver;

/**
 * Read access to locks. Commands are authorized by LockCommandService, not here.
 */
class LockPolicy
{
    public function __construct(private readonly PermissionResolver $permissions) {}

    /**
     * Administrators with devices.view see every lock; everyone else sees only locks they were given
     * access to, and only with lock.view_status.
     */
    public function view(User $user, Lock $lock): bool
    {
        if ($this->permissions->allows($user, PermissionKey::DevicesView)) {
            return true;
        }

        return $this->permissions->allows($user, PermissionKey::LockViewStatus)
            && $user->locks()->whereKey($lock->id)->exists();
    }

    public function viewHistory(User $user, Lock $lock): bool
    {
        return $this->permissions->allows($user, PermissionKey::LockViewHistory)
            && ($this->permissions->allows($user, PermissionKey::DevicesView) || $user->locks()->whereKey($lock->id)->exists());
    }

    public function manage(User $user): bool
    {
        return $this->permissions->allows($user, PermissionKey::AdminIntegrationSettings);
    }
}
