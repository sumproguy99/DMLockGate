<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Actions\Auth\CompleteLogin;
use App\Enums\AuditOutcome;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Services\Audit\AuditLogger;
use App\Services\Auth\TotpAuthenticator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class ConfirmIdentityController extends Controller
{
    private const MAX_ATTEMPTS = 5;

    /**
     * Step-up: re-enter the password (and authenticator code when MFA is enabled) to unlock sensitive actions.
     */
    public function __invoke(Request $request, TotpAuthenticator $totp, AuditLogger $audit): JsonResponse
    {
        $user = $request->user();
        $mfaEnabled = $user->mfa_confirmed_at !== null;

        $validated = $request->validate([
            'password' => ['required', 'string', 'max:1024'],
            'code' => [$mfaEnabled ? 'required' : 'nullable', 'string', 'max:16'],
        ]);

        $throttleKey = 'confirm:'.$user->id;
        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_ATTEMPTS)) {
            throw new ApiException(429, 'too_many_requests', 'Too many attempts. Wait a few minutes and try again.');
        }

        $passwordValid = Hash::check($validated['password'], $user->password);
        $codeValid = ! $mfaEnabled || ($passwordValid && $totp->verifyAndConsume($user, $validated['code']));

        if (! $passwordValid || ! $codeValid) {
            RateLimiter::hit($throttleKey, 300);
            $audit->record('auth.step_up', AuditOutcome::Failure, actor: $user, targets: ['user' => $user->id], reason: $passwordValid ? 'Invalid authenticator code.' : 'Invalid password.');

            throw ValidationException::withMessages([
                $passwordValid ? 'code' : 'password' => $passwordValid ? 'That code is not valid or has already been used.' : 'The password is incorrect.',
            ]);
        }

        RateLimiter::clear($throttleKey);
        $request->session()->put(CompleteLogin::CONFIRMED_AT_KEY, now()->getTimestamp());
        $audit->record('auth.step_up', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id]);

        return response()->json(['data' => [
            'confirmed_until' => now()->addSeconds((int) config('lockguard.auth.step_up_seconds'))->toIso8601String(),
        ]]);
    }
}
