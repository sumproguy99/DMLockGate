<?php

namespace App\Http\Resources;

use App\Models\SecurityAlert;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One security alert for the Security Center. The detail view adds the rule's context.
 *
 * @mixin SecurityAlert
 */
class SecurityAlertResource extends JsonResource
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
        $person = fn (?User $user, ?int $id): ?array => $id === null ? null : ['id' => $id, 'name' => $user?->name];
        $at = fn ($value): ?string => $value?->toIso8601ZuluString('millisecond');

        $base = [
            'id' => $this->public_id,
            'rule' => $this->rule->value,
            'rule_label' => $this->rule->label(),
            'category' => $this->rule->category(),
            'is_condition' => $this->rule->isCondition(),
            'severity' => $this->severity->value,
            'status' => $this->status->value,
            'title' => $this->title,
            'description' => $this->description,
            'occurrences' => $this->occurrences,
            'first_seen_at' => $at($this->first_seen_at),
            'last_seen_at' => $at($this->last_seen_at),
            'subject_user' => $person($this->subjectUser, $this->subject_user_id),
            'subject_lock' => $this->subject_lock_id === null ? null : ['id' => $this->subject_lock_id, 'name' => $this->subjectLock?->name],
            'subject_ip' => $this->subject_ip,
            'incident' => $this->incident === null ? null : [
                'id' => $this->incident->public_id,
                'title' => $this->incident->title,
                'status' => $this->incident->status->value,
            ],
            'acknowledged_by' => $person($this->acknowledger, $this->acknowledged_by),
            'acknowledged_at' => $at($this->acknowledged_at),
            'resolved_by' => $person($this->resolver, $this->resolved_by),
            'resolved_at' => $at($this->resolved_at),
            'resolution' => $this->resolution,
            'resolution_note' => $this->resolution_note,
            'last_event_id' => $this->last_event_id,
        ];

        return $this->detail ? [...$base, 'context' => $this->context] : $base;
    }
}
