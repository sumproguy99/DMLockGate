<?php

namespace Tests\Feature\Services\Locks;

use App\Actions\Auth\CompleteLogin;
use App\Enums\AccessRequestStatus;
use App\Enums\LockAction;
use App\Enums\LockConnectionStatus;
use App\Enums\PermissionKey;
use App\Enums\ReportedLockState;
use App\Enums\RoleTemplate;
use App\Jobs\SubmitLockCommand;
use App\Models\AccessRequest;
use App\Models\AuditLog;
use App\Models\Lock;
use App\Models\LockCommand;
use App\Models\LockStateEvent;
use App\Models\Role;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Locks\Integration\FakeLockDriver;
use App\Services\Locks\Integration\IntegrationOutcomeUnknown;
use App\Services\Locks\Integration\IntegrationUnavailable;
use App\Services\Locks\Integration\LockDriver;
use App\Services\Locks\Integration\ReportedState;
use App\Services\Locks\Integration\UnconfiguredLockDriver;
use App\Services\Locks\LockStateRecorder;
use Carbon\CarbonImmutable;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Sleep;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The central lock command service end to end, against a simulated lock (the job runs on the sync queue).
 */
class LockCommandServiceTest extends TestCase
{
    use RefreshDatabase;

    private FakeLockDriver $driver;

    private Lock $lock;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');

        $this->driver = new FakeLockDriver;
        $this->app->instance(LockDriver::class, $this->driver);
        Sleep::fake(syncWithCarbon: true);

