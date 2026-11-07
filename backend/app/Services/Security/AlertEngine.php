<?php

namespace App\Services\Security;

use App\Enums\AlertRule;
use App\Enums\AlertSeverity;
use App\Enums\AlertStatus;
use App\Enums\AuditOutcome;
use App\Enums\IncidentStatus;
use App\Enums\LockConnectionStatus;
use App\Enums\PermissionKey;
use App\Enums\ReportedLockState;
use App\Models\AuditLog;
use App\Models\Lock;
use App\Models\Role;
use App\Models\SecurityAlert;
use App\Models\SecurityIncident;
use App\Models\SecurityIncidentEvent;
use App\Models\User;
use App\Services\Audit\AuditIntegrity;
use App\Services\Audit\AuditLogger;
use App\Services\System\SystemHealth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * The alert engine (project.md section 18).
 *
 * Event rules: {@see AuditLogger} hands every committed audit record to observe(), which counts
 * related records in the rule's window. Condition rules: checkConditions(), run every minute by
 * `lockguard:check-alerts`, looks at the locks, the integration and the audit trail, and resolves
 * condition alerts whose cause has gone.
 *
 * Storm control: one active alert per fingerprint (repeats add to it), a problem that recurs soon
 * after resolving reopens its alert silently, and {@see AlertNotifier} caps notifications per person.
 * Correlation: High and Critical alerts open an incident, or join the open incident about the same
 * lock, account or subsystem.
 *
 * Location anomalies are deliberately not alerts: a phone's position is not proof of anything.
 */
class AlertEngine
{
    /** Audit actions that count as a failed sign-in when their outcome is failure or denied. */
    public const SIGN_IN_ACTIONS = ['auth.login', 'auth.mfa_verify', 'auth.step_up'];

    /** Audit actions that mean a command did not do what was asked. Expired requests were never sent. */
    public const COMMAND_FAILURE_ACTIONS = ['lock.command_failed', 'lock.command_unconfirmed'];

    /** Set when the integration's state could not be judged this run, so its alert is left as it is. */
    private bool $integrationUnmeasured = false;

    public function __construct(
        private readonly AlertNotifier $notifier,
        private readonly SystemHealth $health,
        private readonly AuditIntegrity $integrity,
    ) {}

    /**
     * Whether an audit action can trigger an event rule, so AuditLogger can skip the rest cheaply.
     */
    public static function watches(string $action): bool
    {
        return in_array($action, [
            ...self::SIGN_IN_ACTIONS,
            ...self::COMMAND_FAILURE_ACTIONS,
            'lock.command_denied',
            'user.roles_changed',
            'user.permissions_changed',
            'auth.mfa_disabled',
            'auth.mfa_recovery_code_used',
            'device.new_sign_in',
            'device.revoked_access_attempt',
            'device.reported_lost',
        ], true);
    }

    public function observe(AuditLog $record): void
    {
        $failed = in_array($record->outcome, [AuditOutcome::Failure, AuditOutcome::Denied], true);

        match (true) {
            $failed && in_array($record->action, self::SIGN_IN_ACTIONS, true) => $this->failedSignIn($record),
            $failed && $record->action === 'lock.command_denied' => $this->deniedLockRequest($record),
            $failed && in_array($record->action, self::COMMAND_FAILURE_ACTIONS, true) => $this->commandFailure($record),
            $record->action === 'user.roles_changed' || $record->action === 'user.permissions_changed' => $this->permissionChange($record),
            $record->action === 'auth.mfa_disabled' => $this->accountEvent($record, AlertRule::MfaDisabled, AlertSeverity::Medium, 'turned off two-step sign-in', 'The account now signs in with a password alone. Check that the owner did this.'),
            $record->action === 'device.new_sign_in' => $this->deviceEvent($record, AlertRule::NewDeviceSignIn, AlertSeverity::Low, 'signed in on a new device', 'A browser or phone that has not been used with this account before. If the owner does not recognize it, revoke it and change the password.'),
            $record->action === 'device.revoked_access_attempt' => $this->deviceEvent($record, AlertRule::RevokedDeviceAccess, AlertSeverity::High, 'tried to use a revoked device', 'A device that was removed from this account tried to sign in or make a request, and was refused. Find out who has the device.'),
            $record->action === 'device.reported_lost' => $this->deviceEvent($record, AlertRule::DeviceLost, AlertSeverity::High, 'has a device reported lost', 'The device was revoked and the account was signed out everywhere. Check the account\'s recent activity, and help the owner sign in again on a replacement.'),
            $record->action === 'auth.mfa_recovery_code_used' => $this->accountEvent($record, AlertRule::RecoveryCodeUsed, AlertSeverity::Low, 'used a recovery code', 'A one-time recovery code was used instead of the authenticator app. If the owner has lost their phone, help them set up two-step sign-in again.'),
            default => null,
        };
    }

