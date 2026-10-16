<?php

namespace App\Http\Requests\Users;

use App\Enums\PermissionEffect;
use App\Enums\PermissionKey;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Proposed roles and overrides for an existing user (user_id) or a user not yet created.
 */
class PermissionPreviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'roles' => ['sometimes', 'array', 'max:20'],
            'roles.*' => ['string', 'distinct', 'exists:roles,key'],
            'overrides' => ['sometimes', 'array', 'max:'.count(PermissionKey::cases())],
            'overrides.*.permission' => ['required', 'string', 'distinct', Rule::enum(PermissionKey::class)],
            'overrides.*.effect' => ['required', 'string', Rule::enum(PermissionEffect::class)],
        ];
    }

    /**
     * @return array<string, PermissionEffect>
     */
    public function overrideEffects(): array
    {
        return collect($this->validated('overrides', []))
            ->mapWithKeys(fn (array $override): array => [$override['permission'] => PermissionEffect::from($override['effect'])])
            ->all();
    }
}
