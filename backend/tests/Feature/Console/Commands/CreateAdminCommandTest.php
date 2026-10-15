<?php

namespace Tests\Feature\Console\Commands;

use App\Enums\PermissionKey;
use App\Models\AuditLog;
use App\Models\User;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CreateAdminCommandTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct-horse-42-battery';

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
    }

    public function test_creates_super_administrator_and_audits_it(): void
    {
        $this->artisan('lockguard:create-admin', ['--name' => 'Dana Admin', '--email' => 'dana@example.com'])
            ->expectsQuestion('Password (at least 12 characters)', self::PASSWORD)
            ->expectsQuestion('Repeat password', self::PASSWORD)
            ->assertSuccessful();

        $user = User::query()->where('email', 'dana@example.com')->firstOrFail();

        $this->assertTrue(Hash::check(self::PASSWORD, $user->password));
        $this->assertSame(['super_administrator'], $user->roles->pluck('key')->all());
        $this->assertTrue(Gate::forUser($user->fresh())->allows(PermissionKey::UsersCreate->value));

        $audit = AuditLog::query()->where('action', 'user.created')->sole();
        $this->assertSame($user->id, $audit->target_user_id);
        $this->assertStringNotContainsString(self::PASSWORD, json_encode($audit->getAttributes()));
    }

    public function test_rejects_short_password_and_creates_nothing(): void
    {
        $this->artisan('lockguard:create-admin', ['--name' => 'Dana Admin', '--email' => 'dana@example.com'])
            ->expectsQuestion('Password (at least 12 characters)', 'short1')
            ->expectsQuestion('Repeat password', 'short1')
            ->assertFailed();

        $this->assertSame(0, User::query()->count());
        $this->assertSame(0, AuditLog::query()->count());
    }

    public function test_rejects_mismatched_confirmation(): void
    {
        $this->artisan('lockguard:create-admin', ['--name' => 'Dana Admin', '--email' => 'dana@example.com'])
            ->expectsQuestion('Password (at least 12 characters)', self::PASSWORD)
            ->expectsQuestion('Repeat password', self::PASSWORD.'x')
            ->assertFailed();

        $this->assertSame(0, User::query()->count());
    }

    public function test_rejects_duplicate_email(): void
    {
        User::factory()->create(['email' => 'dana@example.com']);

        $this->artisan('lockguard:create-admin', ['--name' => 'Dana Admin', '--email' => 'dana@example.com'])
            ->expectsQuestion('Password (at least 12 characters)', self::PASSWORD)
            ->expectsQuestion('Repeat password', self::PASSWORD)
            ->assertFailed();

        $this->assertSame(1, User::query()->count());
    }
}
