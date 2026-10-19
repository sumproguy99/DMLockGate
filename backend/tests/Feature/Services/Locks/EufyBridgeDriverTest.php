<?php

namespace Tests\Feature\Services\Locks;

use App\Enums\LockAction;
use App\Enums\ReportedLockState;
use App\Models\Lock;
use App\Services\Locks\Integration\BridgeSignature;
use App\Services\Locks\Integration\EufyBridgeDriver;
use App\Services\Locks\Integration\IntegrationOutcomeUnknown;
use App\Services\Locks\Integration\IntegrationUnavailable;
use App\Services\Locks\Integration\LockDriver;
use App\Services\Locks\Integration\UnconfiguredLockDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * How the bridge driver classifies replies. The rule under test: only proof that nothing was sent
 * may become IntegrationUnavailable; everything else is IntegrationOutcomeUnknown.
 */
class EufyBridgeDriverTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'bridge-secret-bridge-secret-bridge-secret';

    private EufyBridgeDriver $driver;

    private Lock $lock;

    protected function setUp(): void
    {
        parent::setUp();

        $this->driver = new EufyBridgeDriver('http://bridge.test', self::SECRET);
        $this->lock = Lock::factory()->create(['external_id' => 'T85D0ABC123']);
    }

    public function test_sends_a_signed_command_and_accepts_an_acknowledgement(): void
    {
        Http::fake(['bridge.test/*' => Http::response(['result' => 'acknowledged', 'latency_ms' => 3700])]);

        $this->driver->send($this->lock, LockAction::Unlock, 'req-0001-abcd');

        Http::assertSent(function (Request $request): bool {
            $expected = BridgeSignature::sign(self::SECRET, $request->header(BridgeSignature::TIMESTAMP_HEADER)[0], 'POST', '/v1/locks/T85D0ABC123/commands', $request->body());

            return $request->url() === 'http://bridge.test/v1/locks/T85D0ABC123/commands'
                && $request['action'] === 'unlock'
                && $request['command_id'] === 'req-0001-abcd'
                && hash_equals($expected, $request->header(BridgeSignature::SIGNATURE_HEADER)[0]);
        });
    }

    public function test_a_bridge_rejection_means_not_delivered(): void
    {
        Http::fake(['bridge.test/*' => Http::response(['result' => 'rejected', 'error' => 'eufy_not_connected'], 503)]);

        $this->expectException(IntegrationUnavailable::class);
        $this->driver->send($this->lock, LockAction::Lock, 'req-0002-abcd');
    }

    public function test_a_command_the_bridge_gave_up_on_before_publishing_means_not_delivered(): void
    {
        Http::fake(['bridge.test/*' => Http::response(['result' => 'rejected', 'error' => 'not_sent_timeout', 'latency_ms' => 25000], 504)]);

        $this->expectException(IntegrationUnavailable::class);
        $this->expectExceptionMessage('not_sent_timeout');
        $this->driver->send($this->lock, LockAction::Unlock, 'req-0009-abcd');
    }

    public function test_a_not_sent_rejection_carries_the_bridges_full_reason(): void
    {
        $answers = implode('; ', array_map(fn (int $i): string => "192.0.2.{$i} Subscribe error: Unspecified error", range(1, 8)));
        Http::fake(['bridge.test/*' => Http::response(['result' => 'rejected', 'error' => 'not_sent', 'detail' => "No Eufy command server would accept this lock ({$answers})."], 504)]);

        $this->expectException(IntegrationUnavailable::class);
        $this->expectExceptionMessageMatches('/\(not_sent\): No Eufy command server would accept this lock \(192\.0\.2\.1 .*192\.0\.2\.8 Subscribe error: Unspecified error\)\.$/');
        $this->driver->send($this->lock, LockAction::Lock, 'req-0010-abcd');
    }

    public function test_a_degraded_eufy_cloud_means_not_delivered(): void
    {
        Http::fake(['bridge.test/*' => Http::response(['result' => 'rejected', 'error' => 'eufy_degraded'], 503)]);

        $this->expectException(IntegrationUnavailable::class);
        $this->driver->send($this->lock, LockAction::Unlock, 'req-0006-abcd');
    }

    public function test_a_refused_connection_means_not_delivered(): void
    {
        Http::fake(['bridge.test/*' => Http::failedConnection('cURL error 7: Failed to connect to bridge.test port 80')]);

        $this->expectException(IntegrationUnavailable::class);
        $this->driver->send($this->lock, LockAction::Lock, 'req-0003-abcd');
    }

    public function test_a_timeout_is_an_unknown_outcome(): void
    {
        Http::fake(['bridge.test/*' => Http::failedConnection('cURL error 28: Operation timed out after 30001 milliseconds')]);

        $this->expectException(IntegrationOutcomeUnknown::class);
        $this->driver->send($this->lock, LockAction::Unlock, 'req-0004-abcd');
    }

    /**
     * @return array<string, array{int, array<string, mixed>}>
     */
    public static function ambiguousReplies(): array
    {
        return [
            'send failed after leaving the bridge' => [502, ['result' => 'ambiguous', 'error' => 'no acknowledgement']],
            'lock never replied' => [502, ['result' => 'ambiguous', 'error' => 'no_device_ack']],
            'duplicate command id' => [409, ['result' => 'ambiguous', 'error' => 'duplicate_command_id']],
            'bridge crashed' => [500, ['error' => 'internal_error']],
            'success status without acknowledgement' => [200, []],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('ambiguousReplies')]
    public function test_anything_else_is_an_unknown_outcome(int $status, array $body): void
    {
        Http::fake(['bridge.test/*' => Http::response($body, $status)]);

        $this->expectException(IntegrationOutcomeUnknown::class);
        $this->driver->send($this->lock, LockAction::Unlock, 'req-0005-abcd');
    }

    public function test_reads_the_reported_state(): void
    {
        Http::fake(['bridge.test/v1/locks/T85D0ABC123/state' => Http::response(['data' => ['state' => 'locked', 'battery_level' => 83]])]);

        $state = $this->driver->readState($this->lock);

        $this->assertSame(ReportedLockState::Locked, $state->state);
        $this->assertSame(83, $state->batteryLevel);
    }

    public function test_an_unrecognized_state_reads_as_unknown(): void
    {
        Http::fake(['bridge.test/*' => Http::response(['data' => ['state' => 'half-open']])]);

        $this->assertSame(ReportedLockState::Unknown, $this->driver->readState($this->lock)->state);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function failedReads(): array
    {
        return [
            'eufy not connected' => ['eufy_not_connected'],
            'cloud returned no fresh state' => ['eufy_degraded'],
        ];
    }

    #[DataProvider('failedReads')]
    public function test_a_failed_read_is_unavailable(string $error): void
    {
        Http::fake(['bridge.test/*' => Http::response(['error' => $error], 503)]);

        $this->expectException(IntegrationUnavailable::class);
        $this->driver->readState($this->lock);
    }

    public function test_the_container_falls_back_to_unconfigured_without_a_strong_secret(): void
    {
        config(['lockguard.locks.driver' => 'eufy_bridge', 'lockguard.locks.eufy_bridge.secret' => 'short']);
        $this->app->forgetInstance(LockDriver::class);
        $this->assertInstanceOf(UnconfiguredLockDriver::class, $this->app->make(LockDriver::class));

        config(['lockguard.locks.eufy_bridge.secret' => self::SECRET]);
        $this->app->forgetInstance(LockDriver::class);
        $this->assertInstanceOf(EufyBridgeDriver::class, $this->app->make(LockDriver::class));
    }
}
