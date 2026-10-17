<?php

namespace Tests\Feature\Services\Locks;

use App\Enums\ReportedLockState;
use App\Models\Lock;
use App\Models\LockStateEvent;
use App\Services\Locks\Integration\ReportedState;
use App\Services\Locks\LockStateRecorder;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Which observation becomes a lock's cached "latest reported state".
 */
class LockStateRecorderTest extends TestCase
{
    use RefreshDatabase;

    private LockStateRecorder $recorder;

    private Lock $lock;

    protected function setUp(): void
    {
        parent::setUp();

        config(['lockguard.locks.poll_lag_seconds' => 15]);
        $this->recorder = app(LockStateRecorder::class);
        $this->lock = Lock::factory()->reporting(ReportedLockState::Unlocked)->create(['last_state_observed_at' => now()->subMinute()]);
    }

    private function record(ReportedLockState $state, CarbonImmutable $observedAt, string $source): void
    {
        $this->recorder->record($this->lock, new ReportedState($state, $observedAt), $source);
    }

    public function test_a_poll_just_after_a_push_does_not_override_it(): void
    {
        // The live case: the lock pushed "locked" at :20 and the cloud still read "unlocked" at :21.
        $this->record(ReportedLockState::Locked, CarbonImmutable::now(), LockStateEvent::SOURCE_PUSH);
        $this->record(ReportedLockState::Unlocked, CarbonImmutable::now()->addSecond(), LockStateEvent::SOURCE_POLL);

        $lock = $this->lock->fresh();
        $this->assertSame(ReportedLockState::Locked, $lock->last_reported_state);
        $this->assertSame(LockStateEvent::SOURCE_PUSH, $lock->last_state_source);
        $this->assertSame(2, LockStateEvent::query()->where('lock_id', $this->lock->id)->count());
    }

    public function test_a_push_arriving_after_a_trailing_poll_still_wins(): void
    {
        // The live unlock: the cloud read "locked" at :23, then the lock's push said "unlocked" at :22.
        $this->record(ReportedLockState::Locked, CarbonImmutable::now(), LockStateEvent::SOURCE_POLL);
        $this->record(ReportedLockState::Unlocked, CarbonImmutable::now()->subSecond(), LockStateEvent::SOURCE_PUSH);

        $lock = $this->lock->fresh();
        $this->assertSame(ReportedLockState::Unlocked, $lock->last_reported_state);
        $this->assertSame(LockStateEvent::SOURCE_PUSH, $lock->last_state_source);
    }

    public function test_a_push_older_than_the_lag_window_does_not_replace_a_poll(): void
    {
        $this->record(ReportedLockState::Locked, CarbonImmutable::now(), LockStateEvent::SOURCE_POLL);
        $this->record(ReportedLockState::Unlocked, CarbonImmutable::now()->subSeconds(16), LockStateEvent::SOURCE_PUSH);

        $this->assertSame(ReportedLockState::Locked, $this->lock->fresh()->last_reported_state);
    }

    public function test_a_poll_after_the_lag_window_replaces_a_push(): void
    {
        $this->record(ReportedLockState::Locked, CarbonImmutable::now(), LockStateEvent::SOURCE_PUSH);
        $this->record(ReportedLockState::Unlocked, CarbonImmutable::now()->addSeconds(16), LockStateEvent::SOURCE_POLL);

        $this->assertSame(ReportedLockState::Unlocked, $this->lock->fresh()->last_reported_state);
    }

    public function test_a_newer_push_always_replaces_the_cached_state(): void
    {
        $this->record(ReportedLockState::Locked, CarbonImmutable::now(), LockStateEvent::SOURCE_PUSH);
        $this->record(ReportedLockState::Unlocked, CarbonImmutable::now()->addSeconds(2), LockStateEvent::SOURCE_PUSH);

        $this->assertSame(ReportedLockState::Unlocked, $this->lock->fresh()->last_reported_state);
    }

    public function test_an_older_observation_from_the_same_source_never_replaces_a_newer_one(): void
    {
        // A redelivered or late push about an earlier action.
        $this->record(ReportedLockState::Locked, CarbonImmutable::now(), LockStateEvent::SOURCE_PUSH);
        $this->record(ReportedLockState::Unlocked, CarbonImmutable::now()->subSeconds(5), LockStateEvent::SOURCE_PUSH);

        $this->assertSame(ReportedLockState::Locked, $this->lock->fresh()->last_reported_state);
    }
}