        $this->lock = Lock::factory()->reporting(ReportedLockState::Unlocked)->create(['name' => 'Front Door']);
        $this->driver->setState($this->lock, ReportedLockState::Unlocked);
    }

    private function userWithRole(RoleTemplate $template, bool $withAccess = true): User
    {
        $user = User::factory()->create();
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));
        if ($withAccess) {
            $user->locks()->attach($this->lock->id);
        }

        return $user;
    }

    private function command(User $user, string $action, ?string $key = null, bool $stepUp = false, ?Lock $lock = null): TestResponse
    {
        $this->actingAs($user);
        if ($stepUp) {
            $this->withSession([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()]);
        }

        return $this->postJson(route('api.v1.locks.commands.store', $lock ?? $this->lock), [
            'action' => $action,
            'idempotency_key' => $key ?? fake()->uuid(),
        ]);
    }

    public function test_an_authorized_lock_is_confirmed_by_the_reported_state(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $id = $this->command($resident, 'lock')
            ->assertAccepted()
            ->assertJsonPath('data.action', 'lock')
            ->json('data.id');

        $request = AccessRequest::query()->where('public_id', $id)->sole();
        $this->assertSame(AccessRequestStatus::ConfirmedSuccess, $request->status);
        $this->assertSame('allow', $request->decision->decision);
        $this->assertSame(
            ['account_active', 'valid_operation', 'permission', 'lock_access', 'schedule', 'remote_unlock_policy', 'authentication_strength', 'location', 'security_hold', 'lock_busy'],
            array_column($request->decision->checks, 'check'),
        );
        $this->assertSame('not_applicable', collect($request->decision->checks)->firstWhere('check', 'security_hold')['result']);

        $command = $request->command;
        $this->assertSame(LockCommand::RESULT_ACKNOWLEDGED, $command->integration_result);
        $this->assertSame(LockCommand::CONFIRMED, $command->confirmation);
        $this->assertSame('poll', $command->confirmation_source);
        $this->assertSame(ReportedLockState::Locked, $command->confirmingStateEvent->state);
        $this->assertSame(ReportedLockState::Locked, $this->lock->fresh()->last_reported_state);
        $this->assertCount(1, $this->driver->sent);

        $this->assertDatabaseHas('audit_logs', ['action' => 'lock.command_authorized', 'actor_user_id' => $resident->id, 'target_lock_id' => $this->lock->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'lock.command_confirmed', 'outcome' => 'success']);

        $this->getJson(route('api.v1.lock-requests.show', $id))
            ->assertOk()
            ->assertJsonPath('data.status', 'confirmed_success')
            ->assertJsonPath('data.is_final', true)
            ->assertJsonPath('data.command.confirmation', 'confirmed');
    }

    public function test_remote_unlock_requires_a_recent_identity_confirmation_by_default(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $this->command($resident, 'unlock')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'step_up_required')
            ->assertJsonStructure(['error' => ['details' => ['request_id']]]);

        $this->assertSame([], $this->driver->sent);
        $this->assertDatabaseHas('audit_logs', ['action' => 'lock.command_denied', 'outcome' => 'denied']);

        $this->driver->setState($this->lock, ReportedLockState::Locked);
        $this->command($resident, 'unlock', stepUp: true)
            ->assertAccepted();
        $this->assertSame(ReportedLockState::Unlocked, $this->lock->fresh()->last_reported_state);
        $this->assertSame('unlock', $this->driver->sent[0]['action']->value);
    }

    public function test_remote_unlock_needs_the_remote_unlock_permission(): void
    {
        $guest = $this->userWithRole(RoleTemplate::TemporaryGuest);

        $this->command($guest, 'unlock', stepUp: true)
            ->assertForbidden()
            ->assertJsonPath('error.code', 'permission_denied')
            ->assertJsonPath('error.message', 'You do not have the "Request remote unlocking" permission.');

        $this->command($guest, 'lock')->assertAccepted();
    }

    public function test_a_user_without_access_to_the_lock_is_denied(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident, withAccess: false);

        $this->command($resident, 'lock')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'no_lock_access');

        $this->assertSame([], $this->driver->sent);
    }

    public function test_access_outside_its_window_is_denied(): void
    {
        $guest = $this->userWithRole(RoleTemplate::TemporaryGuest, withAccess: false);
        $guest->locks()->attach($this->lock->id, ['valid_from' => now()->subDays(2), 'valid_until' => now()->subDay()]);

        $this->command($guest, 'lock')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'outside_access_window')
            ->assertJsonPath('error.message', 'Your access to this lock has ended.');
    }

    public function test_a_lock_with_commands_disabled_refuses_commands(): void
    {
        $this->lock->update(['commands_enabled' => false]);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $this->command($resident, 'lock')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'lock_commands_disabled');
    }

    public function test_remote_unlock_policies_disabled_and_location_required_deny(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);

        config(['lockguard.locks.remote_unlock_policy' => 'disabled']);
        $this->command($resident, 'unlock', stepUp: true)->assertJsonPath('error.code', 'remote_unlock_disabled');

        config(['lockguard.locks.remote_unlock_policy' => 'location_required']);
        $this->command($resident, 'unlock', stepUp: true)->assertJsonPath('error.code', 'location_unavailable');

        config(['lockguard.locks.remote_unlock_policy' => 'something_else']);
        $this->command($resident, 'unlock', stepUp: true)->assertJsonPath('error.code', 'remote_unlock_policy_invalid');

        $this->assertSame([], $this->driver->sent);
    }

    public function test_the_same_idempotency_key_never_sends_twice(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $first = $this->command($resident, 'lock', 'tap-0001-abcdef')->assertAccepted()->json('data.id');
        $second = $this->command($resident, 'lock', 'tap-0001-abcdef')->assertAccepted()->json('data.id');

        $this->assertSame($first, $second);
        $this->assertCount(1, $this->driver->sent);
        $this->assertSame(1, AccessRequest::query()->count());

        $this->command($resident, 'unlock', 'tap-0001-abcdef', stepUp: true)
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'idempotency_key_reused');
    }

    public function test_a_lock_that_never_reports_the_new_state_ends_as_unknown_result_without_retrying(): void
    {
        $this->driver->ignoreCommands();
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $id = $this->command($resident, 'lock')->assertAccepted()->json('data.id');

        $request = AccessRequest::query()->where('public_id', $id)->sole();
        $this->assertSame(AccessRequestStatus::UnknownResult, $request->status);
        $this->assertSame(LockCommand::UNCONFIRMED, $request->command->confirmation);
        $this->assertCount(1, $this->driver->sent);
        $this->assertSame(ReportedLockState::Unlocked, $this->lock->fresh()->last_reported_state);
        $this->assertDatabaseHas('audit_logs', ['action' => 'lock.command_unconfirmed']);
    }

    public function test_a_lock_already_in_the_requested_state_is_not_sent_a_command(): void
    {
        // The live-test case: the door had been locked by hand before the lock command.
        $this->driver->setState($this->lock, ReportedLockState::Locked);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $id = $this->command($resident, 'lock')->assertAccepted()->json('data.id');

        $request = AccessRequest::query()->where('public_id', $id)->sole();
        $this->assertSame(AccessRequestStatus::AlreadyInState, $request->status);
        $this->assertNull($request->command->submitted_at);
        $this->assertSame([], $this->driver->sent);
        $this->assertDatabaseHas('audit_logs', ['action' => 'lock.command_not_needed']);
    }

    public function test_a_trailing_cloud_read_does_not_hide_a_lock_operated_moments_ago(): void
    {
        // Locked by hand two seconds ago; the cloud copy the pre-send read sees still says unlocked.
        $this->lock->forceFill(['last_state_observed_at' => now()->subMinute()])->save();
        app(LockStateRecorder::class)->record($this->lock, new ReportedState(ReportedLockState::Locked, CarbonImmutable::now()->subSeconds(2)), LockStateEvent::SOURCE_PUSH);
        $this->driver->setState($this->lock, ReportedLockState::Unlocked);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $id = $this->command($resident, 'lock')->assertAccepted()->json('data.id');

        $request = AccessRequest::query()->where('public_id', $id)->sole();
        $this->assertSame(AccessRequestStatus::AlreadyInState, $request->status);
        $this->assertSame([], $this->driver->sent);
    }

    /**
     * @return array<string, array{ReportedLockState|null}>
     */
    public static function unusablePreSendStates(): array
    {
        return [
            'state cannot be read' => [null],
            'state unknown' => [ReportedLockState::Unknown],
            'lock jammed' => [ReportedLockState::Jammed],
        ];
    }

    #[DataProvider('unusablePreSendStates')]
    public function test_nothing_is_sent_without_a_usable_pre_send_state(?ReportedLockState $state): void
    {
        $driver = new class($state) extends FakeLockDriver
        {
            public function __construct(private readonly ?ReportedLockState $preSend) {}

            public function readState(Lock $lock): ReportedState
            {
                return $this->preSend === null
                    ? throw new IntegrationUnavailable('Bridge refused the connection.')
                    : new ReportedState($this->preSend, CarbonImmutable::now());
            }
        };
        $this->app->instance(LockDriver::class, $driver);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $id = $this->command($resident, 'lock')->assertAccepted()->json('data.id');

        $request = AccessRequest::query()->where('public_id', $id)->sole();
        $this->assertSame(AccessRequestStatus::Failed, $request->status);
        $this->assertNull($request->command->submitted_at);
        $this->assertSame([], $driver->sent);
    }

    public function test_a_push_observed_after_submission_confirms_the_command(): void
    {
        $this->useDriverThatPushesDuringSend(observedSecondsAfterSend: 2);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $id = $this->command($resident, 'lock')->assertAccepted()->json('data.id');

        $request = AccessRequest::query()->where('public_id', $id)->sole();
        $this->assertSame(AccessRequestStatus::ConfirmedSuccess, $request->status);
        $this->assertSame('push', $request->command->confirmation_source);
    }

    public function test_a_late_push_about_an_earlier_manual_action_does_not_confirm_the_command(): void
    {
        // The push arrives after submission but describes something the lock saw before it.
        $this->useDriverThatPushesDuringSend(observedSecondsAfterSend: -3);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $id = $this->command($resident, 'lock')->assertAccepted()->json('data.id');

        $request = AccessRequest::query()->where('public_id', $id)->sole();
        $this->assertSame(AccessRequestStatus::UnknownResult, $request->status);
        $this->assertNull($request->command->confirming_state_event_id);
    }

    /**
     * A simulated lock that ignores the command, while a "locked" push event lands during the send.
     */
    private function useDriverThatPushesDuringSend(int $observedSecondsAfterSend): void
    {
        $this->driver = new class($observedSecondsAfterSend) extends FakeLockDriver
        {
            public function __construct(private readonly int $offset) {}

            public function send(Lock $lock, LockAction $action, string $commandId): void
            {
                parent::send($lock, $action, $commandId);
                app(LockStateRecorder::class)->record($lock, new ReportedState(ReportedLockState::Locked, CarbonImmutable::now()->addSeconds($this->offset)), LockStateEvent::SOURCE_PUSH);
            }
        };
        $this->driver->setState($this->lock, ReportedLockState::Unlocked);
        $this->driver->ignoreCommands();
        $this->app->instance(LockDriver::class, $this->driver);
    }

    public function test_an_unreachable_integration_fails_the_command_and_marks_the_lock(): void
    {
        $this->driver->failNextSendWith(new IntegrationUnavailable('Bridge refused the connection.'));
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $id = $this->command($resident, 'lock')->assertAccepted()->json('data.id');

        $this->getJson(route('api.v1.lock-requests.show', $id))
            ->assertJsonPath('data.status', 'failed')
            ->assertJsonPath('data.command.integration_result', 'rejected')
            ->assertJsonPath('data.command.integration_error', 'Bridge refused the connection.')
            ->assertJsonPath('data.command.confirmation', null);

        $lock = $this->lock->fresh();
        $this->assertSame(LockConnectionStatus::Disconnected, $lock->connection_status);
        $this->assertSame('Bridge refused the connection.', $lock->last_error);
    }

    public function test_an_ambiguous_send_is_reconciled_against_the_reported_state(): void
    {
        $this->driver->failNextSendWith(new IntegrationOutcomeUnknown('Timed out waiting for the ack.'));
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $id = $this->command($resident, 'lock')->assertAccepted()->json('data.id');

        $this->getJson(route('api.v1.lock-requests.show', $id))
            ->assertJsonPath('data.status', 'confirmed_success')
            ->assertJsonPath('data.command.integration_result', 'ambiguous');
    }

    public function test_the_default_unconfigured_driver_never_reports_success(): void
    {
        $this->app->instance(LockDriver::class, new UnconfiguredLockDriver);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $id = $this->command($resident, 'lock')->assertAccepted()->json('data.id');

        $this->assertSame(AccessRequestStatus::Failed, AccessRequest::query()->where('public_id', $id)->value('status'));
    }

    public function test_an_expired_request_is_never_sent(): void
    {
        Queue::fake();
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $id = $this->command($resident, 'lock')->assertAccepted()->assertJsonPath('data.status', 'queued')->json('data.id');
        $request = AccessRequest::query()->where('public_id', $id)->sole();

        $this->travel(config('lockguard.locks.request_ttl_seconds') + 1)->seconds();
        (new SubmitLockCommand($request->id))->handle($this->driver, app(LockStateRecorder::class), app(AuditLogger::class));

        $this->assertSame(AccessRequestStatus::Expired, $request->fresh()->status);
        $this->assertSame([], $this->driver->sent);
        $this->assertDatabaseHas('audit_logs', ['action' => 'lock.command_expired']);
    }

    public function test_the_sweeper_expires_unsent_requests_when_no_worker_runs(): void
    {
        Queue::fake();
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $id = $this->command($resident, 'lock')->assertAccepted()->json('data.id');

        $this->travel(5)->minutes();
        $this->artisan('lockguard:expire-commands')->assertSuccessful();

        $this->assertSame(AccessRequestStatus::Expired, AccessRequest::query()->where('public_id', $id)->value('status'));
        Queue::assertPushed(SubmitLockCommand::class, 1);
    }

    public function test_a_second_command_is_refused_while_one_is_in_flight(): void
    {
        Queue::fake();
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $this->command($resident, 'lock')->assertAccepted();
        $this->command($resident, 'lock')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'lock_busy');
    }

    public function test_requests_are_private_to_the_requester(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $other = $this->userWithRole(RoleTemplate::Resident);
        $id = $this->command($resident, 'lock')->assertAccepted()->json('data.id');

        $this->actingAs($other)->getJson(route('api.v1.lock-requests.show', $id))->assertForbidden();
    }

    public function test_users_see_only_locks_they_have_access_to(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $otherLock = Lock::factory()->create(['name' => 'Back Door']);

        $this->actingAs($resident)->getJson(route('api.v1.locks.index'))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Front Door')
            ->assertJsonPath('data.0.state_freshness', 'current');

        $this->getJson(route('api.v1.locks.show', $otherLock))->assertForbidden();
    }

    public function test_reported_state_is_shown_as_stale_or_unknown_rather_than_guessed(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $never = Lock::factory()->create();

        $this->actingAs($admin)->getJson(route('api.v1.locks.show', $never))
            ->assertJsonPath('data.reported_state', 'unknown')
            ->assertJsonPath('data.state_freshness', 'unknown');

        $this->travel(config('lockguard.locks.state_stale_seconds') + 1)->seconds();
        $this->getJson(route('api.v1.locks.show', $this->lock))
            ->assertJsonPath('data.reported_state', 'unlocked')
            ->assertJsonPath('data.state_freshness', 'stale');
    }

    public function test_registering_a_lock_needs_integration_settings_and_starts_with_commands_disabled(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $payload = ['property_id' => $this->lock->property_id, 'name' => 'Back Door', 'model' => 'T85D0', 'external_id' => 'T85D0BACK0001'];

        $this->actingAs($manager)->withSession([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()])
            ->postJson(route('api.v1.locks.store'), $payload)
            ->assertForbidden();

        $this->actingAs($admin)->postJson(route('api.v1.locks.store'), $payload)
            ->assertCreated()
            ->assertJsonPath('data.commands_enabled', false)
            ->assertJsonPath('data.reported_state', 'unknown');

        $this->assertDatabaseHas('audit_logs', ['action' => 'lock.registered', 'actor_user_id' => $admin->id]);
    }

    public function test_a_property_manager_grants_lock_access_but_not_to_themselves(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager, withAccess: false);
        $guest = $this->userWithRole(RoleTemplate::TemporaryGuest, withAccess: false);

        $this->actingAs($manager)->withSession([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()])
            ->putJson(route('api.v1.locks.access.update', [$this->lock, $guest]), ['valid_until' => now()->addDay()->toIso8601String()])
            ->assertOk();
        $this->assertTrue($guest->locks()->whereKey($this->lock->id)->exists());

        $this->putJson(route('api.v1.locks.access.update', [$this->lock, $manager]))
            ->assertForbidden()
            ->assertJsonPath('error.code', 'self_modification_forbidden');

        $this->deleteJson(route('api.v1.locks.access.destroy', [$this->lock, $guest]))->assertNoContent();
        $this->assertFalse($guest->locks()->whereKey($this->lock->id)->exists());
        $this->assertDatabaseHas('audit_logs', ['action' => 'lock.access_revoked', 'target_user_id' => $guest->id]);

        $resident = $this->userWithRole(RoleTemplate::Resident, withAccess: false);
        $this->actingAs($resident)->putJson(route('api.v1.locks.access.update', [$this->lock, $guest]))
            ->assertForbidden()
            ->assertJsonPath('error.details.required_permission', PermissionKey::AccessGrantsCreate->value);
    }

    public function test_suspended_accounts_cannot_send_commands(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $resident->forceFill(['status' => 'suspended'])->save();

        $this->command($resident, 'lock')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'account_inactive');

        $this->assertSame([], $this->driver->sent);
        $this->assertSame(0, AuditLog::query()->where('action', 'lock.command_authorized')->count());
    }
}
