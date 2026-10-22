<?php

namespace App\Models;

use App\Enums\IncidentStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One entry in an incident's history: a status change, a note, or an alert joining it. A null
 * actor is the alert engine.
 */
class SecurityIncidentEvent extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'from_status' => IncidentStatus::class,
            'to_status' => IncidentStatus::class,
            'occurred_at' => 'datetime',
        ];
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
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
