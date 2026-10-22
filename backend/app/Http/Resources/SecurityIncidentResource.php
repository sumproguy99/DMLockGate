<?php

namespace App\Http\Resources;

use App\Models\SecurityIncident;
use App\Models\SecurityIncidentEvent;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One security incident. The detail view adds its alerts and its full status history.
 *
 * @mixin SecurityIncident
 */
class SecurityIncidentResource extends JsonResource
{
    private bool $detail = false;

    public function withDetail(): static
    {
        $this->detail = true;

        return $this;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $at = fn ($value): ?string => $value?->toIso8601ZuluString('millisecond');

        $base = [
            'id' => $this->public_id,
            'title' => $this->title,
            'description' => $this->description,
            'severity' => $this->severity->value,
            'status' => $this->status->value,
            'opened_by' => $this->opened_by === null ? null : ['id' => $this->opened_by, 'name' => $this->opener?->name],
            'opened_at' => $at($this->opened_at),
            'resolved_at' => $at($this->resolved_at),
            'closed_at' => $at($this->closed_at),
            'updated_at' => $at($this->updated_at),
            'alert_count' => $this->alerts_count ?? $this->alerts()->count(),
        ];

        if (! $this->detail) {
            return $base;
        }

        return [
            ...$base,
            'alerts' => SecurityAlertResource::collection($this->alerts)->resolve($request),
            'history' => $this->events->map(fn (SecurityIncidentEvent $event): array => [
                'at' => $at($event->occurred_at),
                'actor' => $event->actor_user_id === null ? null : ['id' => $event->actor_user_id, 'name' => $event->actor?->name],
                'from_status' => $event->from_status?->value,
                'to_status' => $event->to_status?->value,
                'note' => $event->note,
            ])->all(),
        ];
    }
}
