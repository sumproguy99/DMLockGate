<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Actions\Auth\CompleteLogin;
use App\Enums\AuditOutcome;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Auth\DeviceRegistry;
use App\Services\Invitations\InvitationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SessionController extends Controller
{
    public const MFA_PENDING_SECONDS = 300;

    private static ?string $dummyHash = null;

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly CompleteLogin $completeLogin,
        private readonly DeviceRegistry $devices,
        private readonly InvitationService $invitations,
    ) {}

    /**
     * Sign in with email and password. Accounts with MFA enabled must then call the MFA verify endpoint.
     */
    public function store(LoginRequest $request): JsonResponse
    {
        if (! $request->hasSession()) {
            throw new ApiException(400, 'stateful_client_required', 'Sign in through the LockGuard web or mobile app. This client did not send an allowed Origin.');
        }

        $throttleKey = $request->throttleKey();

        if (RateLimiter::tooManyAttempts($throttleKey, LoginRequest::MAX_ATTEMPTS)) {
            $this->audit->record('auth.login', AuditOutcome::Denied, reason: 'Rate limit exceeded.', metadata: ['email' => $request->input('email')]);

            throw new ApiException(429, 'too_many_requests', 'Too many sign-in attempts. Try again in '.ceil(RateLimiter::availableIn($throttleKey) / 60).' minute(s).');
        }

        $user = User::query()->where('email', $request->validated('email'))->first();

        // Check against a throwaway hash when the account does not exist, so response timing does not reveal valid emails.
        $passwordValid = Hash::check(
            $request->validated('password'),
            $user?->password ?? (self::$dummyHash ??= Hash::make(Str::random(40))),
        );

        if ($user === null || ! $passwordValid) {
            RateLimiter::hit($throttleKey, LoginRequest::DECAY_SECONDS);
            $this->audit->record('auth.login', AuditOutcome::Failure, targets: ['user' => $user?->id], reason: 'Invalid credentials.', metadata: ['email' => $request->input('email')]);

            throw ValidationException::withMessages(['email' => 'These credentials do not match our records.']);
        }

        RateLimiter::clear($throttleKey);

        if (! $user->isActive()) {
            $this->audit->record('auth.login', AuditOutcome::Denied, targets: ['user' => $user->id], reason: 'Account is '.($user->status?->value ?? 'inactive').' or expired.');

            throw ApiException::accountInactive();
        }

        // Invited people finish the training from their invitation link before they can sign in.
        if ($this->invitations->owesTraining($user)) {
            $this->audit->record('auth.login', AuditOutcome::Denied, targets: ['user' => $user->id], reason: 'Invitation training not completed.');

            throw ApiException::trainingRequired();
        }

        // A revoked device stays revoked: the right password does not bring it back.
        $device = $this->devices->find($request, $user);
        if ($device?->isRevoked()) {
            $this->audit->record('device.revoked_access_attempt', AuditOutcome::Denied, targets: ['user' => $user->id, 'device' => $device->id], reason: 'Sign-in from a revoked device.', metadata: ['device' => $device->name]);

            throw ApiException::deviceRevoked();
        }

        // Device binding: this browser must be the user's registered device, or register with a code.
        $this->devices->checkSignIn($request, $user, $request->validated('device_code'));

        $request->session()->regenerate();

        if ($user->mfa_confirmed_at !== null) {
            $request->session()->put(CompleteLogin::MFA_PENDING_KEY, [
                'user_id' => $user->id,
                'expires_at' => now()->addSeconds(self::MFA_PENDING_SECONDS)->getTimestamp(),
            ]);
            $this->audit->record('auth.login', AuditOutcome::Info, targets: ['user' => $user->id], reason: 'Password accepted; MFA code required.');

            return response()->json(['data' => ['status' => 'mfa_required']]);
        }

        return $this->completeLogin->handle($request, $user, 'password');
    }

    /**
     * Sign out and end the session.
     */
    public function destroy(Request $request): Response
    {
        $this->audit->record('auth.logout', AuditOutcome::Success, actor: $request->user(), targets: ['user' => $request->user()->id]);

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }
}
