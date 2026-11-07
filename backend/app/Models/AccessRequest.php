<?php

namespace App\Models;

use App\Enums\AccessChannel;
use App\Enums\AccessRequestStatus;
use App\Enums\LockAction;
use App\Jobs\SubmitLockCommand;
use App\Services\Locks\LockCommandService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * One lock/unlock request. Created and advanced only by {@see LockCommandService}
 * and {@see SubmitLockCommand}.
 */
class AccessRequest extends Model
{
    protected $guarded = [];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'action' => LockAction::class,
            'channel' => AccessChannel::class,
            'status' => AccessRequestStatus::class,
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
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Lock, $this>
     */
    public function lock(): BelongsTo
    {
        return $this->belongsTo(Lock::class);
    }

    /**
     * The device the request came from; null for API-token clients and requests made before
     * devices were recorded.
     *
     * @return BelongsTo<UserDevice, $this>
     */
    public function device(): BelongsTo
    {
        return $this->belongsTo(UserDevice::class, 'user_device_id');
    }

    /**
     * @return HasOne<AuthorizationDecision, $this>
     */
    public function decision(): HasOne
    {
        return $this->hasOne(AuthorizationDecision::class);
    }

    /**
     * @return HasOne<LockCommand, $this>
     */
    public function command(): HasOne
    {
        return $this->hasOne(LockCommand::class);
    }
}
