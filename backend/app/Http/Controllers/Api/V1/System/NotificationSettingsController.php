<?php

namespace App\Http\Controllers\Api\V1\System;

use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Jobs\SendAlertEmail;
use App\Models\NotificationDelivery;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\UserManagementGuard;
use App\Services\Mail\MailSettings;
use App\Services\Notifications\NotificationPreferences;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Notification settings (admin.notifications): the limits people's own preferences work within,
 * and the recent alert emails with their delivery status. Saving needs step-up and is audited.
 */
class NotificationSettingsController extends Controller
{
    private const RECENT_DELIVERIES = 25;

    public function __construct(
        private readonly NotificationPreferences $preferences,
        private readonly MailSettings $mail,
        private readonly UserManagementGuard $guard,
        private readonly AuditLogger $audit,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $this->guard->requirePermission($request->user(), PermissionKey::AdminNotifications, 'settings.notifications_viewed');

        return response()->json(['data' => $this->present()]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->guard->requirePermission($request->user(), PermissionKey::AdminNotifications, 'settings.notifications_updated');

        $validated = $request->validate([
            'email_enabled' => ['required', 'boolean'],
            'email_min_severity' => ['required', Rule::in(NotificationPreferences::SEVERITIES)],
            'required_categories' => ['present', 'array'],
            'required_categories.*' => ['string', Rule::in(array_keys(NotificationPreferences::CATEGORIES))],
        ]);

        $changed = $this->preferences->saveLimits($validated, $request->user());
        $this->audit->record('settings.notifications_updated', AuditOutcome::Success, actor: $request->user(), metadata: [
            'changed' => $changed,
            'now' => $this->preferences->limits(),
        ]);

        return response()->json(['data' => $this->present()]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(): array
    {
        $mail = $this->mail->stored();

        return [
            ...$this->preferences->limitsForDisplay(),
            'mail_configured' => $mail !== null && ($mail['enabled'] ?? false),
            'fallback_mailer' => (string) config('mail.default'),
            'retry' => ['tries' => SendAlertEmail::TRIES, 'backoff_seconds' => SendAlertEmail::BACKOFF],
            // How long finished records are kept (lockguard:prune-security, set in .env); 0 keeps them.
            'retention_days' => array_map('intval', (array) config('lockguard.retention')),
            'recent_deliveries' => NotificationDelivery::query()
                ->with(['user:id,name', 'alert:id,public_id'])
                ->latest('id')
                ->limit(self::RECENT_DELIVERIES)
                ->get()
                ->map(fn (NotificationDelivery $delivery): array => [
                    'id' => $delivery->id,
                    'user' => $delivery->user?->name,
                    'recipient' => $delivery->recipient,
                    'severity' => $delivery->severity,
                    'title' => $delivery->title,
                    'alert_id' => $delivery->alert?->public_id,
                    'mandatory' => $delivery->mandatory,
                    'status' => $delivery->status,
                    'attempts' => $delivery->attempts,
                    'mailer' => $delivery->mailer,
                    'last_error' => $delivery->last_error,
                    'created_at' => $delivery->created_at?->toIso8601ZuluString('millisecond'),
                    'sent_at' => $delivery->sent_at?->toIso8601ZuluString('millisecond'),
                ])
                ->all(),
        ];
    }
}
