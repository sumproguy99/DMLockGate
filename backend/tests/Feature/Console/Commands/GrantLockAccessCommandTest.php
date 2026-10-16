<?php

namespace Tests\Feature\Console\Commands;

use App\Enums\UserStatus;
use App\Models\AuditLog;
use App\Models\Lock;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GrantLockAccessCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_grants_access_after_confirmation_and_audits_it(): void
    {
        $user = User::factory()->create();
        $lock = Lock::factory()->create();

        $this->artisan('lockguard:grant-lock-access', ['email' => $user->email, 'lock' => $lock->id])
            ->expectsConfirmation("Give {$user->email} access to \"{$lock->name}\" with no end date?", 'yes')
            ->assertSuccessful();

        $this->assertTrue($user->locks()->whereKey($lock->id)->exists());
        $audit = AuditLog::query()->where('action', 'lock.access_granted')->sole();
        $this->assertSame($user->id, $audit->target_user_id);
        $this->assertNull($audit->actor_user_id);
        $this->assertSame('console', $audit->metadata['channel']);
    }

    public function test_declining_changes_nothing(): void
    {
        $user = User::factory()->create();
        $lock = Lock::factory()->create();

        $this->artisan('lockguard:grant-lock-access', ['email' => $user->email, 'lock' => $lock->id])
            ->expectsConfirmation("Give {$user->email} access to \"{$lock->name}\" with no end date?", 'no')
            ->assertFailed();

        $this->assertFalse($user->locks()->exists());
        $this->assertSame(0, AuditLog::query()->count());
    }

    public function test_refuses_inactive_accounts(): void
    {
        $user = User::factory()->create(['status' => UserStatus::Suspended]);
        $lock = Lock::factory()->create();

        $this->artisan('lockguard:grant-lock-access', ['email' => $user->email, 'lock' => $lock->id])->assertFailed();

        $this->assertFalse($user->locks()->exists());
    }

    public function test_rejects_past_end_date(): void
    {
        $user = User::factory()->create();
        $lock = Lock::factory()->create();

        $this->artisan('lockguard:grant-lock-access', ['email' => $user->email, 'lock' => $lock->id, '--until' => '2020-01-01'])->assertFailed();

        $this->assertFalse($user->locks()->exists());
    }

    public function test_revokes_access_and_audits_it(): void
    {
        $user = User::factory()->create();
        $lock = Lock::factory()->create();
        $user->locks()->attach($lock->id);

        $this->artisan('lockguard:grant-lock-access', ['email' => $user->email, 'lock' => $lock->id, '--revoke' => true])
            ->expectsConfirmation("Remove {$user->email}'s access to \"{$lock->name}\"?", 'yes')
            ->assertSuccessful();

        $this->assertFalse($user->locks()->exists());
        $this->assertSame(1, AuditLog::query()->where('action', 'lock.access_revoked')->count());
    }

    public function test_unknown_user_or_lock_fails(): void
    {
        $lock = Lock::factory()->create();

        $this->artisan('lockguard:grant-lock-access', ['email' => 'nobody@example.com', 'lock' => $lock->id])->assertFailed();
        $this->artisan('lockguard:grant-lock-access', ['email' => User::factory()->create()->email, 'lock' => 999])->assertFailed();
    }
}
