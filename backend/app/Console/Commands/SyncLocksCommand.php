<?php

namespace App\Console\Commands;

use App\Enums\AuditOutcome;
use App\Models\Lock;
use App\Models\LockStateEvent;
use App\Models\Property;
use App\Services\Audit\AuditLogger;
use App\Services\Locks\Integration\EufyBridgeDriver;
use App\Services\Locks\Integration\IntegrationUnavailable;
use App\Services\Locks\Integration\LockDriver;
use App\Services\Locks\LockStateRecorder;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Reads every Eufy lock the bridge can see. Registered locks get their model, firmware and current
 * reported state refreshed. Unregistered ones are listed, and registered with --register, always with
 * commands disabled. Never sends a lock command.
 */
#[Signature('lockguard:sync-locks {--register : Register Eufy locks that LockGuard does not know yet (commands stay disabled)} {--property= : Property ID for newly registered locks}')]
#[Description('Refresh lock details and reported state from the Eufy bridge (scheduled every five minutes; never sends commands)')]
class SyncLocksCommand extends Command
{
    public function handle(LockDriver $driver, LockStateRecorder $recorder, AuditLogger $audit): int
    {
        if (! $driver instanceof EufyBridgeDriver) {
            $this->components->info('The Eufy bridge is not the configured lock driver (LOCKGUARD_LOCK_DRIVER). Nothing to sync.');

            return self::SUCCESS;
        }

        $property = null;
        if ($this->option('register')) {
            $property = Property::query()->find($this->option('property'));
            if ($property === null) {
                $this->components->error('--register needs --property=<id> of an existing property.');

                return self::FAILURE;
            }
        }

        try {
            $devices = $driver->listLocks();
        } catch (IntegrationUnavailable $exception) {
            Lock::query()->where('vendor', 'eufy')->each(fn (Lock $lock) => $recorder->recordError($lock, $exception->getMessage()));
            $this->components->error('Eufy bridge unavailable: '.$exception->getMessage());

            return self::FAILURE;
        }

        $rows = [];
        foreach ($devices as $device) {
            $lock = Lock::query()->where('vendor', 'eufy')->where('external_id', $device['external_id'])->first();

            if ($lock === null && $property !== null) {
                $lock = $this->register($property, $device, $audit);
            }

            if ($lock === null) {
                $rows[] = [$device['name'] ?? '?', $device['model'] ?? '?', 'not registered', '-'];

                continue;
            }

            $lock->forceFill(array_filter([
                'model' => $device['model'] ?? null,
                'firmware_version' => $device['firmware_version'] ?? null,
            ]))->save();

            try {
                $state = $recorder->record($lock, $driver->readState($lock), LockStateEvent::SOURCE_POLL)->state->value;
            } catch (IntegrationUnavailable $exception) {
                $recorder->recordError($lock, $exception->getMessage());
                $state = 'read failed';
            }

            $rows[] = [$lock->name, $lock->model ?? '?', $lock->commands_enabled ? 'registered' : 'registered (commands off)', $state];
        }

        $this->table(['Lock', 'Model', 'LockGuard', 'Reported state'], $rows);

        return self::SUCCESS;
    }

    /**
     * @param  array{external_id: string, name: ?string, model: ?string, firmware_version: ?string}  $device
     */
    private function register(Property $property, array $device, AuditLogger $audit): Lock
    {
        return DB::transaction(function () use ($property, $device, $audit): Lock {
            $lock = Lock::query()->create([
                'property_id' => $property->id,
                'name' => mb_substr($device['name'] ?? 'Eufy lock', 0, 120),
                'vendor' => 'eufy',
                'model' => $device['model'] ?? null,
                'external_id' => $device['external_id'],
                'firmware_version' => $device['firmware_version'] ?? null,
                'registration_status' => Lock::REGISTRATION_ACTIVE,
                'commands_enabled' => false,
            ]);

            $audit->record('lock.registered', AuditOutcome::Success, targets: ['lock' => $lock->id], reason: 'Registered from the Eufy bridge by lockguard:sync-locks. Commands are disabled until an administrator enables them.', metadata: [
                'channel' => 'console',
            ]);

            return $lock;
        });
    }
}
