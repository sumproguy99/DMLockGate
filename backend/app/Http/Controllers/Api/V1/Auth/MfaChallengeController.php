<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Actions\Auth\CompleteLogin;
use App\Enums\AuditOutcome;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Auth\RecoveryCodes;
use App\Services\Auth\TotpAuthenticator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class MfaChallengeController extends Controller
{
    private const MAX_ATTEMPTS = 5;

    /**
     * Second sign-in step: verify an authenticator code or a one-time recovery code.
     */
    public function __invoke(
        Request $request,
        TotpAuthenticator $totp,
        RecoveryCodes $recoveryCodes,
        CompleteLogin $completeLogin,
        AuditLogger $audit,
    ): JsonResponse {
        $validated = $request->validate([
            'code' => ['nullable', 'required_without:recovery_code', 'string', 'max:16'],
            'recovery_code' => ['nullable', 'required_without:code', 'string', 'max:32'],
        ]);

        $pending = $request->hasSession() ? $request->session()->get(CompleteLogin::MFA_PENDING_KEY) : null;
        if ($pending === null || $pending['expires_at'] < now()->getTimestamp()) {
            if ($request->hasSession()) {
                $request->session()->forget(CompleteLogin::MFA_PENDING_KEY);
            }

            throw new ApiException(401, 'mfa_session_expired', 'The sign-in attempt expired. Enter your email and password again.');
        }

        $user = User::query()->findOrFail($pending['user_id']);
        $throttleKey = 'mfa:'.$user->id;

        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_ATTEMPTS)) {
            $request->session()->forget(CompleteLogin::MFA_PENDING_KEY);
            $audit->record('auth.mfa_verify', AuditOutcome::Denied, targets: ['user' => $user->id], reason: 'Rate limit exceeded.');

            throw new ApiException(429, 'too_many_requests', 'Too many incorrect codes. Sign in again in a few minutes.');
        }

        if (! $user->isActive()) {
            $request->session()->forget(CompleteLogin::MFA_PENDING_KEY);

            throw ApiException::accountInactive();
        }

        [$valid, $method] = isset($validated['code'])
            ? [$totp->verifyAndConsume($user, $validated['code']), 'totp']
            : [$recoveryCodes->consume($user, $validated['recovery_code']), 'recovery_code'];

        if (! $valid) {
            RateLimiter::hit($throttleKey, 300);
            $audit->record('auth.mfa_verify', AuditOutcome::Failure, targets: ['user' => $user->id], reason: 'Invalid or already used code.', metadata: ['method' => $method]);

            throw ValidationException::withMessages([
                $method === 'totp' ? 'code' : 'recovery_code' => 'That code is not valid or has already been used.',
            ]);
        }

        RateLimiter::clear($throttleKey);

        if ($method === 'recovery_code') {
            $audit->record('auth.mfa_recovery_code_used', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id], metadata: ['remaining' => $recoveryCodes->remaining($user)]);
        }

        return $completeLogin->handle($request, $user, $method);
    }
}
