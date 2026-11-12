<?php

namespace App\Http\Requests\Users;

use App\Enums\PermissionKey;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class ChangeUserStatusRequest extends FormRequest
{
    /**
     * The permission each status route needs, as UserStatusController checks it.
     *
     * @var array<string, array{0: PermissionKey, 1: string}>
     */
    private const PERMISSIONS = [
        'api.v1.users.suspend' => [PermissionKey::UsersSuspend, 'user.suspended'],
        'api.v1.users.reactivate' => [PermissionKey::UsersReactivate, 'user.reactivated'],
        'api.v1.users.revoke' => [PermissionKey::UsersRevoke, 'user.revoked'],
        'api.v1.users.sessions.revoke' => [PermissionKey::DevicesRevokeSessions, 'user.sessions_revoked'],
        'api.v1.users.mfa.reset' => [PermissionKey::AdminSecurityPolicies, 'user.mfa_reset'],
    ];

    /**
     * Checked before validation, so someone without the permission is refused whatever they send;
     * the controller checks the full rules about the target user.
     */
    public function authorize(): bool
    {
        [$permission, $action] = self::PERMISSIONS[$this->route()?->getName()] ?? throw new LogicException('ChangeUserStatusRequest is used on an unknown route.');
        app(UserManagementGuard::class)->requirePermission($this->user(), $permission, $action);

        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:3', 'max:255'],
        ];
    }
}
