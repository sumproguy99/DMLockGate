<?php

namespace Tests\Feature\Http\Controllers\Api\V1\System;

use App\Enums\AccessChannel;
use App\Enums\AccessRequestStatus;
use App\Enums\AuditOutcome;
use App\Enums\LockAction;
use App\Enums\RoleTemplate;
use App\Models\AccessRequest;
use App\Models\Lock;
use App\Models\Role;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * GET /api/v1/dashboard: every section is filtered by the caller's permissions.
 */
class DashboardTest extends TestCase
{
    use RefreshDatabase;

    private Lock $frontDoor;

    private Lock $garage;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');

        $this->frontDoor = Lock::factory()->create(['name' => 'Front Door']);
        $this->garage = Lock::factory()->create(['name' => 'Garage']);
    }

    private function userWithRole(RoleTemplate $template, ?Lock $lock = null, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));
        if ($lock !== null) {
            $user->locks()->attach($lock->id);
        }

        return $user;
    }

    private function request(User $user, Lock $lock, AccessRequestStatus $status, string $minutesAgo = '1'): AccessRequest
    {
        $at = now()->subMinutes((int) $minutesAgo);

        return AccessRequest::query()->create([
            'public_id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'lock_id' => $lock->id,
            'action' => LockAction::Lock,
            'channel' => AccessChannel::Remote,
            'idempotency_key' => Str::random(16),
            'status' => $status,
            'requested_at' => $at,
            'expires_at' => $at->copy()->addMinute(),
        ]);
    }

    public function test_requires_a_session(): void
    {
        $this->getJson(route('api.v1.dashboard'))->assertUnauthorized();
    }

    public function test_a_resident_sees_requests_on_their_own_locks_without_other_peoples_names(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident, $this->frontDoor);
        $neighbour = $this->userWithRole(RoleTemplate::Resident, $this->frontDoor, ['name' => 'Nosy Neighbour']);
        $this->request($resident, $this->frontDoor, AccessRequestStatus::ConfirmedSuccess, '5');
        $this->request($neighbour, $this->frontDoor, AccessRequestStatus::UnknownResult, '2');
        $this->request($neighbour, $this->garage, AccessRequestStatus::Denied, '1');

        $response = $this->actingAs($resident)->getJson(route('api.v1.dashboard'))->assertOk();

        $response->assertJsonPath('data.users', null)
            ->assertJsonPath('data.security', null)
            ->assertJsonCount(2, 'data.activity')
            ->assertJsonPath('data.activity.0.actor', 'Another user')
            ->assertJsonPath('data.activity.0.outcome', 'failure')
            ->assertJsonPath('data.activity.0.lock', 'Front Door')
            ->assertJsonPath('data.activity.0.request.status', 'unknown_result')
            ->assertJsonPath('data.activity.1.actor', 'You')
            ->assertJsonPath('data.activity.1.outcome', 'success')
            ->assertJsonCount(1, 'data.last_requests')
            ->assertJsonPath('data.last_requests.0.lock_id', $this->frontDoor->id)
            ->assertJsonPath('data.last_requests.0.status', 'unknown_result');
        $this->assertStringNotContainsString('Nosy Neighbour', $response->getContent());
    }

    public function test_someone_without_history_access_gets_no_activity(): void
    {
        $guest = $this->userWithRole(RoleTemplate::TemporaryGuest, $this->frontDoor);
        $this->request($guest, $this->frontDoor, AccessRequestStatus::ConfirmedSuccess);

        $this->actingAs($guest)->getJson(route('api.v1.dashboard'))
            ->assertOk()
            ->assertExactJson(['data' => ['users' => null, 'security' => null, 'activity' => null, 'last_requests' => null]]);
    }

    public function test_an_auditor_sees_the_audit_trail_and_failed_attempts(): void
    {
        $auditor = $this->userWithRole(RoleTemplate::ReadOnlyAuditor, null, ['name' => 'Audrey Auditor']);
        $target = User::factory()->create(['name' => 'Sam Target']);
        $audit = app(AuditLogger::class);
        $audit->record('auth.login', AuditOutcome::Failure, reason: 'Invalid credentials.', metadata: ['email' => 'nobody@example.invalid']);
        $audit->record('auth.login', AuditOutcome::Failure, targets: ['user' => $target->id], reason: 'Invalid credentials.');
        $audit->record('lock.command_denied', AuditOutcome::Denied, actor: $target, targets: ['user' => $target->id, 'lock' => $this->garage->id], reason: 'You have not been given access to this lock.');
        $audit->record('auth.login', AuditOutcome::Success, actor: $auditor, targets: ['user' => $auditor->id]);
        $this->request($target, $this->garage, AccessRequestStatus::Failed);
        $this->request($target, $this->garage, AccessRequestStatus::UnknownResult, '60');
        $this->request($target, $this->garage, AccessRequestStatus::UnknownResult, (string) (60 * 25));

        $response = $this->actingAs($auditor)->getJson(route('api.v1.dashboard'))->assertOk();

        $response->assertJsonPath('data.users', null)
            ->assertJsonPath('data.security.window_hours', 24)
            ->assertJsonPath('data.security.failed_sign_ins', 2)
            ->assertJsonPath('data.security.denied_commands', 1)
            ->assertJsonPath('data.security.unresolved_commands', 2)
            ->assertJsonCount(3, 'data.security.recent')
            ->assertJsonPath('data.activity.0.action', 'auth.login')
            ->assertJsonPath('data.activity.0.actor', 'Audrey Auditor')
            ->assertJsonPath('data.activity.1.action', 'lock.command_denied')
            ->assertJsonPath('data.activity.1.actor', 'Sam Target')
            ->assertJsonPath('data.activity.1.lock', 'Garage')
            ->assertJsonPath('data.activity.1.outcome', 'denied')
            ->assertJsonPath('data.activity.2.actor', 'Sam Target')
            ->assertJsonPath('data.activity.3.actor', 'Unknown account');
        $this->assertStringNotContainsString('nobody@example.invalid', $response->getContent(), 'Audit metadata is never sent to the dashboard.');
    }

    public function test_a_user_manager_sees_account_and_access_counts(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        User::factory()->suspended()->create();
        User::factory()->revoked()->create();
        User::factory()->expired()->create();
        User::factory()->create(['mfa_confirmed_at' => now()]);
        $visitor = User::factory()->create();
        $visitor->locks()->attach($this->frontDoor->id, ['valid_until' => now()->addDays(3)]);
        $visitor->locks()->attach($this->garage->id, ['valid_until' => now()->addDays(30)]);

        $this->actingAs($manager)->getJson(route('api.v1.dashboard'))
            ->assertOk()
            ->assertJsonPath('data.users.active', 3)
            ->assertJsonPath('data.users.active_without_mfa', 2)
            ->assertJsonPath('data.users.suspended', 1)
            ->assertJsonPath('data.users.revoked', 1)
            ->assertJsonPath('data.users.expired', 1)
            ->assertJsonPath('data.users.temporary_access', 2)
            ->assertJsonPath('data.users.expiring_access', 1)
            ->assertJsonPath('data.security', null);
    }
}
