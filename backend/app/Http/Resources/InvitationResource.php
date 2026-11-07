<?php

namespace App\Http\Resources;

use App\Models\Invitation;
use App\Services\Invitations\TrainingCatalog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An invitation as administrators see it. Never includes the link token or the registration code.
 *
 * @mixin Invitation
 */
class InvitationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $iso = fn ($value): ?string => $value?->toIso8601ZuluString('millisecond');

        return [
            'id' => $this->public_id,
            'email' => $this->email,
            'name' => $this->name,
            'roles' => $this->roles ?? [],
            'message' => $this->message,
            'status' => $this->status(),
            'invited_by' => $this->inviter?->name,
            'user' => $this->user ? ['id' => $this->user->id, 'name' => $this->user->name] : null,
            'expires_at' => $iso($this->expires_at),
            'sent_at' => $iso($this->sent_at),
            'send_count' => $this->send_count,
            'last_send_error' => $this->last_send_error,
            'accepted_at' => $iso($this->accepted_at),
            'lessons_completed' => count($this->completedLessons()),
            'lessons_total' => count(TrainingCatalog::LESSONS),
            'quiz_attempts' => $this->quiz_attempts,
            'training_completed_at' => $iso($this->training_completed_at),
            'device_registered_at' => $iso($this->device_registered_at),
            'cancelled_at' => $iso($this->cancelled_at),
            'created_at' => $iso($this->created_at),
        ];
    }
}
