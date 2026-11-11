<?php

namespace App\Jobs;

use App\Enums\AuditOutcome;
use App\Mail\PasswordResetMail;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Mail\MailSettings;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

/**
 * Emails a password reset link. Queued, so asking for a link takes as long whether or not the
 * account exists; encrypted, because the payload carries the token until the job runs.
 *
 * The token travels after the "#", which browsers never send to a server, so it stays out of
 * proxy and access logs. A failed send is logged and audited, never retried: the person can ask again.
 */
class SendPasswordResetEmail implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(
        public readonly int $userId,
        public readonly string $token,
    ) {}

    public function handle(MailSettings $settings, AuditLogger $audit): void
    {
        $user = User::query()->find($this->userId);
        if ($user === null) {
            return;
        }

        $url = config('lockguard.invitations.public_url').'/reset-password#'.http_build_query(['token' => $this->token, 'email' => $user->email]);

        try {
            $settings->apply();
            Mail::to($user->email, $user->name)->send(new PasswordResetMail(
                name: $user->name,
                resetUrl: $url,
                expiresInMinutes: (int) config('lockguard.password_reset.minutes'),
            ));
        } catch (Throwable $exception) {
            Log::warning('Password reset email could not be sent.', ['user' => $user->id, 'error' => $exception->getMessage()]);
            $audit->record('auth.password_reset_email_failed', AuditOutcome::Failure, targets: ['user' => $user->id], reason: Str::limit($exception->getMessage(), 250));
        }
    }
}
