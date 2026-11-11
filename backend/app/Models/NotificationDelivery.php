<?php

namespace App\Models;

use Database\Factories\NotificationDeliveryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One notification sent outside the app (today: an alert email), with its delivery status.
 *
 * Status: queued (waiting for the queue worker), retrying (a try failed; another is due), sent,
 * failed (every try failed) or skipped (no longer wanted when its turn came, such as a suspended
 * account). A failed delivery never changes the alert or its audit record.
 */
class NotificationDelivery extends Model
{
    /** @use HasFactory<NotificationDeliveryFactory> */
    use HasFactory;

    public const CHANNEL_EMAIL = 'email';

    public const STATUS_QUEUED = 'queued';

    public const STATUS_RETRYING = 'retrying';

    public const STATUS_SENT = 'sent';

    public const STATUS_FAILED = 'failed';

    public const STATUS_SKIPPED = 'skipped';

    protected $guarded = [];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'mandatory' => 'boolean',
            'attempts' => 'integer',
            'sent_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<SecurityAlert, $this>
     */
    public function alert(): BelongsTo
    {
        return $this->belongsTo(SecurityAlert::class, 'security_alert_id');
    }
}
