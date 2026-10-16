<?php

namespace Tests\Feature\Console\Commands;

use App\Enums\LockConnectionStatus;
use App\Enums\ReportedLockState;
use App\Models\AuditLog;
use App\Models\Lock;
use App\Models\LockStateEvent;
use App\Models\Property;
use App\Services\Locks\Integration\EufyBridgeDriver;
use App\Services\Locks\Integration\LockDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SyncLocksCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->app->instance(LockDriver::class, new EufyBridgeDriver('http://bridge.test', str_repeat('s', 40)));
        Http::fake([
            'bridge.test/v1/locks' => Http::response(['data' => [
                ['external_id' => 'T85D0FRONT01', 'name' => 'Front Door', 'model' => 'T85D0', 'firmware_version' => '2.3.1'],
                ['external_id' => 'T85D0BACK002', 'name' => 'Back Door', 'model' => 'T85D0', 'firmware_version' => null],
            ]]),
            'bridge.test/v1/locks/*/state' => Http::response(['data' => ['state' => 'locked', 'battery_level' => 97]]),
        ]);
    }

    public function test_refreshes_registered_locks_and_lists_unregistered_ones(): void
    {
        $front = Lock::factory()->create(['external_id' => 'T85D0FRONT01', 'name' => 'Our Front Door', 'firmware_version' => null]);

        $this->artisan('lockguard:sync-locks')->assertSuccessful();

        $front->refresh();
        $this->assertSame('Our Front Door', $front->name);
        $this->assertSame('2.3.1', $front->firmware_version);
        $this->assertSame(ReportedLockState::Locked, $front->last_reported_state);
        $this->assertSame(97, $front->battery_level);
        $this->assertSame(LockStateEvent::SOURCE_POLL, LockStateEvent::query()->sole()->source);
        $this->assertSame(1, Lock::query()->count());
        Http::assertNotSent(fn (Request $request): bool => str_ends_with($request->url(), '/commands'));
    }

    public function test_registers_new_locks_with_commands_disabled(): void
    {
        $property = Property::factory()->create();

        $this->artisan('lockguard:sync-locks', ['--register' => true, '--property' => $property->id])->assertSuccessful();

        $this->assertSame(2, Lock::query()->where('property_id', $property->id)->where('commands_enabled', false)->count());
        $this->assertSame(2, AuditLog::query()->where('action', 'lock.registered')->count());
    }

    public function test_register_needs_an_existing_property(): void
    {
        $this->artisan('lockguard:sync-locks', ['--register' => true, '--property' => 999])->assertFailed();

        $this->assertSame(0, Lock::query()->count());
    }

    public function test_an_unreachable_bridge_marks_eufy_locks_degraded(): void
    {
        Http::fake(['*' => Http::failedConnection('cURL error 7: Failed to connect')]);
        $lock = Lock::factory()->reporting(ReportedLockState::Locked)->create();

        $this->artisan('lockguard:sync-locks')->assertFailed();

        $this->assertSame(LockConnectionStatus::Degraded, $lock->fresh()->connection_status);
    }

    public function test_does_nothing_when_the_bridge_is_not_the_driver(): void
    {
        $this->app->forgetInstance(LockDriver::class);

        $this->artisan('lockguard:sync-locks')->assertSuccessful();

        Http::assertNothingSent();
    }
}
