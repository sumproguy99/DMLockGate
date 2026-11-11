<?php

namespace App\Services\Security;

use App\Enums\AlertRule;
use App\Enums\AlertSeverity;
use App\Enums\PermissionKey;
use App\Enums\UserStatus;
use App\Jobs\SendAlertEmail;
use App\Models\NotificationDelivery;
use App\Models\SecurityAlert;
use App\Models\User;
use App\Notifications\SecurityAlertNotification;
use App\Services\Authorization\PermissionResolver;
use App\Services\Locks\LockCommandService;
use App\Services\Notifications\NotificationPreferences;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Throwable;

/**
 * Decides who is told about a new alert, and how: in the app and by email (project.md section 22).
 *
 * - Incident handlers (admin.incidents_manage) are always told in the app, and High and Critical
 *   alerts are always emailed to them. This is mandatory: no preference can turn it off.
 * - People who can currently use the lock are told about it being offline, jammed or low on battery.
 * - The person an account alert is about is told, worded for them.
 *
 * Everyone else's channels follow their {@see NotificationPreferences}. Emails are queued with
 * retries and tracked as NotificationDelivery rows.
 *
 * Each person gets at most `notifications_per_hour` alert notifications an hour; Critical alerts are
 * never held back. A failed notification is logged and never undoes the alert or its audit record.
 */
class AlertNotifier
{
    public function __construct(
        private readonly PermissionResolver $permissions,
        private readonly LockCommandService $locks,
        private readonly NotificationPreferences $preferences,
    ) {}

    public function notify(SecurityAlert $alert): int
    {
        $sent = 0;
        foreach ($this->recipients($alert) as [$user, $mandatory, $personal]) {
            $channels = $this->preferences->channels($user, $alert, $mandatory);
            if (! $channels['in_app'] && ! $channels['email']) {
                continue;
            }
            if (! $this->withinLimit($user, $alert)) {
                continue;
            }

            $title = $personal ? self::personalTitle($alert) : $alert->title;
            $description = $personal ? self::personalDescription($alert) : $alert->description;
            $notificationId = null;
            $told = false;

            if ($channels['in_app']) {
                try {
                    $notification = new SecurityAlertNotification($alert, $mandatory, $title, $description);
                    $notification->id = (string) Str::uuid();
                    $user->notify($notification);
                    $notificationId = $notification->id;
                    $told = true;
                } catch (Throwable $exception) {
                    report($exception);
                }
            }

            if ($channels['email']) {
                try {
                    $delivery = NotificationDelivery::query()->create([
                        'user_id' => $user->id,
                        'security_alert_id' => $alert->id,
                        'notification_id' => $notificationId,
                        'channel' => NotificationDelivery::CHANNEL_EMAIL,
                        'recipient' => $user->email,
                        'severity' => $alert->severity->value,
                        'title' => Str::limit($title, 157),
                        'description' => $description,
                        'link' => $this->linkFor($user, $alert),
                        'mandatory' => $mandatory,
                        'status' => NotificationDelivery::STATUS_QUEUED,
                    ]);
                    SendAlertEmail::dispatch($delivery->id)->afterCommit();
                    $told = true;
                } catch (Throwable $exception) {
                    report($exception);
                }
            }

            if ($told) {
                $sent++;
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
            if ($alert->rule->notifiesHandlers() && $this->permissions->allows($user, PermissionKey::AdminIncidentsManage)) {
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

    /**
     * Where the email's button goes: the alert in the Security Center for people who can see it,
     * otherwise their own notifications.
     */
    private function linkFor(User $user, SecurityAlert $alert): string
    {
        $base = (string) config('lockguard.invitations.public_url');

        return $this->permissions->allows($user, PermissionKey::AdminIncidentsView)
            ? $base.'/security?alert='.$alert->public_id
            : $base.'/notifications';
    }

    private function withinLimit(User $user, SecurityAlert $alert): bool
    {
        if ($alert->severity === AlertSeverity::Critical) {
            return true;
        }

        return RateLimiter::attempt('alert-notifications:'.$user->id, (int) config('lockguard.alerts.notifications_per_hour'), fn (): bool => true, 3600) !== false;
    }

    private static function personalTitle(SecurityAlert $alert): string
    {
        $device = $alert->context['device'] ?? 'a device';

        return match ($alert->rule) {
            AlertRule::FailedSignIns => 'Failed sign-in attempts on your account',
            AlertRule::MfaDisabled => 'Two-step sign-in was turned off for your account',
            AlertRule::RecoveryCodeUsed => 'A recovery code was used for your account',
            AlertRule::AdminPermissionChange => 'You were given administrative permissions',
            AlertRule::NewDeviceSignIn => "New sign-in on your account: {$device}",
            AlertRule::RevokedDeviceAccess => "A removed device tried to use your account: {$device}",
            AlertRule::DeviceLost => "Device reported lost: {$device}",
            default => $alert->rule->label(),
        };
    }

    private static function personalDescription(SecurityAlert $alert): string
    {
        return match ($alert->rule) {
            AlertRule::FailedSignIns => 'Someone entered the wrong password or code for your account several times. If it was not you, change your password and tell an administrator.',
            AlertRule::MfaDisabled => 'Your account now signs in with a password alone. If you did not do this, tell an administrator straight away.',
            AlertRule::RecoveryCodeUsed => 'One of your one-time recovery codes was used to sign in. If it was not you, tell an administrator straight away.',
            AlertRule::AdminPermissionChange => 'An administrator gave your account more permissions. Take care with what you change.',
            AlertRule::NewDeviceSignIn => 'Your account was signed in on a browser or phone it has not used before. If it was not you, revoke the device under Devices and change your password.',
            AlertRule::RevokedDeviceAccess => 'A device you or an administrator removed from your account tried to sign in, and was refused. If you no longer have it, tell an administrator.',
            AlertRule::DeviceLost => 'The device was removed from your account and you were signed out everywhere. Sign in again on the devices you still have.',
            default => '',
        };
    }
}
