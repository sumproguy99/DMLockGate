<?php

namespace App\Http\Requests\Users;

use App\Enums\PermissionKey;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Foundation\Http\FormRequest;

class UpdateUserRolesRequest extends FormRequest
{
    /**
     * Checked before validation; the controller checks the full rules about the target user.
     */
    public function authorize(): bool
    {
        app(UserManagementGuard::class)->requirePermission($this->user(), PermissionKey::UsersAssignRoles, 'user.roles_changed');

        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'roles' => ['present', 'array', 'max:20'],
            'roles.*' => ['string', 'distinct', 'exists:roles,key'],
            'reason' => ['nullable', 'string', 'max:255'],
        ];
    }
}
