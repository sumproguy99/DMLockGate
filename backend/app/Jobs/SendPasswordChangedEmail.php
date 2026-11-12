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
 * Tells a person their password was just reset or changed, so a change they did not make is noticed.
 */
class SendPasswordChangedEmail implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    /** Reset with an emailed link; everyone was signed out. */
    public const RESET = 'reset';

    /** Changed while signed in; the other sessions were signed out. */
    public const CHANGED = 'changed';

    public function __construct(public readonly int $userId, public readonly string $how = self::RESET) {}

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
                changedWhileSignedIn: $this->how === self::CHANGED,
            ));
        } catch (Throwable $exception) {
            Log::warning('Password changed email could not be sent.', ['user' => $user->id, 'error' => $exception->getMessage()]);
            $audit->record('auth.password_changed_email_failed', AuditOutcome::Failure, targets: ['user' => $user->id], reason: Str::limit($exception->getMessage(), 250));
        }
    }
}
