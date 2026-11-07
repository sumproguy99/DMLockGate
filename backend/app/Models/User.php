<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Enums\UserStatus;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'username', 'email', 'password', 'account_expires_at', 'admin_notes'])]
#[Hidden(['password', 'remember_token', 'mfa_secret', 'mfa_recovery_codes', 'admin_notes'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'status' => UserStatus::class,
            'status_changed_at' => 'datetime',
            'account_expires_at' => 'datetime',
            'mfa_secret' => 'encrypted',
            'mfa_recovery_codes' => 'encrypted:array',
            'mfa_confirmed_at' => 'datetime',
            'last_login_at' => 'datetime',
            'last_access_event_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsToMany<Role, $this>
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_roles')
            ->withPivot('assigned_by')
            ->withTimestamps();
    }

    /**
     * Individual allow/deny overrides layered on top of role permissions.
     *
     * @return BelongsToMany<Permission, $this>
     */
    public function permissionOverrides(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'user_permissions')
            ->withPivot('effect', 'reason', 'granted_by')
            ->withTimestamps();
    }

    /**
     * Locks this user has been given access to. No row means no access.
     *
     * @return BelongsToMany<Lock, $this>
     */
    public function locks(): BelongsToMany
    {
        return $this->belongsToMany(Lock::class, 'user_lock_access')
            ->withPivot('valid_from', 'valid_until', 'granted_by')
            ->withTimestamps();
    }

    /**
     * The browsers and phones this user has signed in from.
     *
     * @return HasMany<UserDevice, $this>
     */
    public function devices(): HasMany
    {
        return $this->hasMany(UserDevice::class);
    }

    /**
     * Whether the account may currently make any request. Suspended, revoked and expired accounts may not.
     */
    public function isActive(): bool
    {
        return $this->status === UserStatus::Active
            && ($this->account_expires_at === null || $this->account_expires_at->isFuture());
    }
}
