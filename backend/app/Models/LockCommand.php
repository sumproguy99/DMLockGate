<?php

namespace App\Models;

use App\Enums\LockAction;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The command for an authorized request.
 *
 * integration_result: 'acknowledged' (delivery ack only), 'rejected' (definitely not delivered) or
 * 'ambiguous' (may have reached the lock). confirmation: 'confirmed' or 'unconfirmed'.
 */
class LockCommand extends Model
{
    public const RESULT_ACKNOWLEDGED = 'acknowledged';

    public const RESULT_REJECTED = 'rejected';

    public const RESULT_AMBIGUOUS = 'ambiguous';

    public const CONFIRMED = 'confirmed';

    public const UNCONFIRMED = 'unconfirmed';

    protected $guarded = [];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'action' => LockAction::class,
            'queued_at' => 'datetime',
            'submitted_at' => 'datetime',
            'integration_responded_at' => 'datetime',
            'confirmed_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<AccessRequest, $this>
     */
    public function accessRequest(): BelongsTo
    {
        return $this->belongsTo(AccessRequest::class);
    }

    /**
     * @return BelongsTo<Lock, $this>
     */
    public function lock(): BelongsTo
    {
        return $this->belongsTo(Lock::class);
    }

    /**
     * @return BelongsTo<LockStateEvent, $this>
     */
    public function confirmingStateEvent(): BelongsTo
    {
        return $this->belongsTo(LockStateEvent::class, 'confirming_state_event_id');
    }
}
