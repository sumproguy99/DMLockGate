<?php

namespace Tests\Feature\Http\Controllers\Api\V1\System;

use App\Enums\ReportedLockState;
use App\Enums\RoleTemplate;
use App\Models\Lock;
use App\Models\LockStateEvent;
use App\Models\Role;
use App\Models\User;
use App\Services\Locks\Integration\EufyBridgeDriver;
use App\Services\Locks\Integration\FakeLockDriver;
use App\Services\Locks\Integration\LockDriver;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * GET /api/v1/system/health: measured, never assumed.
 */
class SystemHealthTest extends TestCase
{
    use RefreshDatabase;

    private const BRIDGE_REPLY = [
        'status' => 'connected',
        'degraded_reason' => null,
        'locks' => 2,
        'last_sync_at' => '2026-10-17T10:00:00.000Z',
        'cloud_ok_at' => '2026-10-17T10:00:00.000Z',
        'cloud_failures' => 0,
        'cloud_last_error' => null,
        'last_error' => null,
    ];

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
        $this->app->instance(LockDriver::class, new EufyBridgeDriver('http://bridge.test', str_repeat('s', 40)));
    }

    private function userWithRole(RoleTemplate $template): User
    {
        $user = User::factory()->create();
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    private function health(RoleTemplate $template = RoleTemplate::SuperAdministrator): TestResponse
    {
        return $this->actingAs($this->userWithRole($template))->getJson(route('api.v1.system.health'))->assertOk();
    }

    /**
     * @return array<string, array{key: string, status: string, summary: string}>
     */
    private function subsystems(TestResponse $response): array
    {
        return collect($response->json('data.subsystems'))->keyBy('key')->all();
    }

    private function recordPoll(Lock $lock, int $minutesAgo): void
    {
        LockStateEvent::query()->create([
            'lock_id' => $lock->id,
            'state' => ReportedLockState::Locked,
            'source' => LockStateEvent::SOURCE_POLL,
            'observed_at' => now()->subMinutes($minutesAgo),
            'received_at' => now()->subMinutes($minutesAgo),
        ]);
    }

    public function test_requires_a_session(): void
    {
        $this->getJson(route('api.v1.system.health'))->assertUnauthorized();
    }

    public function test_a_resident_gets_only_the_overall_integration_status(): void
    {
        Http::fake(['bridge.test/*' => Http::response(self::BRIDGE_REPLY)]);

        $response = $this->health(RoleTemplate::Resident);

        $response->assertJsonPath('data.integration.status', 'connected')
            ->assertJsonMissingPath('data.integration.details')
            ->assertJsonMissingPath('data.subsystems');
    }

    public function test_an_administrator_gets_diagnostics_and_every_subsystem(): void
    {
        Http::fake(['bridge.test/*' => Http::response(self::BRIDGE_REPLY)]);
        $this->recordPoll(Lock::factory()->create(), 3);

        $response = $this->health();

        $response->assertJsonPath('data.integration.status', 'connected')
            ->assertJsonPath('data.integration.details.locks_visible', 2)
            ->assertJsonPath('data.integration.details.cloud_failures', 0);
        $this->assertNotNull($response->json('data.integration.last_sync_at'));

        $subsystems = $this->subsystems($response);
        $this->assertSame(
            ['application', 'database', 'queue', 'state_sync', 'eufy', 'audit', 'notifications', 'live_updates'],
            array_keys($subsystems),
        );
        $this->assertSame('ok', $subsystems['database']['status']);
        $this->assertSame('ok', $subsystems['state_sync']['status']);
        $this->assertSame('ok', $subsystems['eufy']['status']);
        $this->assertSame('ok', $subsystems['audit']['status']);
        $this->assertSame('not_implemented', $subsystems['notifications']['status']);
        $this->assertSame('not_implemented', $subsystems['live_updates']['status']);
    }

    public function test_an_auditor_also_gets_the_diagnostics(): void
    {
        Http::fake(['bridge.test/*' => Http::response(self::BRIDGE_REPLY)]);

        $this->health(RoleTemplate::ReadOnlyAuditor)->assertJsonPath('data.subsystems.0.key', 'application');
    }

    public function test_an_unreachable_bridge_is_reported_as_down(): void
    {
        Http::fake(['bridge.test/*' => Http::failedConnection()]);

        $response = $this->health();

        $response->assertJsonPath('data.integration.status', 'unreachable');
        $this->assertSame('down', $this->subsystems($response)['eufy']['status']);
    }

    public function test_a_degraded_cloud_session_is_a_warning(): void
    {
        Http::fake(['bridge.test/*' => Http::response([...self::BRIDGE_REPLY, 'status' => 'degraded', 'degraded_reason' => 'cloud_errors', 'cloud_failures' => 3])]);

        $response = $this->health();

        $response->assertJsonPath('data.integration.status', 'degraded')
            ->assertJsonPath('data.integration.details.degraded_reason', 'cloud_errors');
        $this->assertSame('warning', $this->subsystems($response)['eufy']['status']);
    }

    public function test_bridge_errors_reported_as_objects_reach_clients_as_text(): void
    {
        Http::fake(['bridge.test/*' => Http::response([
            ...self::BRIDGE_REPLY,
            'last_error' => ['message' => 'read ECONNRESET', 'at' => '2026-10-17T12:41:23.193Z'],
            'cloud_last_error' => ['unexpected' => true],
        ])]);

        $this->health()
            ->assertJsonPath('data.integration.details.last_error', 'read ECONNRESET')
            ->assertJsonPath('data.integration.details.last_error_at', '2026-10-17T12:41:23.193Z')
            ->assertJsonPath('data.integration.details.cloud_last_error', 'Unrecognized error report from the bridge.');
    }

    public function test_repeated_command_failures_mark_a_connected_bridge_degraded(): void
    {
        Http::fake(['bridge.test/*' => Http::response([
            ...self::BRIDGE_REPLY,
            'commands' => ['consecutive_failures' => 3, 'last_failure' => 'Not sent: no acknowledgement within 25000 ms', 'last_failure_at' => '2026-10-17T21:05:47.137Z', 'last_success_at' => null],
        ])]);

        $response = $this->health();

        $response->assertJsonPath('data.integration.status', 'degraded')
            ->assertJsonPath('data.integration.degraded_reason', 'commands_failing')
            ->assertJsonPath('data.integration.details.command_failures', 3)
            ->assertJsonPath('data.integration.details.last_command_failure', 'Not sent: no acknowledgement within 25000 ms');
        $this->assertSame('warning', $this->subsystems($response)['eufy']['status']);
        $this->assertStringContainsString('did not reach the locks', $this->subsystems($response)['eufy']['summary']);
    }

    public function test_one_command_failure_is_not_yet_degraded(): void
    {
        Http::fake(['bridge.test/*' => Http::response([...self::BRIDGE_REPLY, 'commands' => ['consecutive_failures' => 1]])]);

        $this->health(RoleTemplate::Resident)
            ->assertJsonPath('data.integration.status', 'connected')
            ->assertJsonPath('data.integration.degraded_reason', null);
    }

    public function test_an_unrecognized_bridge_status_is_unknown(): void
    {
        Http::fake(['bridge.test/*' => Http::response([...self::BRIDGE_REPLY, 'status' => 'party_mode'])]);

        $this->health()->assertJsonPath('data.integration.status', 'unknown');
    }

    public function test_the_bridge_is_asked_at_most_once_per_cache_window(): void
    {
        Http::fake(['bridge.test/*' => Http::response(self::BRIDGE_REPLY)]);

        $this->health();
        $this->health();

        Http::assertSentCount(1);
    }

    public function test_a_missed_state_sync_is_a_warning(): void
    {
        Http::fake(['bridge.test/*' => Http::response(self::BRIDGE_REPLY)]);
        $this->recordPoll(Lock::factory()->create(), 40);

        $this->assertSame('warning', $this->subsystems($this->health())['state_sync']['status']);
    }

    public function test_a_queue_job_nobody_picks_up_is_a_warning(): void
    {
        Http::fake(['bridge.test/*' => Http::response(self::BRIDGE_REPLY)]);
        config(['queue.default' => 'database']);
        DB::table('jobs')->insert([
            'queue' => 'default',
            'payload' => '{}',
            'attempts' => 0,
            'reserved_at' => null,
            'available_at' => now()->subMinutes(10)->getTimestamp(),
            'created_at' => now()->subMinutes(10)->getTimestamp(),
        ]);

        $queue = $this->subsystems($this->health())['queue'];

        $this->assertSame('warning', $queue['status']);
        $this->assertStringContainsString('worker may not be running', $queue['summary']);
    }

    public function test_simulated_locks_are_never_reported_as_a_real_connection(): void
    {
        $this->app->instance(LockDriver::class, new FakeLockDriver);

        $response = $this->health();

        $response->assertJsonPath('data.integration.status', 'simulated');
        $this->assertSame('warning', $this->subsystems($response)['eufy']['status']);
        Http::assertNothingSent();
    }
}
