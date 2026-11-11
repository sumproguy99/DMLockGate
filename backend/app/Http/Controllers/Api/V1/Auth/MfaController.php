<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Enums\AuditOutcome;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Services\Audit\AuditLogger;
use App\Services\Auth\RecoveryCodes;
use App\Services\Auth\SecurityPolicy;
use App\Services\Auth\TotpAuthenticator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Enrollment and removal of the signed-in user's own authenticator app. All routes require step-up.
 */
class MfaController extends Controller
{
    public function __construct(
        private readonly TotpAuthenticator $totp,
        private readonly RecoveryCodes $recoveryCodes,
        private readonly AuditLogger $audit,
        private readonly SecurityPolicy $policy,
    ) {}

    /**
     * Start enrollment: create a secret and return it for the authenticator app. MFA is not active until confirmed.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user->mfa_confirmed_at !== null) {
            throw new ApiException(409, 'mfa_already_enabled', 'An authenticator app is already set up. Remove it before adding a new one.');
        }

        $secret = $this->totp->newSecret();

        DB::transaction(function () use ($user, $secret): void {
            $user->forceFill(['mfa_secret' => $secret, 'mfa_last_used_step' => null])->save();
            $this->audit->record('auth.mfa_enrollment_started', AuditOutcome::Info, actor: $user, targets: ['user' => $user->id]);
        });

        return response()->json(['data' => [
            'secret' => $secret,
            'otpauth_uri' => $this->totp->provisioningUri($user, $secret),
        ]], 201);
    }

    /**
     * Finish enrollment with a code from the app. Returns one-time recovery codes, shown only here.
     */
    public function confirm(Request $request): JsonResponse
    {
        $validated = $request->validate(['code' => ['required', 'string', 'max:16']]);
        $user = $request->user();

        if ($user->mfa_confirmed_at !== null) {
            throw new ApiException(409, 'mfa_already_enabled', 'An authenticator app is already set up.');
        }
        if ($user->mfa_secret === null) {
            throw new ApiException(409, 'mfa_enrollment_not_started', 'Start authenticator setup first.');
        }
        if (! $this->totp->verifyAndConsumeWithSecret($user, $user->mfa_secret, $validated['code'])) {
            throw ValidationException::withMessages(['code' => 'That code is not valid. Check the time on your phone and try again.']);
        }

        $codes = DB::transaction(function () use ($user): array {
            $user->forceFill(['mfa_confirmed_at' => now()])->save();
            $codes = $this->recoveryCodes->regenerate($user);
            $this->audit->record('auth.mfa_enabled', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id]);

            return $codes;
        });

        return response()->json(['data' => ['mfa_enabled' => true, 'recovery_codes' => $codes]]);
    }

    /**
     * Remove the authenticator app, for example to move to a new phone. When the user's role must use
     * two-step sign-in, they can do nothing else until they have set up a new one (EnsureMfaIsEnrolled).
     */
    public function destroy(Request $request): Response
    {
        $user = $request->user();
        $required = $this->policy->requiresMfa($user);

        DB::transaction(function () use ($user, $required): void {
            $user->forceFill([
                'mfa_secret' => null,
                'mfa_confirmed_at' => null,
                'mfa_recovery_codes' => null,
                'mfa_last_used_step' => null,
            ])->save();
            $this->audit->record('auth.mfa_disabled', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id], metadata: $required ? ['mfa_setup_required' => true] : []);
        });

        return response()->noContent();
    }
}