    /**
     * Evaluate every condition rule and resolve condition alerts whose cause has cleared. Also
     * resolves event alerts that have gone quiet.
     *
     * @return array{raised: int, resolved: int}
     */
    public function checkConditions(): array
    {
        $current = [];
        $raised = 0;
        $keep = function (?SecurityAlert $alert) use (&$current, &$raised): void {
            if ($alert !== null) {
                $current[] = $alert->fingerprint;
                $raised++;
            }
        };

        $keep($this->integrationCondition());
        $keep($this->auditProtectionCondition());
        $keep($this->auditWriteFailure());
        Lock::query()->where('registration_status', Lock::REGISTRATION_ACTIVE)->each(function (Lock $lock) use ($keep): void {
            foreach ($this->lockConditions($lock) as $alert) {
                $keep($alert);
            }
        });

        $resolved = 0;
        SecurityAlert::query()->active()
            ->whereIn('rule', array_values(array_filter(AlertRule::cases(), fn (AlertRule $rule): bool => $rule->isCondition())))
            ->whereNotIn('fingerprint', $current)
            ->each(function (SecurityAlert $alert) use (&$resolved): void {
                // The integration is only judged when it can be measured; see integrationCondition().
                if ($alert->rule === AlertRule::IntegrationUnavailable && $this->integrationUnmeasured) {
                    return;
                }
                $this->resolveAutomatically($alert, SecurityAlert::RESOLUTION_CLEARED);
                $resolved++;
            });

        SecurityAlert::query()->active()
            ->whereIn('rule', array_values(array_filter(AlertRule::cases(), fn (AlertRule $rule): bool => ! $rule->isCondition())))
            ->where('last_seen_at', '<', now()->subHours((int) config('lockguard.alerts.quiet_hours')))
            ->each(function (SecurityAlert $alert) use (&$resolved): void {
                $this->resolveAutomatically($alert, SecurityAlert::RESOLUTION_QUIET);
                $resolved++;
            });

        return ['raised' => $raised, 'resolved' => $resolved];
    }

    /**
     * Raise an alert, or add to the active one with the same fingerprint.
     *
     * @param  array{user?: ?int, lock?: ?int, ip?: ?string, event_id?: ?string, context?: array<string, mixed>, occurrences?: int}  $about
     */
    public function raise(AlertRule $rule, string $fingerprint, AlertSeverity $severity, string $title, string $description, array $about = []): SecurityAlert
    {
        [$alert, $notify] = DB::transaction(function () use ($rule, $fingerprint, $severity, $title, $description, $about): array {
            $now = now();
            $details = [
                'title' => Str::limit($title, 157),
                'description' => $description,
                'last_seen_at' => $now,
                'last_event_id' => $about['event_id'] ?? null,
                'context' => ($about['context'] ?? []) === [] ? null : $about['context'],
            ];

            $active = SecurityAlert::query()->active()->where('fingerprint', $fingerprint)->lockForUpdate()->first();
            if ($active !== null) {
                $escalated = $severity->rank() > $active->severity->rank();
                $active->fill([
                    ...$details,
                    // A condition alert shows the condition as it is now; an event alert keeps its worst.
                    'severity' => $rule->isCondition() ? $severity : AlertSeverity::max($severity, $active->severity),
                    // A condition is still the same occurrence each time it is checked.
                    'occurrences' => $rule->isCondition() ? $active->occurrences : $active->occurrences + 1,
                    'last_event_id' => $details['last_event_id'] ?? $active->last_event_id,
                ])->save();

                return [$active, $escalated];
            }

            $recent = SecurityAlert::query()
                ->where('fingerprint', $fingerprint)
                ->where('status', AlertStatus::Resolved)
                ->where('resolved_at', '>=', $now->copy()->subMinutes((int) config('lockguard.alerts.reopen_minutes')))
                ->latest('resolved_at')
                ->lockForUpdate()
                ->first();
            if ($recent !== null) {
                $recent->fill([
                    ...$details,
                    'severity' => AlertSeverity::max($severity, $recent->severity),
                    'status' => AlertStatus::Open,
                    'occurrences' => $recent->occurrences + 1,
                    'acknowledged_by' => null,
                    'acknowledged_at' => null,
                    'resolved_by' => null,
                    'resolved_at' => null,
                    'resolution' => null,
                    'resolution_note' => null,
                ])->save();

                return [$recent, false];
            }

            $alert = SecurityAlert::query()->create([
                ...$details,
                'public_id' => (string) Str::uuid(),
                'rule' => $rule,
                'fingerprint' => $fingerprint,
                'severity' => $severity,
                'status' => AlertStatus::Open,
                'subject_user_id' => $about['user'] ?? null,
                'subject_lock_id' => $about['lock'] ?? null,
                'subject_ip' => $about['ip'] ?? null,
                'occurrences' => max(1, $about['occurrences'] ?? 1),
                'first_seen_at' => $now,
            ]);

            return [$alert, true];
        });

        // A serious alert belongs to an active incident; one whose incident was closed starts a new one.
        if ($alert->severity->atLeast(AlertSeverity::High) && ! ($alert->incident?->status->isActive() ?? false)) {
            $this->correlate($alert);
        }
        if ($notify) {
            $this->notifier->notify($alert);
        }

        return $alert;
    }

