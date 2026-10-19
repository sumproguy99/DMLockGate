<?php

namespace App\Services\System;

use App\Models\Lock;
use App\Models\LockStateEvent;
use App\Services\Audit\AuditIntegrity;
use App\Services\Locks\Integration\EufyBridgeDriver;
use App\Services\Locks\Integration\FakeLockDriver;
use App\Services\Locks\Integration\IntegrationUnavailable;
use App\Services\Locks\Integration\LockDriver;
use App\Services\Locks\LockStateRecorder;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * What LockGuard can honestly say about its own subsystems. Every status is measured from something
 * real (a query, the bridge's reply, the age of the last record); anything that cannot be measured
 * is "unknown", and anything not built yet is "not_implemented".
 *
 * Subsystem status: ok | warning | down | unknown | not_implemented.
 */
class SystemHealth
{
    /** The scheduler syncs lock state every five minutes; three missed runs is a warning. */
    public const SYNC_STALE_AFTER_MINUTES = 15;

    /** A database-queue job still waiting after this long means no worker is taking jobs. */
    public const QUEUE_STALE_AFTER_SECONDS = 120;

    /** The bridge is asked at most this often, however many dashboards are open. */
    public const BRIDGE_CACHE_SECONDS = 15;

    /** This many lock commands in a row that did not reach a lock marks the integration degraded. */
    public const COMMAND_FAILURES_DEGRADED = 2;

    public function __construct(
        private readonly LockDriver $driver,
        private readonly AuditIntegrity $audit,
    ) {}

    /**
     * The Eufy integration as LockGuard sees it.
     *
     * status: connected | degraded | needs_login | starting | unreachable | not_configured | simulated | unknown
     *
     * @return array{status: string, degraded_reason?: ?string, checked_at: string, last_sync_at: ?string, details: array<string, mixed>}
     */
    public function integration(): array
    {
        $lastSyncAt = LockStateEvent::query()->where('source', LockStateEvent::SOURCE_POLL)->max('observed_at');
        $base = ['last_sync_at' => $lastSyncAt === null ? null : CarbonImmutable::parse($lastSyncAt)->toIso8601ZuluString('millisecond')];

        if ($this->driver instanceof FakeLockDriver) {
            return [...$base, 'status' => 'simulated', 'checked_at' => $this->now(), 'details' => []];
        }
        if (! $this->driver instanceof EufyBridgeDriver) {
            return [...$base, 'status' => 'not_configured', 'checked_at' => $this->now(), 'details' => []];
        }

        $bridge = Cache::remember('lockguard.bridge_health', self::BRIDGE_CACHE_SECONDS, function (): array {
            try {
                return ['reply' => $this->driver->health(), 'error' => null, 'checked_at' => $this->now()];
            } catch (IntegrationUnavailable $exception) {
                return ['reply' => null, 'error' => $exception->getMessage(), 'checked_at' => $this->now()];
            }
        });

        if ($bridge['reply'] === null) {
            return [...$base, 'status' => 'unreachable', 'checked_at' => $bridge['checked_at'], 'details' => ['error' => $bridge['error']]];
        }

        $reply = $bridge['reply'];
        $status = in_array($reply['status'] ?? null, ['connected', 'degraded', 'needs_login', 'starting'], true) ? $reply['status'] : 'unknown';
        $commands = is_array($reply['commands'] ?? null) ? $reply['commands'] : [];
        $commandFailures = is_int($commands['consecutive_failures'] ?? null) ? $commands['consecutive_failures'] : null;
        $degradedReason = $reply['degraded_reason'] ?? null;

        // The cloud can answer state reads while commands fail to reach the locks; say so.
        if ($status === 'connected' && $commandFailures !== null && $commandFailures >= self::COMMAND_FAILURES_DEGRADED) {
            $status = 'degraded';
            $degradedReason = 'commands_failing';
        }

        return [...$base, 'status' => $status, 'degraded_reason' => $degradedReason, 'checked_at' => $bridge['checked_at'], 'details' => [
            'degraded_reason' => $degradedReason,
            'command_failures' => $commandFailures,
            'last_command_failure' => self::errorText($commands['last_failure'] ?? null),
            'last_command_failure_at' => is_string($commands['last_failure_at'] ?? null) ? $commands['last_failure_at'] : null,
            'last_command_success_at' => is_string($commands['last_success_at'] ?? null) ? $commands['last_success_at'] : null,
            'locks_visible' => is_int($reply['locks'] ?? null) ? $reply['locks'] : null,
            'bridge_last_sync_at' => $reply['last_sync_at'] ?? null,
            'cloud_ok_at' => $reply['cloud_ok_at'] ?? null,
            'cloud_failures' => is_int($reply['cloud_failures'] ?? null) ? $reply['cloud_failures'] : null,
            'cloud_last_error' => self::errorText($reply['cloud_last_error'] ?? null),
            'last_error' => self::errorText($reply['last_error'] ?? null),
            'last_error_at' => is_array($reply['last_error'] ?? null) && is_string($reply['last_error']['at'] ?? null) ? $reply['last_error']['at'] : null,
        ]];
    }

    /**
     * The bridge reports errors either as text or as {message, at}. Clients always get text.
     */
    private static function errorText(mixed $error): ?string
    {
        return match (true) {
            is_string($error) => mb_substr($error, 0, LockStateRecorder::ERROR_TEXT_MAX),
            is_array($error) && is_string($error['message'] ?? null) => mb_substr($error['message'], 0, LockStateRecorder::ERROR_TEXT_MAX),
            $error === null => null,
            default => 'Unrecognized error report from the bridge.',
        };
    }

    /**
     * Every subsystem, in display order.
     *
     * @param  array{status: string, degraded_reason?: ?string, last_sync_at: ?string}  $integration  The result of {@see integration()}.
     * @return list<array{key: string, status: string, summary: string}>
     */
    public function subsystems(array $integration): array
    {
        return [
            ['key' => 'application', 'status' => 'ok', 'summary' => 'Answering requests.'],
            $this->database(),
            $this->queue(),
            $this->stateSync($integration),
            $this->eufy($integration['status'], $integration['degraded_reason'] ?? null),
            $this->auditTrail(),
            ['key' => 'notifications', 'status' => 'not_implemented', 'summary' => 'Notifications are not built yet.'],
            ['key' => 'live_updates', 'status' => 'not_implemented', 'summary' => 'Live updates are not built yet. Screens refresh on a timer instead.'],
        ];
    }

    /**
     * @return array{key: string, status: string, summary: string}
     */
    private function database(): array
    {
        try {
            DB::select('select 1');

            return ['key' => 'database', 'status' => 'ok', 'summary' => 'Connected.'];
        } catch (Throwable) {
            return ['key' => 'database', 'status' => 'down', 'summary' => 'The database did not answer.'];
        }
    }

    /**
     * @return array{key: string, status: string, summary: string}
     */
    private function queue(): array
    {
        $connection = (string) config('queue.default');
        if ($connection === 'sync') {
            return ['key' => 'queue', 'status' => 'ok', 'summary' => 'Jobs run immediately, without a worker.'];
        }
        if (config("queue.connections.{$connection}.driver") !== 'database') {
            return ['key' => 'queue', 'status' => 'unknown', 'summary' => "LockGuard cannot inspect the {$connection} queue."];
        }

        $table = (string) config("queue.connections.{$connection}.table", 'jobs');
        $waiting = DB::table($table)
            ->whereNull('reserved_at')
            ->where('available_at', '<', now()->subSeconds(self::QUEUE_STALE_AFTER_SECONDS)->getTimestamp())
            ->count();
        if ($waiting > 0) {
            return ['key' => 'queue', 'status' => 'warning', 'summary' => "{$waiting} job(s) waiting more than two minutes. The queue worker may not be running."];
        }

        $failed = DB::table((string) config('queue.failed.table', 'failed_jobs'))->where('failed_at', '>=', now()->subDay())->count();
        if ($failed > 0) {
            return ['key' => 'queue', 'status' => 'warning', 'summary' => "{$failed} job(s) failed in the last 24 hours."];
        }

        return ['key' => 'queue', 'status' => 'ok', 'summary' => 'No jobs are stuck waiting.'];
    }

    /**
     * @param  array{status: string, last_sync_at: ?string}  $integration
     * @return array{key: string, status: string, summary: string}
     */
    private function stateSync(array $integration): array
    {
        if (in_array($integration['status'], ['not_configured', 'simulated'], true)) {
            return ['key' => 'state_sync', 'status' => 'not_implemented', 'summary' => 'No lock integration is configured, so nothing is synchronized.'];
        }
        if (! Lock::query()->where('vendor', 'eufy')->exists()) {
            return ['key' => 'state_sync', 'status' => 'unknown', 'summary' => 'No Eufy locks are registered yet.'];
        }
        if ($integration['last_sync_at'] === null) {
            return ['key' => 'state_sync', 'status' => 'unknown', 'summary' => 'No scheduled state sync has been recorded yet.'];
        }

        return CarbonImmutable::parse($integration['last_sync_at'])->lt(now()->subMinutes(self::SYNC_STALE_AFTER_MINUTES))
            ? ['key' => 'state_sync', 'status' => 'warning', 'summary' => 'No successful state sync in the last '.self::SYNC_STALE_AFTER_MINUTES.' minutes. Check the scheduler and the Eufy bridge.']
            : ['key' => 'state_sync', 'status' => 'ok', 'summary' => 'Lock state synchronized within the last '.self::SYNC_STALE_AFTER_MINUTES.' minutes.'];
    }

    /**
     * @return array{key: string, status: string, summary: string}
     */
    private function eufy(string $status, ?string $degradedReason = null): array
    {
        [$level, $summary] = match (true) {
            $status === 'degraded' && $degradedReason === 'commands_failing' => ['warning', 'Recent lock commands did not reach the locks. Check the bridge log.'],
            default => match ($status) {
                'connected' => ['ok', 'The Eufy bridge is signed in to Eufy.'],
                'degraded' => ['warning', 'The Eufy cloud is failing or silent. Commands are refused until it recovers.'],
                'needs_login' => ['down', 'The Eufy bridge needs its Eufy account signed in again.'],
                'starting' => ['warning', 'The Eufy bridge is starting.'],
                'unreachable' => ['down', 'The Eufy bridge is not answering.'],
                'not_configured' => ['not_implemented', 'No lock integration is configured.'],
                'simulated' => ['warning', 'Simulated locks: no real lock is connected.'],
                default => ['unknown', 'The Eufy bridge gave an unrecognized status.'],
            },
        };

        return ['key' => 'eufy', 'status' => $level, 'summary' => $summary];
    }

    /**
     * @return array{key: string, status: string, summary: string}
     */
    private function auditTrail(): array
    {
        if (! $this->audit->triggersInstalled()) {
            return ['key' => 'audit', 'status' => 'down', 'summary' => 'Append-only protection is missing: the database would allow audit records to be changed.'];
        }

        return ['key' => 'audit', 'status' => 'ok', 'summary' => 'Protected against changes. Run lockguard:audit-verify to check the hash chain.'];
    }

    private function now(): string
    {
        return now()->toIso8601ZuluString('millisecond');
    }
}
