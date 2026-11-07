<?php

namespace App\Http\Requests\Devices;

use App\Enums\PermissionKey;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class ManageDeviceRequest extends FormRequest
{
    /**
     * The permission each device route needs, as UserDeviceController checks it.
     *
     * @var array<string, array{0: PermissionKey, 1: string}>
     */
    private const PERMISSIONS = [
        'api.v1.devices.trust' => [PermissionKey::DevicesEnroll, 'device.trusted'],
        'api.v1.devices.update' => [PermissionKey::DevicesRename, 'device.renamed'],
        'api.v1.devices.revoke' => [PermissionKey::DevicesRevoke, 'device.revoked'],
    ];

    /**
     * Checked before validation, so someone without the permission is refused whatever they send;
     * the controller checks the full rules about the device's owner.
     */
    public function authorize(): bool
    {
        [$permission, $action] = $this->permission();
        app(UserManagementGuard::class)->requirePermission($this->user(), $permission, $action);

        return true;
    }

    /**
     * @return array{0: PermissionKey, 1: string}
     */
    public function permission(): array
    {
        return self::PERMISSIONS[$this->route()?->getName()] ?? throw new LogicException('ManageDeviceRequest is used on an unknown route.');
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return match ($this->route()?->getName()) {
            'api.v1.devices.update' => ['name' => ['required', 'string', 'min:1', 'max:80']],
            'api.v1.devices.revoke' => [
                'reason' => ['required', 'string', 'min:3', 'max:255'],
                'lost' => ['sometimes', 'boolean'],
            ],
            default => [],
        };
    }
}