    /**
     * Open an incident for a serious alert, or add it to the active incident about the same subject.
     */
    private function correlate(SecurityAlert $alert): void
    {
        DB::transaction(function () use ($alert): void {
            $subjectKey = self::subjectKey($alert);
            $incident = SecurityIncident::query()
                ->where('subject_key', $subjectKey)
                ->whereIn('status', IncidentStatus::active())
                ->latest('opened_at')
                ->lockForUpdate()
                ->first();

            if ($incident === null) {
                $incident = SecurityIncident::query()->create([
                    'public_id' => (string) Str::uuid(),
                    'title' => $alert->title,
                    'description' => $alert->description,
                    'severity' => $alert->severity,
                    'status' => IncidentStatus::New,
                    'subject_key' => $subjectKey,
                    'opened_at' => now(),
                ]);
                $this->history($incident, null, IncidentStatus::New, 'Opened by the alert engine for: '.$alert->title);
            } else {
                if ($alert->severity->rank() > $incident->severity->rank()) {
                    $incident->update(['severity' => $alert->severity]);
                }
                $this->history($incident, null, null, 'Related alert added: '.$alert->title);
            }

            $alert->update(['security_incident_id' => $incident->id]);
        });
    }

    /**
     * Groups alerts about the same thing: an account, a lock, a source address or a subsystem.
     */
    public static function subjectKey(SecurityAlert $alert): string
    {
        return match (true) {
            $alert->subject_lock_id !== null => 'lock:'.$alert->subject_lock_id,
            $alert->subject_user_id !== null => 'user:'.$alert->subject_user_id,
            $alert->subject_ip !== null => 'ip:'.$alert->subject_ip,
            default => $alert->rule->value,
        };
    }

    public function history(SecurityIncident $incident, ?IncidentStatus $from, ?IncidentStatus $to, ?string $note, ?User $actor = null): SecurityIncidentEvent
    {
        return SecurityIncidentEvent::query()->create([
            'security_incident_id' => $incident->id,
            'actor_user_id' => $actor?->id,
            'from_status' => $from,
            'to_status' => $to,
            'note' => $note,
            'occurred_at' => now(),
        ]);
    }

    private function resolveAutomatically(SecurityAlert $alert, string $resolution): void
    {
        $alert->update(['status' => AlertStatus::Resolved, 'resolved_at' => now(), 'resolution' => $resolution]);
    }

