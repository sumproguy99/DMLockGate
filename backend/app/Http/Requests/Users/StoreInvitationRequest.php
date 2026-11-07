<?php

namespace App\Http\Requests\Users;

use App\Enums\PermissionKey;
use App\Models\Invitation;
use App\Services\Authorization\UserManagementGuard;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Inviting someone. Role anti-escalation is checked by InvitationService, so it can be audited.
 */
class StoreInvitationRequest extends FormRequest
{
    /**
     * The permission is checked before validation, so someone without it learns nothing from the
     * validation errors, such as whether an email address already has an account.
     */
    public function authorize(): bool
    {
        app(UserManagementGuard::class)->requirePermission($this->user(), PermissionKey::UsersCreate, 'invitation.created');

        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'email' => [
                'required', 'string', 'email', 'max:255',
                'unique:users,email',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (Invitation::query()->awaitingAccount()->where('email', strtolower(trim((string) $value)))->exists()) {
                        $fail('This person already has an invitation waiting. Send it again from the list instead.');
                    }
                },
            ],
            'name' => ['nullable', 'string', 'max:255'],
            'message' => ['nullable', 'string', 'max:1000'],
            'roles' => ['sometimes', 'array', 'max:20'],
            'roles.*' => ['string', 'distinct', 'exists:roles,key'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return ['email.unique' => 'Someone already has an account with this email.'];
    }
}
