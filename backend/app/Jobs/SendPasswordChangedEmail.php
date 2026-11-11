<?php

namespace App\Jobs;

use App\Enums\AuditOutcome;
use App\Mail\PasswordChangedMail;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Mail\MailSettings;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

/**
 * Tells a person their password was just reset, so a reset they did not ask for is noticed.
 */
class SendPasswordChangedEmail implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public readonly int $userId) {}

    public function handle(MailSettings $settings, AuditLogger $audit): void
    {
        $user = User::query()->find($this->userId);
        if ($user === null) {
            return;
        }

        try {
            $settings->apply();
            Mail::to($user->email, $user->name)->send(new PasswordChangedMail(
                name: $user->name,
                signInUrl: config('lockguard.invitations.public_url').'/login',
            ));
        } catch (Throwable $exception) {
            Log::warning('Password changed email could not be sent.', ['user' => $user->id, 'error' => $exception->getMessage()]);
            $audit->record('auth.password_changed_email_failed', AuditOutcome::Failure, targets: ['user' => $user->id], reason: Str::limit($exception->getMessage(), 250));
        }
    }
}
