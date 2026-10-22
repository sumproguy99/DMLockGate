<?php

namespace App\Services\Security;

use App\Enums\AlertRule;
use App\Enums\AlertSeverity;
use App\Enums\PermissionKey;
use App\Enums\UserStatus;
use App\Models\SecurityAlert;
use App\Models\User;
use App\Notifications\SecurityAlertNotification;
use App\Services\Authorization\PermissionResolver;
use App\Services\Locks\LockCommandService;
use Illuminate\Support\Facades\RateLimiter;
use Throwable;

/**
 * Decides who is told about a new alert, and tells them in the app (project.md section 22).
 *
 * - Incident handlers (admin.incidents_manage) are always told. This is mandatory: no preference
 *   can turn it off.
 * - People who can currently use the lock are told about it being offline, jammed or low on battery.
 * - The person an account alert is about is told, worded for them.
 *
 * Each person gets at most `notifications_per_hour` alert notifications an hour; Critical alerts are
 * never held back. A failed notification is logged and never undoes the alert or its audit record.
 */
class AlertNotifier
{
    public function __construct(
        private readonly PermissionResolver $permissions,
        private readonly LockCommandService $locks,
    ) {}

    public function notify(SecurityAlert $alert): int
    {
        $sent = 0;
        foreach ($this->recipients($alert) as [$user, $mandatory, $personal]) {
            if (! $this->withinLimit($user, $alert)) {
                continue;
            }

            try {
                $user->notify(new SecurityAlertNotification(
                    $alert,
                    $mandatory,
                    $personal ? self::personalTitle($alert->rule) : null,
                    $personal ? self::personalDescription($alert->rule) : null,
                ));
                $sent++;
            } catch (Throwable $exception) {
                report($exception);
            }
        }

        if ($sent > 0) {
            $alert->forceFill(['notified_at' => now()])->save();
        }

        return $sent;
    }

    /**
     * @return list<array{0: User, 1: bool, 2: bool}> Each recipient, whether it is mandatory, and whether to word it for them.
     */
    public function recipients(SecurityAlert $alert): array
    {
        $alert->loadMissing('subjectLock');
        $recipients = [];

        foreach (User::query()->where('status', UserStatus::Active)->get() as $user) {
            if (! $user->isActive()) {
                continue;
            }

            $isSubject = $alert->rule->notifiesSubjectUser() && $alert->subject_user_id === $user->id;
            if ($this->permissions->allows($user, PermissionKey::AdminIncidentsManage)) {
                $recipients[] = [$user, true, false];
            } elseif ($isSubject) {
                $recipients[] = [$user, false, true];
            } elseif ($alert->rule->notifiesLockUsers() && $alert->subjectLock !== null
                && $this->permissions->allows($user, PermissionKey::LockViewStatus)
                && $this->locks->accessProblem($user, $alert->subjectLock) === null) {
                $recipients[] = [$user, false, false];
            }
        }

        return $recipients;
    }

    private function withinLimit(User $user, SecurityAlert $alert): bool
    {
        if ($alert->severity === AlertSeverity::Critical) {
            return true;
        }

        return RateLimiter::attempt('alert-notifications:'.$user->id, (int) config('lockguard.alerts.notifications_per_hour'), fn (): bool => true, 3600) !== false;
    }

    private static function personalTitle(AlertRule $rule): string
    {
        return match ($rule) {
            AlertRule::FailedSignIns => 'Failed sign-in attempts on your account',
            AlertRule::MfaDisabled => 'Two-step sign-in was turned off for your account',
            AlertRule::RecoveryCodeUsed => 'A recovery code was used for your account',
            AlertRule::AdminPermissionChange => 'You were given administrative permissions',
            default => $rule->label(),
        };
    }

    private static function personalDescription(AlertRule $rule): string
    {
        return match ($rule) {
            AlertRule::FailedSignIns => 'Someone entered the wrong password or code for your account several times. If it was not you, change your password and tell an administrator.',
            AlertRule::MfaDisabled => 'Your account now signs in with a password alone. If you did not do this, tell an administrator straight away.',
            AlertRule::RecoveryCodeUsed => 'One of your one-time recovery codes was used to sign in. If it was not you, tell an administrator straight away.',
            AlertRule::AdminPermissionChange => 'An administrator gave your account more permissions. Take care with what you change.',
            default => '',
        };
    }
}
