<?php

namespace App\Http\Resources;

use App\Models\UserDevice;
use App\Services\Auth\DeviceRegistry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One device of a user. `current` says whether it is the device making this request; the cookie
 * token and its hash are never returned. `user` is included for lists across accounts.
 *
 * @mixin UserDevice
 */
class UserDeviceResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $at = fn ($value): ?string => $value?->toIso8601ZuluString('millisecond');
        $current = $request->attributes->get('device');

        return [
            'id' => $this->public_id,
            'name' => $this->name,
            'status' => $this->status->value,
            'current' => $current instanceof UserDevice && $current->is($this->resource),
            'browser' => DeviceRegistry::describeUserAgent($this->user_agent),
            'last_ip_address' => $this->last_ip_address,
            'first_seen_at' => $at($this->first_seen_at),
            'last_seen_at' => $at($this->last_seen_at),
            'registered_at' => $at($this->registered_at),
            'trusted_at' => $at($this->trusted_at),
            'trusted_by' => $this->trusted_by === null ? null : ['id' => $this->trusted_by, 'name' => $this->truster?->name],
            'revoked_at' => $at($this->revoked_at),
            'revoked_by' => $this->revoked_by === null ? null : ['id' => $this->revoked_by, 'name' => $this->revoker?->name],
            'revoke_reason' => $this->revoke_reason,
            'reported_lost' => $this->reported_lost,
            'user' => $this->whenLoaded('user', fn (): array => ['id' => $this->user->id, 'name' => $this->user->name, 'email' => $this->user->email]),
        ];
    }
}
