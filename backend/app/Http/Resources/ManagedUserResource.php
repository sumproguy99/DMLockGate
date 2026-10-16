<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A user as administrators see them in user management. Never includes secrets.
 *
 * @mixin User
 */
class ManagedUserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'username' => $this->username,
            'email' => $this->email,
            'status' => $this->status?->value,
            'status_changed_at' => $this->status_changed_at?->toIso8601String(),
            'account_expires_at' => $this->account_expires_at?->toIso8601String(),
            'is_active' => $this->isActive(),
            'mfa_enabled' => $this->mfa_confirmed_at !== null,
            'created_at' => $this->created_at?->toIso8601String(),
            'last_login_at' => $this->last_login_at?->toIso8601String(),
            'last_access_event_at' => $this->last_access_event_at?->toIso8601String(),
            'admin_notes' => $this->admin_notes,
            'roles' => $this->whenLoaded('roles', fn () => $this->roles->map(fn ($role): array => [
                'key' => $role->key,
                'name' => $role->name,
            ])->values()),
            'permission_overrides' => $this->whenLoaded('permissionOverrides', fn () => $this->permissionOverrides->map(fn ($permission): array => [
                'permission' => $permission->key->value,
                'effect' => $permission->pivot->effect,
                'reason' => $permission->pivot->reason,
            ])->values()),
        ];
    }
}
