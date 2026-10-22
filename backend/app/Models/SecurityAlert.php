<?php

namespace App\Models;

use App\Enums\AlertRule;
use App\Enums\AlertSeverity;
use App\Enums\AlertStatus;
use App\Services\Security\AlertEngine;
use Database\Factories\SecurityAlertFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One problem the alert engine noticed. Repeats of the same problem update this row (occurrences,
 * last_seen_at) instead of adding new ones. Written only by {@see AlertEngine} and the alert
 * actions in the Security Center.
 */
class SecurityAlert extends Model
{
    /** @use HasFactory<SecurityAlertFactory> */
    use HasFactory;

    public const RESOLUTION_MANUAL = 'manual';

    /** A condition alert whose condition went away. */
    public const RESOLUTION_CLEARED = 'cleared';

    /** An event alert with no new occurrences for the quiet period. */
    public const RESOLUTION_QUIET = 'quiet';

    /** Resolved together with its incident. */
    public const RESOLUTION_INCIDENT = 'incident';

    protected $guarded = [];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'rule' => AlertRule::class,
            'severity' => AlertSeverity::class,
            'status' => AlertStatus::class,
            'context' => 'array',
            'first_seen_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'notified_at' => 'datetime',
            'acknowledged_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    /**
     * @param  Builder<self>  $query
     */
    public function scopeActive(Builder $query): void
    {
        $query->whereIn('status', AlertStatus::active());
    }

    public function isActive(): bool
    {
        return in_array($this->status, AlertStatus::active(), true);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function subjectUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'subject_user_id');
    }

    /**
     * @return BelongsTo<Lock, $this>
     */
    public function subjectLock(): BelongsTo
    {
        return $this->belongsTo(Lock::class, 'subject_lock_id');
    }

    /**
     * @return BelongsTo<SecurityIncident, $this>
     */
    public function incident(): BelongsTo
    {
        return $this->belongsTo(SecurityIncident::class, 'security_incident_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function acknowledger(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acknowledged_by');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
