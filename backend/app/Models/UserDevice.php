<?php

namespace App\Models;

use App\Enums\DeviceStatus;
use Database\Factories\UserDeviceFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A browser or phone a user signs in from (project.md sections 6, 12 and 16). The cookie token
 * itself is never stored, only its hash.
 */
class UserDevice extends Model
{
    /** @use HasFactory<UserDeviceFactory> */
    use HasFactory;

    protected $guarded = [];

    protected $hidden = ['token_hash'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => DeviceStatus::class,
            'reported_lost' => 'boolean',
            'first_seen_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'registered_at' => 'datetime',
            'trusted_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    public function isRevoked(): bool
    {
        return $this->status === DeviceStatus::Revoked;
    }

    /**
     * Registered with a one-time code (device binding) and not revoked since.
     */
    public function isRegistered(): bool
    {
        return $this->registered_at !== null && ! $this->isRevoked();
    }

    public function isTrusted(): bool
    {
        return $this->status === DeviceStatus::Trusted;
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function truster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'trusted_by');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function revoker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }
}
