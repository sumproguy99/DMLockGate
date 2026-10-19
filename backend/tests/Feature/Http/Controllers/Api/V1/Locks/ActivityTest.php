<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Locks;

use App\Enums\AccessChannel;
use App\Enums\AccessRequestStatus;
use App\Enums\LockAction;
use App\Enums\RoleTemplate;
use App\Http\Controllers\Api\V1\Locks\ActivityController;
use App\Models\AccessRequest;
use App\Models\Lock;
use App\Models\LockStateEvent;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * GET /api/v1/activity: requests and reported state changes on the locks the caller may see.
 */
class ActivityTest extends TestCase
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

    private function request(User $user, Lock $lock, AccessRequestStatus $status, int $minutesAgo = 1): AccessRequest
    {
        $at = now()->subMinutes($minutesAgo);

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

    private function report(Lock $lock, string $state, int $minutesAgo, string $source = LockStateEvent::SOURCE_PUSH): LockStateEvent
    {
        $at = now()->subMinutes($minutesAgo);

        return LockStateEvent::query()->create([
            'lock_id' => $lock->id,
            'state' => $state,
            'source' => $source,
            'observed_at' => $at,
            'received_at' => $at,
        ]);
    }

    public function test_requires_a_session(): void
    {
        $this->getJson(route('api.v1.activity'))->assertUnauthorized();
    }

    public function test_requires_permission_to_see_lock_history(): void
    {
        $this->actingAs($this->userWithRole(RoleTemplate::TemporaryGuest, $this->frontDoor))
            ->getJson(route('api.v1.activity'))
            ->assertForbidden();
    }

    public function test_a_resident_sees_their_locks_requests_and_reports_without_other_peoples_names(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident, $this->frontDoor);
        $neighbour = $this->userWithRole(RoleTemplate::Resident, $this->frontDoor, ['name' => 'Nosy Neighbour']);
        $this->request($resident, $this->frontDoor, AccessRequestStatus::ConfirmedSuccess, 10);
        $this->request($neighbour, $this->frontDoor, AccessRequestStatus::UnknownResult, 5);
        $this->request($neighbour, $this->garage, AccessRequestStatus::ConfirmedSuccess, 4);
        $this->report($this->frontDoor, 'jammed', 3);
        $this->report($this->garage, 'unlocked', 2);

        $response = $this->actingAs($resident)->getJson(route('api.v1.activity'))->assertOk();

        $response->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.kind', 'report')
            ->assertJsonPath('data.0.report.state', 'jammed')
            ->assertJsonPath('data.0.outcome', 'failure')
            ->assertJsonPath('data.0.actor', 'Reported by the lock')
            ->assertJsonPath('data.1.actor', 'Another user')
            ->assertJsonPath('data.1.request.status', 'unknown_result')
            ->assertJsonPath('data.2.actor', 'You')
            ->assertJsonPath('data.2.lock.name', 'Front Door')
            ->assertJsonPath('next_before', null);
        $this->assertStringNotContainsString('Nosy Neighbour', $response->getContent());
    }

    public function test_repeated_reports_of_the_same_state_are_left_out(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident, $this->frontDoor);
        $this->report($this->frontDoor, 'locked', 30, LockStateEvent::SOURCE_POLL);
        $this->report($this->frontDoor, 'locked', 25, LockStateEvent::SOURCE_POLL);
        $this->report($this->frontDoor, 'unlocked', 20);
        $this->report($this->frontDoor, 'unlocked', 15, LockStateEvent::SOURCE_POLL);
        $this->report($this->frontDoor, 'locked', 10, LockStateEvent::SOURCE_POLL);

        $this->actingAs($resident)->getJson(route('api.v1.activity', ['type' => 'reports']))
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.report.state', 'locked')
            ->assertJsonPath('data.0.actor', 'Found by the scheduled check')
            ->assertJsonPath('data.1.report.state', 'unlocked')
            ->assertJsonPath('data.2.report.state', 'locked');
    }

    public function test_filters_by_type_and_outcome(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident, $this->frontDoor);
        $this->request($resident, $this->frontDoor, AccessRequestStatus::ConfirmedSuccess, 10);
        $this->request($resident, $this->frontDoor, AccessRequestStatus::Failed, 8);
        $this->request($resident, $this->frontDoor, AccessRequestStatus::Denied, 6);
        $this->report($this->frontDoor, 'unlocked', 4);
        $this->report($this->frontDoor, 'jammed', 2);

        $this->actingAs($resident)->getJson(route('api.v1.activity', ['type' => 'requests']))->assertJsonCount(3, 'data');
        $this->getJson(route('api.v1.activity', ['outcome' => 'denied']))
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.request.status', 'denied');
        $this->getJson(route('api.v1.activity', ['outcome' => 'failure']))
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.report.state', 'jammed')
            ->assertJsonPath('data.1.request.status', 'failed');
        $this->getJson(route('api.v1.activity', ['outcome' => 'sideways']))->assertUnprocessable();
    }

    public function test_pages_with_before(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident, $this->frontDoor);
        foreach (range(1, ActivityController::PAGE_SIZE + 5) as $minutesAgo) {
            $this->request($resident, $this->frontDoor, AccessRequestStatus::ConfirmedSuccess, $minutesAgo);
        }

        $first = $this->actingAs($resident)->getJson(route('api.v1.activity'))->assertOk()->assertJsonCount(ActivityController::PAGE_SIZE, 'data');
        $before = $first->json('next_before');
        $this->assertNotNull($before);

        $this->getJson(route('api.v1.activity', ['before' => $before]))
            ->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('next_before', null);
    }

    public function test_an_administrator_who_sees_all_devices_sees_every_lock(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SecurityAdministrator);
        $resident = $this->userWithRole(RoleTemplate::Resident, $this->garage);
        $this->request($resident, $this->garage, AccessRequestStatus::ConfirmedSuccess, 3);
        $this->report($this->frontDoor, 'locked', 2);

        $this->actingAs($admin)->getJson(route('api.v1.activity'))
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.1.actor', 'Another user');
    }
}
