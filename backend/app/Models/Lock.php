<?php

namespace App\Models;

use App\Enums\LockConnectionStatus;
use App\Enums\ReportedLockState;
use App\Services\Locks\LockStateRecorder;
use Database\Factories\LockFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A registered physical lock. The last_* attributes are the latest observation reported by the
 * lock; they are written only by {@see LockStateRecorder}.
 */
#[Fillable(['property_id', 'name', 'vendor', 'model', 'external_id', 'firmware_version', 'registration_status', 'commands_enabled'])]
class Lock extends Model
{
    /** @use HasFactory<LockFactory> */
    use HasFactory;

    public const REGISTRATION_ACTIVE = 'active';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'commands_enabled' => 'boolean',
            'connection_status' => LockConnectionStatus::class,
            'last_reported_state' => ReportedLockState::class,
            'last_state_observed_at' => 'datetime',
            'battery_observed_at' => 'datetime',
            'last_communication_at' => 'datetime',
            'last_error_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Property, $this>
     */
    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    /**
     * @return BelongsToMany<User, $this>
     */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_lock_access')
            ->withPivot('valid_from', 'valid_until', 'granted_by')
            ->withTimestamps();
    }

    /**
     * @return HasMany<LockStateEvent, $this>
     */
    public function stateEvents(): HasMany
    {
        return $this->hasMany(LockStateEvent::class);
    }

    /**
     * @return HasMany<AccessRequest, $this>
     */
    public function accessRequests(): HasMany
    {
        return $this->hasMany(AccessRequest::class);
    }

    public function isRegistered(): bool
    {
        return $this->registration_status === self::REGISTRATION_ACTIVE;
    }

    /**
     * Whether the reported state is too old to rely on.
     */
    public function stateIsStale(): bool
    {
        return $this->last_state_observed_at === null
            || $this->last_state_observed_at->lt(now()->subSeconds((int) config('lockguard.locks.state_stale_seconds')));
    }
}
