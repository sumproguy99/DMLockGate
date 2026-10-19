<?php

namespace App\Services\Locks;

use App\Enums\LockConnectionStatus;
use App\Models\Lock;
use App\Models\LockStateEvent;
use App\Services\Locks\Integration\ReportedState;
use Illuminate\Support\Facades\DB;

/**
 * Records state observations reported by a lock and refreshes the lock's cached "latest
 * observation" columns. The only code that writes a lock's reported state.
 */
class LockStateRecorder
{
    /**
     * Longest error text kept for a lock or a command; matches the bridge's own limit.
     */
    public const ERROR_TEXT_MAX = 1000;

    /**
     * @param  string  $source  {@see LockStateEvent::SOURCE_PUSH} or {@see LockStateEvent::SOURCE_POLL}.
     * @return LockStateEvent The stored event, or the existing one when the vendor event was already recorded.
     */
    public function record(Lock $lock, ReportedState $reported, string $source): LockStateEvent
    {
        return DB::transaction(function () use ($lock, $reported, $source): LockStateEvent {
            if ($reported->externalEventId !== null) {
                $existing = LockStateEvent::query()
                    ->where('lock_id', $lock->id)
                    ->where('external_event_id', $reported->externalEventId)
                    ->first();
                if ($existing !== null) {
                    return $existing;
                }
            }

            $event = LockStateEvent::query()->create([
                'lock_id' => $lock->id,
                'state' => $reported->state,
                'source' => $source,
                'observed_at' => $reported->observedAt,
                'received_at' => now(),
                'battery_level' => $reported->batteryLevel,
                'external_event_id' => $reported->externalEventId,
                'external_actor' => $reported->externalActor,
                'raw' => $reported->raw === [] ? null : $reported->raw,
            ]);

            $locked = Lock::query()->whereKey($lock->id)->lockForUpdate()->firstOrFail();
            $updates = [
                'last_communication_at' => now(),
                'connection_status' => LockConnectionStatus::Connected,
            ];

            if ($this->replacesCachedState($locked, $reported, $source)) {
                $updates += [
                    'last_reported_state' => $reported->state,
                    'last_state_observed_at' => $reported->observedAt,
                    'last_state_source' => $source,
                ];
            }
            if ($reported->batteryLevel !== null) {
                $updates += ['battery_level' => $reported->batteryLevel, 'battery_observed_at' => $reported->observedAt];
            }

            $locked->forceFill($updates)->save();
            $lock->setRawAttributes($locked->getAttributes(), true);

            return $event;
        });
    }

    /**
     * Only a newer observation replaces the cached state, so a late push cannot overwrite a fresher
     * read. The exception is a poll within the lag window of a push, in either arrival order: the
     * cloud copy a poll reads trails the lock, so it can still show the state from before the change
     * the push reported. Within that window the push wins.
     */
    private function replacesCachedState(Lock $lock, ReportedState $reported, string $source): bool
    {
        $cachedAt = $lock->last_state_observed_at;
        if ($cachedAt === null) {
            return true;
        }

        $lag = (int) config('lockguard.locks.poll_lag_seconds');
        if ($source === LockStateEvent::SOURCE_PUSH && $lock->last_state_source === LockStateEvent::SOURCE_POLL) {
            return $reported->observedAt->gte($cachedAt->copy()->subSeconds($lag));
        }
        if ($source === LockStateEvent::SOURCE_POLL && $lock->last_state_source === LockStateEvent::SOURCE_PUSH) {
            return $reported->observedAt->gte($cachedAt->copy()->addSeconds($lag));
        }

        return $reported->observedAt->gte($cachedAt);
    }

    /**
     * The lock itself reported going offline or coming back online. Says nothing about the bolt.
     */
    public function recordConnectivity(Lock $lock, bool $online): void
    {
        if (! $online) {
            $this->recordError($lock, 'The lock reported that it is offline.', LockConnectionStatus::Disconnected);

            return;
        }

        $lock->forceFill(['connection_status' => LockConnectionStatus::Connected, 'last_communication_at' => now()])->save();
    }

    /**
     * Records a failure for the lock. A null status leaves the lock's connection status as it is.
     */
    public function recordError(Lock $lock, string $message, ?LockConnectionStatus $status = LockConnectionStatus::Degraded): void
    {
        $lock->forceFill([
            'last_error' => mb_substr($message, 0, self::ERROR_TEXT_MAX),
            'last_error_at' => now(),
            ...($status === null ? [] : ['connection_status' => $status]),
        ])->save();
    }
}
