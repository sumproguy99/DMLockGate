<?php

namespace App\Http\Resources;

use App\Models\AccessRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A lock/unlock request with its lifecycle status, decision, command and confirmation kept apart.
 *
 * @mixin AccessRequest
 */
class AccessRequestResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $command = $this->command;

        return [
            'id' => $this->public_id,
            'lock_id' => $this->lock_id,
            'user_id' => $this->user_id,
            'action' => $this->action->value,
            'channel' => $this->channel->value,
            'status' => $this->status->value,
            'status_message' => $this->status->message(),
            'is_final' => $this->status->isFinal(),
            'requested_at' => $this->requested_at->toIso8601ZuluString('millisecond'),
            'expires_at' => $this->expires_at->toIso8601ZuluString('millisecond'),
            'completed_at' => $this->completed_at?->toIso8601ZuluString('millisecond'),
            'decision' => $this->decision === null ? null : [
                'decision' => $this->decision->decision,
                'reason_code' => $this->decision->reason_code,
                'reason' => $this->decision->reason,
                'checks' => $this->decision->checks,
            ],
            'command' => $command === null ? null : [
                'submitted_at' => $command->submitted_at?->toIso8601ZuluString('millisecond'),
                'integration_result' => $command->integration_result,
                'integration_latency_ms' => $command->integration_latency_ms,
                'integration_error' => $command->integration_error,
                'confirmation' => $command->confirmation,
                'confirmation_source' => $command->confirmation_source,
                'confirmed_at' => $command->confirmed_at?->toIso8601ZuluString('millisecond'),
            ],
        ];
    }
}
