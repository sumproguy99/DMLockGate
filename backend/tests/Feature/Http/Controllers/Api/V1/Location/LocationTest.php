<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Location;

use App\Actions\Auth\CompleteLogin;
use App\Enums\AccessChannel;
use App\Enums\AccessRequestStatus;
use App\Enums\LocationRequestStatus;
use App\Enums\LockAction;
use App\Enums\RoleTemplate;
use App\Models\AccessRequest;
use App\Models\AuditLog;
use App\Models\LocationReport;
use App\Models\LocationRequest;
use App\Models\Lock;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Locations sent with lock requests, administrators' location requests and the phone's silent
 * answer, the map, and a user's own sharing history.
 */
class LocationTest extends TestCase
{
    use RefreshDatabase;

    private Lock $frontDoor;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');

        $this->frontDoor = Lock::factory()->create(['name' => 'Front Door']);
    }

    private function userWithRole(RoleTemplate $template, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));
        $user->locks()->attach($this->frontDoor->id);

        return $user;
    }

    /** Signed in as the user, with a recent identity confirmation so step-up routes go through. */
    private function as(User $user): static
    {
        return $this->actingAs($user)->withSession([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()]);
    }

    private function lockRequest(User $user, AccessRequestStatus $status = AccessRequestStatus::ConfirmedSuccess, int $minutesAgo = 0): AccessRequest
    {
        $at = now()->subMinutes($minutesAgo);

        return AccessRequest::query()->create([
            'public_id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'lock_id' => $this->frontDoor->id,
            'action' => LockAction::Unlock,
            'channel' => AccessChannel::Remote,
            'idempotency_key' => Str::random(16),
            'status' => $status,
            'requested_at' => $at,
            'expires_at' => $at->copy()->addMinute(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function fix(array $overrides = []): array
    {
        return ['latitude' => 35.2271, 'longitude' => -80.8431, 'accuracy' => 14.5, 'captured_at' => now()->toIso8601String(), ...$overrides];
    }

    public function test_a_phone_attaches_its_location_to_its_own_lock_request_once(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $request = $this->lockRequest($resident);
        $url = route('api.v1.lock-requests.location.store', $request);

        $this->as($resident)->postJson($url, $this->fix())->assertCreated();
        $this->as($resident)->postJson($url, $this->fix())->assertConflict()->assertJsonPath('error.code', 'location_already_recorded');

        $report = LocationReport::query()->sole();
        $this->assertSame(LocationReport::PURPOSE_LOCK_REQUEST, $report->purpose);
        $this->assertSame($request->id, $report->access_request_id);
        $this->assertEqualsWithDelta(35.2271, $report->latitude, 0.000001);
    }

    public function test_nobody_else_can_attach_a_location_to_a_lock_request(): void
    {
        $request = $this->lockRequest($this->userWithRole(RoleTemplate::Resident));

        $this->as($this->userWithRole(RoleTemplate::SuperAdministrator))
            ->postJson(route('api.v1.lock-requests.location.store', $request), $this->fix())
            ->assertForbidden();
        $this->assertDatabaseCount('location_reports', 0);
    }

    public function test_impossible_or_stale_positions_and_old_requests_are_refused(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $url = route('api.v1.lock-requests.location.store', $this->lockRequest($resident));

        $this->as($resident)->postJson($url, $this->fix(['latitude' => 91]))->assertUnprocessable();
        $this->as($resident)->postJson($url, $this->fix(['accuracy' => 0]))->assertUnprocessable();
        $this->as($resident)->postJson($url, $this->fix(['captured_at' => now()->subMinutes(10)->toIso8601String()]))
            ->assertUnprocessable()
            ->assertJsonPath('error.fields.captured_at.0', 'The position is too old or its time is wrong.');

        $old = $this->lockRequest($resident, minutesAgo: 10);
        $this->as($resident)->postJson(route('api.v1.lock-requests.location.store', $old), $this->fix())
            ->assertConflict()
            ->assertJsonPath('error.code', 'location_window_closed');
        $this->assertDatabaseCount('location_reports', 0);
    }

    public function test_an_administrator_requests_a_location_and_the_phone_answers_silently(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator, ['name' => 'Dana Admin']);
        $resident = $this->userWithRole(RoleTemplate::Resident, ['name' => 'Riley Resident']);

        $id = $this->as($admin)->postJson(route('api.v1.location.requests.store'), ['user_id' => $resident->id])
            ->assertAccepted()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.user.name', 'Riley Resident')
            ->json('data.id');
        $this->assertSame($id, $this->as($admin)->postJson(route('api.v1.location.requests.store'), ['user_id' => $resident->id])->json('data.id'));

        // The phone sees only that a request is open, not who asked.
        $pending = $this->as($resident)->getJson(route('api.v1.location.requests.pending'))->assertOk()->json('data');
        $this->assertSame([['id', 'expires_at']], array_map(fn (array $item): array => array_keys($item), $pending));
        $this->assertSame($id, $pending[0]['id']);

        $this->as($resident)->postJson(route('api.v1.location.requests.respond', $id), $this->fix())
            ->assertOk()
            ->assertJsonPath('data.status', 'fulfilled');
        $this->as($resident)->postJson(route('api.v1.location.requests.respond', $id), $this->fix())
            ->assertConflict()
            ->assertJsonPath('error.code', 'location_request_closed');

        $this->as($admin)->getJson(route('api.v1.location.requests.show', $id))
            ->assertOk()
            ->assertJsonPath('data.status', 'fulfilled')
            ->assertJsonPath('data.location.latitude', 35.2271);
        $this->assertSame([], $this->as($resident)->getJson(route('api.v1.location.requests.pending'))->json('data'));

        $this->assertSame(1, AuditLog::query()->where('action', 'location.requested')->where('actor_user_id', $admin->id)->where('target_user_id', $resident->id)->count());
        $this->assertSame('success', AuditLog::query()->where('action', 'location.shared')->sole()->outcome->value);
    }

    public function test_a_phone_without_a_position_says_why(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $request = LocationRequest::factory()->create(['target_user_id' => $resident->id]);

        $this->as($resident)->postJson(route('api.v1.location.requests.respond', $request), ['unavailable' => 'permission_denied'])
            ->assertOk()
            ->assertJsonPath('data.status', 'unavailable');

        $this->assertSame(LocationRequestStatus::Unavailable, $request->fresh()->status);
        $this->assertSame('permission_denied', $request->fresh()->failure_reason);
        $this->assertDatabaseCount('location_reports', 0);
    }

    public function test_an_unanswered_request_expires(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $request = LocationRequest::factory()->create(['target_user_id' => $resident->id, 'expires_at' => now()->subSecond()]);

        $this->assertSame([], $this->as($resident)->getJson(route('api.v1.location.requests.pending'))->json('data'));
        $this->as($resident)->postJson(route('api.v1.location.requests.respond', $request), $this->fix())->assertConflict();
        $this->assertSame(LocationRequestStatus::Expired, $request->fresh()->status);
    }

    public function test_only_the_person_asked_can_answer(): void
    {
        $request = LocationRequest::factory()->create(['target_user_id' => $this->userWithRole(RoleTemplate::Resident)->id]);

        $this->as($this->userWithRole(RoleTemplate::Resident))
            ->postJson(route('api.v1.location.requests.respond', $request), $this->fix())
            ->assertForbidden();
        $this->assertSame(LocationRequestStatus::Pending, $request->fresh()->status);
    }

    public function test_requesting_a_location_needs_permission_a_recent_identity_check_and_an_active_account(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $this->as($this->userWithRole(RoleTemplate::SecurityAdministrator))
            ->postJson(route('api.v1.location.requests.store'), ['user_id' => $resident->id])
            ->assertForbidden();
        $this->flushSession();
        $this->actingAs($admin)
            ->postJson(route('api.v1.location.requests.store'), ['user_id' => $resident->id])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'step_up_required');
        $this->as($admin)
            ->postJson(route('api.v1.location.requests.store'), ['user_id' => User::factory()->suspended()->create()->id])
            ->assertConflict()
            ->assertJsonPath('error.code', 'account_inactive');
        $this->assertDatabaseCount('location_requests', 0);
    }

    public function test_the_map_shows_who_sent_each_request_when_and_how_it_ended(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator, ['name' => 'Dana Admin']);
        $resident = $this->userWithRole(RoleTemplate::Resident, ['name' => 'Riley Resident']);
        $succeeded = $this->lockRequest($resident);
        $denied = $this->lockRequest($resident, AccessRequestStatus::Denied);
        LocationReport::factory()->create(['user_id' => $resident->id, 'access_request_id' => $succeeded->id]);
        LocationReport::factory()->create(['user_id' => $resident->id, 'access_request_id' => $denied->id]);
        $asked = LocationRequest::factory()->create(['requested_by' => $admin->id, 'target_user_id' => $resident->id, 'status' => LocationRequestStatus::Fulfilled]);
        LocationReport::factory()->create(['user_id' => $resident->id, 'purpose' => LocationReport::PURPOSE_LOCATION_REQUEST, 'location_request_id' => $asked->id]);
        LocationReport::factory()->create(['user_id' => $resident->id, 'received_at' => now()->subDays(10)]);

        $pins = collect($this->as($admin)->getJson(route('api.v1.location.map', ['days' => 7]))->assertOk()->json('data.pins'));

        $this->assertCount(3, $pins);
        $lockPins = $pins->where('kind', LocationReport::PURPOSE_LOCK_REQUEST)->keyBy('outcome');
        $this->assertSame(['success', 'denied'], $lockPins->keys()->sort()->reverse()->values()->all());
        $this->assertSame('Riley Resident', $lockPins['success']['user']['name']);
        $this->assertSame('Front Door', $lockPins['success']['lock']['name']);
        $this->assertSame('unlock', $lockPins['success']['action']);
        $this->assertSame($succeeded->requested_at->toIso8601ZuluString('millisecond'), $lockPins['success']['at']);
        $this->assertSame('Dana Admin', $pins->firstWhere('kind', LocationReport::PURPOSE_LOCATION_REQUEST)['requested_by']['name']);

        $this->assertSame(1, AuditLog::query()->where('action', 'location.history_viewed')->where('actor_user_id', $admin->id)->count());
    }

    public function test_the_map_is_refused_without_location_history_permission(): void
    {
        $this->as($this->userWithRole(RoleTemplate::Resident))->getJson(route('api.v1.location.map'))->assertForbidden();
        $this->assertSame('denied', AuditLog::query()->where('action', 'location.history_viewed')->sole()->outcome->value);
    }

    public function test_people_see_when_their_own_location_was_shared_and_with_whom(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator, ['name' => 'Dana Admin']);
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $asked = LocationRequest::factory()->create(['requested_by' => $admin->id, 'target_user_id' => $resident->id, 'status' => LocationRequestStatus::Fulfilled]);
        LocationReport::factory()->create(['user_id' => $resident->id, 'purpose' => LocationReport::PURPOSE_LOCATION_REQUEST, 'location_request_id' => $asked->id]);
        LocationReport::factory()->create(['user_id' => $resident->id, 'access_request_id' => $this->lockRequest($resident)->id]);
        LocationReport::factory()->create(['user_id' => $admin->id]);

        $shared = collect($this->as($resident)->getJson(route('api.v1.location.mine'))->assertOk()->json('data.shared'));

        $this->assertCount(2, $shared);
        $this->assertSame('Dana Admin', $shared->firstWhere('kind', LocationReport::PURPOSE_LOCATION_REQUEST)['requested_by']);
        $this->assertSame('Front Door', $shared->firstWhere('kind', LocationReport::PURPOSE_LOCK_REQUEST)['lock']);
        $this->assertArrayNotHasKey('latitude', $shared->first());
    }
}
