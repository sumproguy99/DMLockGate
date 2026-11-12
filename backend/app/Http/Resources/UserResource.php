<?php

namespace App\Http\Resources;

use App\Enums\PermissionKey;
use App\Models\User;
use App\Services\Auth\SecurityPolicy;
use App\Services\Authorization\PermissionResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin User
 */
class UserResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
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
            'account_expires_at' => $this->account_expires_at?->toIso8601String(),
            'mfa_enabled' => $this->mfa_confirmed_at !== null,
            // Whether the user's role must use two-step sign-in, and whether they still have to set it up.
            'mfa_required' => app(SecurityPolicy::class)->requiresMfa($this->resource->loadMissing('roles')),
            'password_change_required' => (bool) $this->password_change_required,
            'mfa_setup_required' => app(SecurityPolicy::class)->owesMfaSetup($this->resource),
            'last_login_at' => $this->last_login_at?->toIso8601String(),
            'roles' => $this->whenLoaded('roles', fn () => $this->roles->map(fn ($role): array => [
                'key' => $role->key,
                'name' => $role->name,
            ])->values()),
            'permissions' => $this->when(
                $request->user()?->is($this->resource) ?? false,
                fn () => array_map(
                    fn (PermissionKey $key): string => $key->value,
                    app(PermissionResolver::class)->effectivePermissions($this->resource),
                ),
            ),
        ];
    }
}
