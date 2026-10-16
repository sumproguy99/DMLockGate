<?php

namespace App\Models;

use App\Enums\ReportedLockState;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * One append-only observation of a lock's state. source: 'push' (event from the lock) or 'poll'
 * (cloud re-read).
 */
class LockStateEvent extends Model
{
    public const SOURCE_PUSH = 'push';

    public const SOURCE_POLL = 'poll';

    public $timestamps = false;

    protected $guarded = [];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'state' => ReportedLockState::class,
            'observed_at' => 'datetime',
            'received_at' => 'datetime',
            'raw' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn (): never => throw new LogicException('Lock state events are append-only.'));
    }

    /**
     * @return BelongsTo<Lock, $this>
     */
    public function lock(): BelongsTo
    {
        return $this->belongsTo(Lock::class);
    }
}