    private function failedSignIn(AuditLog $record): void
    {
        $since = now()->subMinutes((int) config('lockguard.alerts.failed_sign_ins.window_minutes'));
        $query = AuditLog::query()
            ->whereIn('action', self::SIGN_IN_ACTIONS)
            ->whereIn('outcome', [AuditOutcome::Failure, AuditOutcome::Denied])
            ->where('occurred_at', '>=', $since->format('Y-m-d H:i:s.u'));

        if ($record->target_user_id !== null) {
            $query->where('target_user_id', $record->target_user_id);
            $user = User::query()->find($record->target_user_id);
            [$fingerprint, $who] = ['failed_sign_ins:user:'.$record->target_user_id, $user?->name ?? 'an account'];
        } elseif ($record->ip_address !== null) {
            $query->whereNull('target_user_id')->where('ip_address', $record->ip_address);
            [$fingerprint, $who] = ['failed_sign_ins:ip:'.$record->ip_address, 'unknown accounts from '.$record->ip_address];
        } else {
            return;
        }

        $count = $query->count();
        if ($count < (int) config('lockguard.alerts.failed_sign_ins.threshold')) {
            return;
        }

        $this->raise(AlertRule::FailedSignIns, $fingerprint, AlertSeverity::High, "Repeated failed sign-ins for {$who}", sprintf(
            '%d failed sign-in or identity checks in the last %d minutes. The latest: %s',
            $count,
            (int) config('lockguard.alerts.failed_sign_ins.window_minutes'),
            $record->reason ?? 'no reason recorded.',
        ), [
            'user' => $record->target_user_id,
            'ip' => $record->ip_address,
            'event_id' => $record->event_id,
            'occurrences' => $count,
            'context' => ['ip_address' => $record->ip_address],
        ]);
    }

    private function deniedLockRequest(AuditLog $record): void
    {
        if ($record->target_user_id === null) {
            return;
        }

        $minutes = (int) config('lockguard.alerts.denied_lock_requests.window_minutes');
        $count = AuditLog::query()
            ->where('action', 'lock.command_denied')
            ->where('target_user_id', $record->target_user_id)
            ->where('occurred_at', '>=', now()->subMinutes($minutes)->format('Y-m-d H:i:s.u'))
            ->count();
        if ($count < (int) config('lockguard.alerts.denied_lock_requests.threshold')) {
            return;
        }

        $name = User::query()->whereKey($record->target_user_id)->value('name') ?? 'Someone';
        $this->raise(AlertRule::DeniedLockRequests, 'denied_lock_requests:user:'.$record->target_user_id, AlertSeverity::Medium, "Repeated denied lock requests by {$name}", sprintf(
            '%d lock requests were refused in the last %d minutes. The latest: %s',
            $count,
            $minutes,
            $record->reason ?? 'no reason recorded.',
        ), ['user' => $record->target_user_id, 'event_id' => $record->event_id, 'occurrences' => $count]);
    }

    private function commandFailure(AuditLog $record): void
    {
        if ($record->target_lock_id === null) {
            return;
        }
        $lockName = Lock::query()->whereKey($record->target_lock_id)->value('name') ?? 'A lock';

        if ($record->action === 'lock.command_unconfirmed') {
            $this->raise(AlertRule::LockOutcomeUnknown, 'lock_outcome_unknown:lock:'.$record->target_lock_id, AlertSeverity::Medium, "{$lockName}: command outcome unknown", 'A lock command was sent but the lock never confirmed the result, so the door may or may not have moved. Check the door before relying on it. LockGuard never resends a command by itself.', [
                'lock' => $record->target_lock_id,
                'event_id' => $record->event_id,
            ]);
        }

        $minutes = (int) config('lockguard.alerts.lock_command_failures.window_minutes');
        $count = AuditLog::query()
            ->whereIn('action', self::COMMAND_FAILURE_ACTIONS)
            ->where('target_lock_id', $record->target_lock_id)
            ->where('occurred_at', '>=', now()->subMinutes($minutes)->format('Y-m-d H:i:s.u'))
            ->count();
        if ($count < (int) config('lockguard.alerts.lock_command_failures.threshold')) {
            return;
        }

        $this->raise(AlertRule::LockCommandFailures, 'lock_command_failures:lock:'.$record->target_lock_id, AlertSeverity::High, "{$lockName}: repeated command failures", sprintf(
            '%d commands to this lock failed or went unconfirmed in the last %d minutes. Check the lock, its batteries and the Eufy bridge. The latest: %s',
            $count,
            $minutes,
            $record->reason ?? 'no reason recorded.',
        ), ['lock' => $record->target_lock_id, 'event_id' => $record->event_id, 'occurrences' => $count]);
    }

