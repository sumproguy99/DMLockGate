<?php

namespace App\Services\Authorization;

use App\Enums\PermissionEffect;
use App\Enums\PermissionKey;

/**
 * The resolved outcome for one permission, with the reason, so the permission preview can
 * show administrators exactly why each permission is granted or denied.
 */
final readonly class PermissionDecision
{
    /**
     * @param  list<string>  $grantingRoles  Keys of the roles that include this permission.
     */
    public function __construct(
        public PermissionKey $permission,
        public bool $granted,
        public array $grantingRoles,
        public ?PermissionEffect $override,
        public string $reason,
    ) {}

    /**
     * @return array{key: string, group: string, label: string, sensitive: bool, granted: bool, granting_roles: list<string>, override: ?string, reason: string}
     */
    public function toArray(): array
    {
        return [
            'key' => $this->permission->value,
            'group' => $this->permission->group(),
            'label' => $this->permission->label(),
            'sensitive' => $this->permission->isSensitive(),
            'granted' => $this->granted,
            'granting_roles' => $this->grantingRoles,
            'override' => $this->override?->value,
            'reason' => $this->reason,
        ];
    }
}
