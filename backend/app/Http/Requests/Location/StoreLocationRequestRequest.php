<?php

namespace App\Http\Requests\Location;

use App\Enums\PermissionKey;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Foundation\Http\FormRequest;

class StoreLocationRequestRequest extends FormRequest
{
    /**
     * Checked before validation, so someone without the permission learns nothing about which users exist.
     */
    public function authorize(): bool
    {
        app(UserManagementGuard::class)->requirePermission($this->user(), PermissionKey::LocationViewHistory, 'location.requested');

        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ];
    }
}
