<?php

namespace App\Http\Requests\Users;

use App\Enums\PermissionKey;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUserRequest extends FormRequest
{
    /**
     * Checked before validation so the errors reveal nothing (such as an email already in use); the
     * controller checks the full rules about the target user.
     */
    public function authorize(): bool
    {
        app(UserManagementGuard::class)->requirePermission($this->user(), PermissionKey::UsersEdit, 'user.updated');

        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $userId = $this->route('user')->id;

        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'username' => ['sometimes', 'nullable', 'string', 'min:3', 'max:64', 'alpha_dash:ascii', Rule::unique('users', 'username')->ignore($userId)],
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($userId)],
            'account_expires_at' => ['sometimes', 'nullable', 'date'],
            'admin_notes' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ];
    }
}
