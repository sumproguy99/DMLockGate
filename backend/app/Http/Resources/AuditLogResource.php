<?php

namespace App\Http\Resources;

use App\Models\AuditLog;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One audit record. The list shows who did what to whom; the detail view adds the request context,
 * the (already redacted) metadata and the hash chain fields.
 *
 * @mixin AuditLog
 */
class AuditLogResource extends JsonResource
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
        $base = [
            'event_id' => $this->event_id,
            'occurred_at' => CarbonImmutable::parse($this->occurred_at, 'UTC')->toIso8601ZuluString('millisecond'),
            'action' => $this->action,
            'outcome' => $this->outcome->value,
            'actor_type' => $this->actor_type->value,
            'actor' => $this->actor_user_id === null ? null : ['id' => $this->actor_user_id, 'name' => $this->actor?->name],
            'target_user' => $this->target_user_id === null ? null : ['id' => $this->target_user_id, 'name' => $this->targetUser?->name],
            'target_lock' => $this->target_lock_id === null ? null : ['id' => $this->target_lock_id, 'name' => $this->targetLock?->name],
            'target_device_id' => $this->target_device_id,
            'reason' => $this->reason,
        ];

        if (! $this->detail) {
            return $base;
        }

        return [
            ...$base,
            'metadata' => $this->metadata,
            'correlation_id' => $this->correlation_id,
            'session_ref' => $this->session_ref,
            'ip_address' => $this->ip_address,
            'user_agent' => $this->user_agent,
            'previous_hash' => $this->previous_hash,
            'hash' => $this->hash,
        ];
    }
}