    /**
     * A role or individual permission that grants an administrative or sensitive permission was
     * given to someone. Ordinary door access is not reported.
     */
    private function permissionChange(AuditLog $record): void
    {
        if ($record->target_user_id === null || $record->outcome !== AuditOutcome::Success) {
            return;
        }
        $metadata = $record->metadata ?? [];

        $granted = $record->action === 'user.roles_changed'
            ? Role::query()->with('permissions')->whereIn('key', (array) ($metadata['added'] ?? []))->get()
                ->flatMap(fn (Role $role) => $role->permissions->pluck('key'))
                ->map(fn ($key) => $key instanceof PermissionKey ? $key : PermissionKey::tryFrom((string) $key))
                ->filter()
                ->all()
            : array_filter(array_map(
                fn (string $key): ?PermissionKey => PermissionKey::tryFrom($key),
                array_keys(array_filter(
                    (array) ($metadata['after'] ?? []),
                    fn (string $effect, string $key): bool => $effect === 'allow' && (($metadata['before'][$key] ?? null) !== 'allow'),
                    ARRAY_FILTER_USE_BOTH,
                )),
            ));

        $notable = array_values(array_unique(array_map(
            fn (PermissionKey $key): string => $key->label(),
            array_filter($granted, fn (PermissionKey $key): bool => ! $key->isDoorAccess() && ($key->isSensitive() || $key->group() === 'admin')),
        )));
        if ($notable === []) {
            return;
        }

        $target = User::query()->whereKey($record->target_user_id)->value('name') ?? 'A user';
        $actor = $record->actor_user_id === null ? 'the server console' : (User::query()->whereKey($record->actor_user_id)->value('name') ?? 'an administrator');
        $this->raise(AlertRule::AdminPermissionChange, 'admin_permission_change:user:'.$record->target_user_id, AlertSeverity::Medium, "{$target} was given administrative permissions", "Granted by {$actor}: ".implode(', ', $notable).'. Check that this was intended.', [
            'user' => $record->target_user_id,
            'event_id' => $record->event_id,
            'context' => ['permissions' => $notable, 'by_user_id' => $record->actor_user_id],
        ]);
    }

    private function accountEvent(AuditLog $record, AlertRule $rule, AlertSeverity $severity, string $what, string $description): void
    {
        $userId = $record->target_user_id ?? $record->actor_user_id;
        if ($userId === null) {
            return;
        }
        $name = User::query()->whereKey($userId)->value('name') ?? 'A user';

        $this->raise($rule, $rule->value.':user:'.$userId, $severity, "{$name} {$what}", $description, ['user' => $userId, 'event_id' => $record->event_id]);
    }

    /**
     * One alert per device. The device's name goes in the title and context, so its owner can tell
     * which one it was.
     */
    private function deviceEvent(AuditLog $record, AlertRule $rule, AlertSeverity $severity, string $what, string $description): void
    {
        if ($record->target_user_id === null || $record->target_device_id === null) {
            return;
        }
        $name = User::query()->whereKey($record->target_user_id)->value('name') ?? 'A user';
        $device = $record->metadata['device'] ?? 'a device';

        $this->raise($rule, $rule->value.':device:'.$record->target_device_id, $severity, "{$name} {$what}: {$device}", $description, [
            'user' => $record->target_user_id,
            'ip' => $record->ip_address,
            'event_id' => $record->event_id,
            'context' => ['device' => $device, 'device_id' => $record->target_device_id, 'ip_address' => $record->ip_address],
        ]);
    }

    private function integrationCondition(): ?SecurityAlert
    {
        $integration = $this->health->integration();
        $status = $integration['status'];
        $this->integrationUnmeasured = in_array($status, ['starting', 'unknown'], true);

        $severity = match ($status) {
            'unreachable', 'needs_login' => AlertSeverity::Critical,
            'degraded' => AlertSeverity::High,
            default => null,
        };
        if ($severity === null) {
            return null;
        }

        $description = match ($status) {
            'unreachable' => 'LockGuard cannot reach the Eufy bridge, so lock state is not updating and commands cannot be sent. Check that the bridge is running.',
            'needs_login' => 'The Eufy bridge needs to sign in to Eufy again. Until it does, lock state is not updating and commands cannot be sent.',
            default => ($integration['degraded_reason'] ?? null) === 'commands_failing'
                ? 'The Eufy cloud answers, but recent commands did not reach the locks.'
                : 'The Eufy bridge reports a problem with its connection to Eufy.',
        };

        return $this->raise(AlertRule::IntegrationUnavailable, AlertRule::IntegrationUnavailable->value, $severity, 'Lock integration '.str_replace('_', ' ', $status), $description, [
            'context' => ['status' => $status, 'error' => $integration['details']['error'] ?? null],
        ]);
    }

