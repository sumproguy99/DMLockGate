<?php

namespace App\Services\Auth;

use App\Enums\AuditOutcome;
use App\Jobs\SendPasswordChangedEmail;
use App\Jobs\SendPasswordResetEmail;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Invitations\InvitationService;
use Illuminate\Auth\Passwords\TokenRepositoryInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Self-service password reset by email.
 *
 * Asking for a link never says whether an account exists: the answer is always the same, and the
 * email goes out from the queue, so response time does not tell either. Links last
 * lockguard.password_reset.minutes, work once, and are stored only as hashes (Laravel's
 * password_reset_tokens). A reset ends every session and API token and emails a notice. It does not
 * sign the person in, and it does not touch two-step verification or device binding: they still
 * sign in on their registered device with their authenticator.
 */
class PasswordResetService
{
    private static ?string $dummyHash = null;

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly InvitationService $invitations,
        private readonly SessionRevoker $sessions,
    ) {}

    public function request(string $email): void
    {
        $email = Str::lower(trim($email));
        $user = User::query()->where('email', $email)->first();
        $refusal = $this->refusal($user);

        if ($refusal === null && $this->tokens()->recentlyCreatedToken($user)) {
            $refusal = 'A link was sent less than a minute ago.';
        }

        if ($refusal !== null) {
            // Same work as creating a token (one bcrypt hash), so timing does not tell the cases apart.
            Hash::make(Str::random(40));
            $this->audit->record('auth.password_reset_requested', AuditOutcome::Denied, targets: ['user' => $user?->id], reason: $refusal, metadata: ['email' => $email]);

            return;
        }

        $token = $this->tokens()->create($user);
        SendPasswordResetEmail::dispatch($user->id, $token)->afterCommit();
        $this->audit->record('auth.password_reset_requested', AuditOutcome::Success, targets: ['user' => $user->id], metadata: [
            'email' => $email,
            'expires_in_minutes' => (int) config('lockguard.password_reset.minutes'),
        ]);
    }

    /**
     * @return array{browser_logins: int, api_clients: int}
     */
    public function reset(string $email, string $token, string $password): array
    {
        $email = Str::lower(trim($email));
        $user = User::query()->where('email', $email)->first();

        if ($user === null) {
            // Check a throwaway hash, so an unknown address takes as long as a wrong link.
            Hash::check($token, self::$dummyHash ??= Hash::make(Str::random(40)));
            $valid = false;
        } else {
            $valid = $this->tokens()->exists($user, $token);
        }

        if (! $valid) {
            $this->audit->record('auth.password_reset', AuditOutcome::Failure, targets: ['user' => $user?->id], reason: 'Invalid or expired reset link.', metadata: ['email' => $email]);

            throw ValidationException::withMessages(['token' => 'This reset link is not valid or has expired. Ask for a new one.']);
        }

        $refusal = $this->refusal($user);
        if ($refusal !== null) {
            $this->tokens()->delete($user);
            $this->audit->record('auth.password_reset', AuditOutcome::Denied, targets: ['user' => $user->id], reason: $refusal, metadata: ['email' => $email]);

            throw ValidationException::withMessages(['token' => 'This account cannot reset its password. Ask your LockGuard administrator.']);
        }

        if (Hash::check($password, $user->password)) {
            throw ValidationException::withMessages(['password' => 'Choose a password you have not used for this account.']);
        }

        $ended = DB::transaction(function () use ($user, $password): array {
            $user->forceFill(['password' => $password, 'remember_token' => Str::random(60)])->save();
            $this->tokens()->delete($user);
            $ended = $this->sessions->revokeAll($user);

            $this->audit->record('auth.password_reset', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id], metadata: ['ended' => $ended]);
            SendPasswordChangedEmail::dispatch($user->id)->afterCommit();

            return $ended;
        });

        return $ended;
    }

    /**
     * Why this account may not reset its password by email, or null when it may.
     */
    private function refusal(?User $user): ?string
    {
        return match (true) {
            $user === null => 'No account with this email.',
            ! $user->isActive() => 'Account is '.($user->status?->value ?? 'inactive').' or expired.',
            $this->invitations->owesTraining($user) => 'Invitation training not completed.',
            // Address-locked service accounts (the kiosk) have no mailbox and no person behind them.
            array_key_exists(Str::lower($user->email), (array) config('lockguard.devices.address_accounts')) => 'Address-locked account.',
            default => null,
        };
    }

    private function tokens(): TokenRepositoryInterface
    {
        return Password::broker()->getRepository();
    }
}
