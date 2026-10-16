<?php

namespace Tests\Feature\Http\Controllers\Api\Internal;

use App\Enums\LockConnectionStatus;
use App\Enums\ReportedLockState;
use App\Models\Lock;
use App\Models\LockStateEvent;
use App\Services\Locks\Integration\BridgeSignature;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class EufyEventControllerTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'bridge-secret-bridge-secret-bridge-secret';

    private Lock $lock;

    protected function setUp(): void
    {
        parent::setUp();

        config(['lockguard.locks.eufy_bridge.secret' => self::SECRET]);
        $this->lock = Lock::factory()->reporting(ReportedLockState::Unlocked)->create(['external_id' => 'T85D0ABC123']);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, string>|null  $headers
     */
    private function deliver(array $payload, ?array $headers = null, string $secret = self::SECRET): TestResponse
    {
        $body = json_encode($payload, JSON_THROW_ON_ERROR);
        $headers ??= BridgeSignature::headers($secret, 'POST', '/api/internal/eufy/events', $body);

        return $this->call('POST', '/api/internal/eufy/events', [], [], [], $this->transformHeadersToServerVars([
            ...$headers,
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ]), $body);
    }

    /**
     * @return array<string, mixed>
     */
    private function lockedEvent(array $overrides = []): array
    {
        return [
            'kind' => 'state',
            'external_id' => 'T85D0ABC123',
            'state' => 'locked',
            'event_type' => 264,
            'observed_at' => now()->toIso8601String(),
            'external_event_id' => '264:1760000000000',
            'actor' => 'LockGuard Bridge',
            ...$overrides,
        ];
    }

    public function test_records_a_signed_state_event_as_push(): void
    {
        $this->deliver($this->lockedEvent())->assertAccepted()->assertJsonPath('data.recorded', true);

        $event = LockStateEvent::query()->sole();
        $this->assertSame(ReportedLockState::Locked, $event->state);
        $this->assertSame(LockStateEvent::SOURCE_PUSH, $event->source);
        $this->assertSame('LockGuard Bridge', $event->external_actor);
        $this->assertSame(ReportedLockState::Locked, $this->lock->fresh()->last_reported_state);
    }

    public function test_redelivery_is_recorded_once(): void
    {
        $this->deliver($this->lockedEvent())->assertAccepted();
        $this->travel(2)->seconds();
        $this->deliver($this->lockedEvent())->assertAccepted();

        $this->assertSame(1, LockStateEvent::query()->count());
    }

    public function test_refuses_unsigned_wrongly_signed_and_replayed_requests(): void
    {
        $this->deliver($this->lockedEvent(), headers: [])->assertUnauthorized();
        $this->deliver($this->lockedEvent(), secret: str_repeat('x', 40))->assertUnauthorized();

        $body = json_encode($this->lockedEvent(), JSON_THROW_ON_ERROR);
        $headers = BridgeSignature::headers(self::SECRET, 'POST', '/api/internal/eufy/events', $body);
        $this->deliver($this->lockedEvent(), $headers)->assertAccepted();
        $this->deliver($this->lockedEvent(), $headers)->assertUnauthorized();

        $this->assertSame(1, LockStateEvent::query()->count());
    }

    public function test_refuses_a_stale_timestamp(): void
    {
        $body = json_encode($this->lockedEvent(), JSON_THROW_ON_ERROR);
        $old = (string) now()->subMinutes(5)->getTimestamp();

        $this->deliver($this->lockedEvent(), [
            BridgeSignature::TIMESTAMP_HEADER => $old,
            BridgeSignature::SIGNATURE_HEADER => BridgeSignature::sign(self::SECRET, $old, 'POST', '/api/internal/eufy/events', $body),
        ])->assertUnauthorized();
    }

    public function test_fails_closed_when_no_secret_is_configured(): void
    {
        config(['lockguard.locks.eufy_bridge.secret' => null]);

        $this->deliver($this->lockedEvent(), secret: '')->assertUnauthorized();
        $this->assertSame(0, LockStateEvent::query()->count());
    }

    public function test_ignores_events_for_unknown_locks(): void
    {
        $this->deliver($this->lockedEvent(['external_id' => 'T85D0OTHER99']))->assertAccepted()->assertJsonPath('data.recorded', false);

        $this->assertSame(0, LockStateEvent::query()->count());
    }

    public function test_a_lock_clock_far_in_the_future_is_not_trusted(): void
    {
        $this->deliver($this->lockedEvent(['observed_at' => now()->addHour()->toIso8601String()]))->assertAccepted();

        $this->assertTrue(LockStateEvent::query()->sole()->observed_at->lte(now()->addSecond()));
    }

    public function test_connectivity_events_update_the_connection_status_only(): void
    {
        $this->deliver(['kind' => 'connectivity', 'external_id' => 'T85D0ABC123', 'online' => false, 'event_type' => 516, 'observed_at' => now()->toIso8601String()])
            ->assertAccepted();

        $lock = $this->lock->fresh();
        $this->assertSame(LockConnectionStatus::Disconnected, $lock->connection_status);
        $this->assertSame(ReportedLockState::Unlocked, $lock->last_reported_state);
        $this->assertSame(0, LockStateEvent::query()->count());
    }

    public function test_validates_the_payload(): void
    {
        $this->deliver($this->lockedEvent(['state' => 'open']))->assertUnprocessable();
    }
}
