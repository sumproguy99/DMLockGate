<?php

namespace App\Http\Requests\Users;

use App\Enums\PermissionEffect;
use App\Enums\PermissionKey;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Replaces the user's complete set of individual overrides.
 */
class UpdateUserPermissionsRequest extends FormRequest
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
            'overrides' => ['present', 'array', 'max:'.count(PermissionKey::cases())],
            'overrides.*.permission' => ['required', 'string', 'distinct', Rule::enum(PermissionKey::class)],
            'overrides.*.effect' => ['required', 'string', Rule::enum(PermissionEffect::class)],
            'overrides.*.reason' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<string, PermissionEffect>
     */
    public function overrideEffects(): array
    {
        return collect($this->validated('overrides'))
            ->mapWithKeys(fn (array $override): array => [$override['permission'] => PermissionEffect::from($override['effect'])])
            ->all();
    }
}
