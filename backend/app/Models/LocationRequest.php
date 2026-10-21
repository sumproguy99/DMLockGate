<?php

namespace App\Models;

use App\Enums\LocationRequestStatus;
use Database\Factories\LocationRequestFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * An administrator's request for a user's location. The user's phone answers it silently while
 * LockGuard is open there (they agreed to this at sign-in); otherwise it expires unanswered.
 */
class LocationRequest extends Model
{
    /** @use HasFactory<LocationRequestFactory> */
    use HasFactory;

    protected $guarded = [];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => LocationRequestStatus::class,
            'requested_at' => 'datetime',
            'expires_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    /**
     * Mark every unanswered request past its expiry as expired.
     */
    public static function expireDue(): void
    {
        static::query()
            ->where('status', LocationRequestStatus::Pending)
            ->where('expires_at', '<', now())
            ->update(['status' => LocationRequestStatus::Expired, 'completed_at' => now()]);
    }

    public function isOpen(): bool
    {
        return $this->status === LocationRequestStatus::Pending && $this->expires_at->isFuture();
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function target(): BelongsTo
    {
        return $this->belongsTo(User::class, 'target_user_id');
    }

    /**
     * @return HasOne<LocationReport, $this>
     */
    public function report(): HasOne
    {
        return $this->hasOne(LocationReport::class);
    }
}
