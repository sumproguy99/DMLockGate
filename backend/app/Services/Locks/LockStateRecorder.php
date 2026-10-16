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

            // Only a newer observation replaces the cached state, so a late push cannot overwrite a fresher read.
            if ($locked->last_state_observed_at === null || $reported->observedAt->gte($locked->last_state_observed_at)) {
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

    public function recordError(Lock $lock, string $message, LockConnectionStatus $status = LockConnectionStatus::Degraded): void
    {
        $lock->forceFill([
            'last_error' => mb_substr($message, 0, 255),
            'last_error_at' => now(),
            'connection_status' => $status,
        ])->save();
    }
}
