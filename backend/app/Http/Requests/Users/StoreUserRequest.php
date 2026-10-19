<?php

namespace App\Http\Requests\Users;

use App\Enums\PermissionKey;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * Full authorization (including anti-escalation) is done by UserManagementGuard in the controller, so it can be audited.
 */
class StoreUserRequest extends FormRequest
{
    /**
     * The permission is checked before validation too, so someone without it learns nothing from the
     * validation errors, such as whether an email address already has an account.
     */
    public function authorize(): bool
    {
        app(UserManagementGuard::class)->requirePermission($this->user(), PermissionKey::UsersCreate, 'user.created');

        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'username' => ['nullable', 'string', 'min:3', 'max:64', 'alpha_dash:ascii', 'unique:users,username'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'max:1024', 'confirmed', Password::min(12)->letters()->numbers()],
            'account_expires_at' => ['nullable', 'date', 'after:now'],
            'admin_notes' => ['nullable', 'string', 'max:5000'],
            'roles' => ['sometimes', 'array', 'max:20'],
            'roles.*' => ['string', 'distinct', 'exists:roles,key'],
        ];
    }
}
