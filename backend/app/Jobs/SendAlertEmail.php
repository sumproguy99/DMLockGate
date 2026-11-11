<?php

namespace App\Jobs;

use App\Enums\AuditOutcome;
use App\Mail\AlertMail;
use App\Models\NotificationDelivery;
use App\Services\Audit\AuditLogger;
use App\Services\Mail\MailSettings;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

/**
 * Emails one security alert to one person, recording each try on its NotificationDelivery.
 *
 * Retry policy: up to {@see self::TRIES} tries, waiting {@see self::BACKOFF} seconds between them.
 * When every try has failed the delivery is marked failed and the failure is audited. Nothing here
 * changes the alert, its in-app notification or the audit record that raised it.
 */
class SendAlertEmail implements ShouldQueue
{
    use Queueable;

    public const TRIES = 3;

    /** Seconds to wait before the second and third tries. */
    public const BACKOFF = [60, 300];

    public int $tries = self::TRIES;

    public int $timeout = 60;

    public function __construct(public readonly int $deliveryId) {}

    public function handle(MailSettings $settings, AuditLogger $audit): void
    {
        $delivery = NotificationDelivery::query()->with('user')->find($this->deliveryId);
        if ($delivery === null || in_array($delivery->status, [NotificationDelivery::STATUS_SENT, NotificationDelivery::STATUS_FAILED, NotificationDelivery::STATUS_SKIPPED], true)) {
            return;
        }

        $user = $delivery->user;
        if ($user === null || ! $user->isActive()) {
            $delivery->forceFill(['status' => NotificationDelivery::STATUS_SKIPPED, 'last_error' => 'The account is no longer active.'])->save();

            return;
        }

        $delivery->forceFill(['attempts' => $delivery->attempts + 1])->save();

        try {
            $settings->apply();
            Mail::to($delivery->recipient, $user->name)->send(new AlertMail(
                name: $user->name,
                severity: $delivery->severity,
                alertTitle: $delivery->title,
                description: $delivery->description,
                link: $delivery->link,
                mandatory: $delivery->mandatory,
                preferencesUrl: config('lockguard.invitations.public_url').'/notifications/preferences',
            ));
        } catch (Throwable $exception) {
            $this->failedTry($delivery, $exception, $audit);

            return;
        }

        $delivery->forceFill([
            'status' => NotificationDelivery::STATUS_SENT,
            'sent_at' => now(),
            'mailer' => (string) config('mail.default'),
            'last_error' => null,
        ])->save();
    }

    /**
     * Called by the queue when the job dies outside handle(), such as a timeout.
     */
    public function failed(?Throwable $exception): void
    {
        $delivery = NotificationDelivery::query()->find($this->deliveryId);
        if ($delivery !== null && $delivery->status !== NotificationDelivery::STATUS_SENT) {
            $delivery->forceFill(['status' => NotificationDelivery::STATUS_FAILED, 'last_error' => Str::limit($exception?->getMessage() ?? 'The email job stopped.', 480)])->save();
        }
    }

    private function failedTry(NotificationDelivery $delivery, Throwable $exception, AuditLogger $audit): void
    {
        $message = Str::limit($exception->getMessage(), 480);
        Log::warning('Alert email could not be sent.', ['delivery' => $delivery->id, 'attempt' => $delivery->attempts, 'error' => $message]);

        if ($delivery->attempts < self::TRIES) {
            $delivery->forceFill(['status' => NotificationDelivery::STATUS_RETRYING, 'last_error' => $message])->save();
            $this->release(self::BACKOFF[$delivery->attempts - 1] ?? self::BACKOFF[array_key_last(self::BACKOFF)]);

            return;
        }

        $delivery->forceFill(['status' => NotificationDelivery::STATUS_FAILED, 'last_error' => $message])->save();
        $audit->record('notification.email_failed', AuditOutcome::Failure, targets: ['user' => $delivery->user_id], reason: Str::limit($message, 250), metadata: [
            'delivery_id' => $delivery->id,
            'alert_id' => $delivery->alert?->public_id,
            'attempts' => $delivery->attempts,
        ]);
    }
}
