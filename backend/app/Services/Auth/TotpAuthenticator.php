<?php

namespace App\Services\Auth;

use App\Models\User;
use PragmaRX\Google2FA\Google2FA;

/**
 * Time-based one-time passwords (RFC 6238) for authenticator apps.
 *
 * Each accepted code's time-step is stored and only strictly newer steps are accepted afterwards,
 * so a code cannot be replayed, including by two simultaneous requests.
 */
class TotpAuthenticator
{
    /**
     * Accept codes from one 30-second step either side of now to tolerate clock drift.
     */
    private const WINDOW = 1;

    public function __construct(private readonly Google2FA $google2fa) {}

    public function newSecret(): string
    {
        return $this->google2fa->generateSecretKey(32);
    }

    public function provisioningUri(User $user, string $secret): string
    {
        return $this->google2fa->getQRCodeUrl((string) config('lockguard.auth.mfa_issuer'), $user->email, $secret);
    }

    /**
     * Verify a code against the user's stored secret and consume it.
     */
    public function verifyAndConsume(User $user, string $code): bool
    {
        if ($user->mfa_secret === null) {
            return false;
        }

        return $this->verifyAndConsumeWithSecret($user, $user->mfa_secret, $code);
    }

    /**
     * Verify a code against an explicit secret (used while confirming a new enrollment) and consume it.
     */
    public function verifyAndConsumeWithSecret(User $user, string $secret, string $code): bool
    {
        $code = preg_replace('/\s+/', '', $code);
        if (! preg_match('/^\d{6}$/', $code)) {
            return false;
        }

        $step = $this->google2fa->verifyKeyNewer($secret, $code, $user->mfa_last_used_step ?? 0, self::WINDOW);
        if ($step === false) {
            return false;
        }

        // Atomic compare-and-set: only one request can consume a given step.
        $consumed = User::query()
            ->whereKey($user->getKey())
            ->where(fn ($query) => $query->whereNull('mfa_last_used_step')->orWhere('mfa_last_used_step', '<', $step))
            ->update(['mfa_last_used_step' => $step]);

        if ($consumed !== 1) {
            return false;
        }

        $user->mfa_last_used_step = $step;
        $user->syncOriginalAttribute('mfa_last_used_step');

        return true;
    }
}
