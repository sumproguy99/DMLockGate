<?php

namespace App\Http\Resources;

use App\Enums\ReportedLockState;
use App\Models\Lock;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A lock with its latest REPORTED state. state_freshness tells clients whether that report can be
 * relied on; the state is never inferred from the last command.
 *
 * @mixin Lock
 */
class LockResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'property' => $this->whenLoaded('property', fn () => ['id' => $this->property->id, 'name' => $this->property->name]),
            'vendor' => $this->vendor,
            'model' => $this->model,
            'external_id' => $this->external_id,
            'firmware_version' => $this->firmware_version,
            'registration_status' => $this->registration_status,
            'commands_enabled' => $this->commands_enabled,
            'connection_status' => $this->connection_status->value,
            'reported_state' => $this->last_reported_state->value,
            'state_freshness' => match (true) {
                $this->last_reported_state === ReportedLockState::Unknown || $this->last_state_observed_at === null => 'unknown',
                $this->stateIsStale() => 'stale',
                default => 'current',
            },
            'state_observed_at' => $this->last_state_observed_at?->toIso8601ZuluString('millisecond'),
            'state_source' => $this->last_state_source,
            'battery_level' => $this->battery_level,
            'battery_observed_at' => $this->battery_observed_at?->toIso8601ZuluString('millisecond'),
            'last_communication_at' => $this->last_communication_at?->toIso8601ZuluString('millisecond'),
            'last_error' => $this->last_error,
            'last_error_at' => $this->last_error_at?->toIso8601ZuluString('millisecond'),
        ];
    }
}
