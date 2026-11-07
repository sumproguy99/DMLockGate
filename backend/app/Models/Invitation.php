<?php

namespace App\Models;

use Database\Factories\InvitationFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * An emailed invitation to create a LockGuard account, complete the training and register a
 * device. The link token and the held registration code are stored only as hashes.
 */
class Invitation extends Model
{
    /** @use HasFactory<InvitationFactory> */
    use HasFactory;

    protected $guarded = [];

    protected $hidden = ['token_hash', 'code_hash'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'roles' => 'array',
            'lessons_completed' => 'array',
            'quiz_question_ids' => 'array',
            'expires_at' => 'datetime',
            'sent_at' => 'datetime',
            'accepted_at' => 'datetime',
            'training_completed_at' => 'datetime',
            'device_registered_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    /**
     * Where the invitation stands: pending (not accepted yet), training, device (training done,
     * device not registered yet), completed, expired or cancelled.
     */
    public function status(): string
    {
        return match (true) {
            $this->device_registered_at !== null => 'completed',
            $this->cancelled_at !== null => 'cancelled',
            $this->isExpired() => 'expired',
            $this->accepted_at === null => 'pending',
            $this->training_completed_at === null => 'training',
            default => 'device',
        };
    }

    /**
     * An account that has not been created yet must be created before the link expires. Once the
     * account exists, the held registration code's own expiry applies instead.
     */
    public function isExpired(): bool
    {
        return $this->expires_at->isPast() && ($this->accepted_at === null || $this->registrationCode?->expires_at?->isPast() !== false);
    }

    /**
     * Whether the link can still be used for the next step.
     */
    public function isOpen(): bool
    {
        return in_array($this->status(), ['pending', 'training', 'device'], true);
    }

    /**
     * @return list<string>
     */
    public function completedLessons(): array
    {
        return array_values((array) ($this->lessons_completed ?? []));
    }

    /**
     * Invitations whose link still works for an account that does not exist yet.
     *
     * @param  Builder<self>  $query
     */
    public function scopeAwaitingAccount(Builder $query): void
    {
        $query->whereNull('accepted_at')->whereNull('cancelled_at')->where('expires_at', '>', now());
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * The registration code held for this invitation, once the account exists.
     *
     * @return HasOne<DeviceRegistrationCode, $this>
     */
    public function registrationCode(): HasOne
    {
        return $this->hasOne(DeviceRegistrationCode::class)->latestOfMany();
    }
}
