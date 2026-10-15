<?php

namespace App\Models;

use App\Enums\AuditActorType;
use App\Enums\AuditOutcome;
use App\Services\Audit\AuditLogger;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * One append-only audit record. Write records only through {@see AuditLogger}.
 */
class AuditLog extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'actor_type' => AuditActorType::class,
            'outcome' => AuditOutcome::class,
            'metadata' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn (): never => throw new LogicException('Audit records are append-only and cannot be updated.'));
        static::deleting(fn (): never => throw new LogicException('Audit records are append-only and cannot be deleted.'));
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