    private function auditProtectionCondition(): ?SecurityAlert
    {
        if ($this->integrity->triggersInstalled()) {
            return null;
        }

        return $this->raise(AlertRule::AuditProtectionMissing, AlertRule::AuditProtectionMissing->value, AlertSeverity::Critical, 'Audit records are not protected', 'The database triggers that stop audit records being changed or deleted are missing. Run the migrations again and then lockguard:audit-verify.');
    }

    /**
     * Picks up a failed audit write noted by AuditLogger. Not a condition: it stays until resolved.
     */
    private function auditWriteFailure(): ?SecurityAlert
    {
        $path = self::auditFailureFlagPath();
        if (! is_file($path)) {
            return null;
        }
        $note = json_decode((string) file_get_contents($path), true) ?: [];
        @unlink($path);

        $this->raise(AlertRule::AuditWriteFailure, AlertRule::AuditWriteFailure->value, AlertSeverity::Critical, 'Audit records could not be written', sprintf(
            'Writing the audit record for %s failed at %s, so that operation was refused. Check the database and the application log.',
            $note['action'] ?? 'an operation',
            $note['at'] ?? 'an unknown time',
        ), ['context' => $note]);

        return null;
    }

    /**
     * Where AuditLogger leaves word of a failed audit write, outside the database transaction it was
     * in. Named per environment so a test run cannot raise an alert in the real installation.
     */
    public static function auditFailureFlagPath(): string
    {
        return storage_path('app/lockguard-audit-write-failure-'.app()->environment().'.json');
    }

    /**
     * Noted from AuditLogger's failure path, which may be inside a transaction about to roll back.
     */
    public static function noteAuditWriteFailure(string $action, Throwable $exception): void
    {
        $path = self::auditFailureFlagPath();
        @mkdir(dirname($path), 0755, true);
        @file_put_contents($path, json_encode([
            'action' => $action,
            'at' => now()->toIso8601ZuluString(),
            'error' => Str::limit($exception->getPrevious()?->getMessage() ?? $exception->getMessage(), 300),
        ]));
    }

    /**
     * @return list<SecurityAlert>
     */
    private function lockConditions(Lock $lock): array
    {
        $alerts = [];
        $about = ['lock' => $lock->id];

        if ($lock->connection_status === LockConnectionStatus::Disconnected) {
            $alerts[] = $this->raise(AlertRule::LockOffline, 'lock_offline:lock:'.$lock->id, AlertSeverity::High, "{$lock->name} is offline", 'The lock is not reporting to LockGuard. Its state may be out of date, and commands may not reach it.', $about);
        } elseif ($lock->last_reported_state !== ReportedLockState::Jammed && ($lock->last_reported_state === ReportedLockState::Unknown || $lock->stateIsStale())) {
            $alerts[] = $this->raise(AlertRule::LockStateUnconfirmed, 'lock_state_unconfirmed:lock:'.$lock->id, AlertSeverity::Medium, "{$lock->name}: state not confirmed", $lock->last_state_observed_at === null
                ? 'LockGuard has no report from this lock yet.'
                : 'The last report from the lock is old, so the door may have changed since. Check that the scheduler and the Eufy bridge are running.', $about);
        }

        if ($lock->last_reported_state === ReportedLockState::Jammed) {
            $alerts[] = $this->raise(AlertRule::LockJammed, 'lock_jammed:lock:'.$lock->id, AlertSeverity::High, "{$lock->name} is jammed", 'The lock reported that its bolt could not move fully. Check the door and that the bolt lines up with the strike plate.', $about);
        }

        $battery = $lock->battery_level;
        if ($battery !== null && $battery <= (int) config('lockguard.alerts.battery_low_percent')) {
            $severity = $battery <= (int) config('lockguard.alerts.battery_critical_percent') ? AlertSeverity::High : AlertSeverity::Medium;
            $alerts[] = $this->raise(AlertRule::BatteryLow, 'battery_low:lock:'.$lock->id, $severity, "{$lock->name}: battery {$battery}%", 'Replace or charge the lock battery soon. A lock with a flat battery cannot be controlled remotely.', [
                ...$about,
                'context' => ['battery_level' => $battery],
            ]);
        }

        return $alerts;
    }
}
