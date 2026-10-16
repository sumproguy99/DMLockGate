<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\AccessRequest;
use App\Models\User;
use App\Services\Authorization\PermissionResolver;

class AccessRequestPolicy
{
    public function __construct(private readonly PermissionResolver $permissions) {}

    /**
     * The requester can follow their own request; administrators with lock history access can see any.
     */
    public function view(User $user, AccessRequest $accessRequest): bool
    {
        return $accessRequest->user_id === $user->id
            || ($this->permissions->allows($user, PermissionKey::LockViewHistory) && $this->permissions->allows($user, PermissionKey::DevicesView));
    }
}
