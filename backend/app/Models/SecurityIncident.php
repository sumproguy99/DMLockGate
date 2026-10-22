<?php

namespace App\Models;

use App\Enums\AlertSeverity;
use App\Enums\IncidentStatus;
use Database\Factories\SecurityIncidentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A security incident: related alerts grouped for investigation, with a recorded history of every
 * status change and who made it. subject_key ("lock:3", "user:7", "integration") lets the alert
 * engine add new related alerts to an incident that is still open.
 */
class SecurityIncident extends Model
{
    /** @use HasFactory<SecurityIncidentFactory> */
    use HasFactory;

    protected $guarded = [];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'severity' => AlertSeverity::class,
            'status' => IncidentStatus::class,
            'opened_at' => 'datetime',
            'resolved_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    /**
     * @return HasMany<SecurityAlert, $this>
     */
    public function alerts(): HasMany
    {
        return $this->hasMany(SecurityAlert::class);
    }

    /**
     * @return HasMany<SecurityIncidentEvent, $this>
     */
    public function events(): HasMany
    {
        return $this->hasMany(SecurityIncidentEvent::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function opener(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by');
    }
}
