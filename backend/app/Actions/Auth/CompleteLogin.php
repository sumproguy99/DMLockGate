<?php

namespace App\Actions\Auth;

use App\Enums\AuditOutcome;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Auth\DeviceRegistry;
use App\Services\Auth\SecurityPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Establishes the authenticated session once every required factor has been verified, and records
 * the device it was established on.
 */
class CompleteLogin
{
    /**
     * Session key holding the user id that passed the password step and still owes an MFA code.
     */
    public const MFA_PENDING_KEY = 'auth.mfa_pending';

    /**
     * Session key holding the Unix time the user last proved their identity (login or step-up).
     */
    public const CONFIRMED_AT_KEY = 'auth.confirmed_at';

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly DeviceRegistry $devices,
        private readonly SecurityPolicy $policy,
    ) {}

    public function handle(Request $request, User $user, string $method): JsonResponse
    {
        $request->session()->forget(self::MFA_PENDING_KEY);

        // The device first: when it may not be used (device binding), nobody is signed in.
        $registered = $this->devices->register($request, $user);
        $device = $registered['device'];

        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $request->session()->put(self::CONFIRMED_AT_KEY, now()->getTimestamp());

        $user->forceFill(['last_login_at' => now()])->saveQuietly();

        // Signing in is agreeing to the location notice on the sign-in screen; record which version.
        $this->audit->record('auth.login', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id, 'device' => $device->id], metadata: [
            'method' => $method,
            'location_notice' => config('lockguard.location.notice_version'),
            'device' => $device->name,
            ...($this->policy->owesMfaSetup($user) ? ['mfa_setup_required' => true] : []),
            ...($user->password_change_required ? ['change_required_by_admin' => true] : []),
        ]);

        // A user's very first device is not news; any later new one is worth telling them about.
        if ($registered['new'] && ! $registered['first_for_account']) {
            $this->audit->record('device.new_sign_in', AuditOutcome::Info, actor: $user, targets: ['user' => $user->id, 'device' => $device->id], metadata: [
                'device' => $device->name,
            ]);
        }

        return response()->json([
            'data' => ['status' => 'authenticated', 'user' => new UserResource($user->load('roles'))],
        ]);
    }
}
