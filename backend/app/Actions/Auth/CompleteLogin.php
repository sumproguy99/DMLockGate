<?php

namespace App\Actions\Auth;

use App\Enums\AuditOutcome;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Establishes the authenticated session once every required factor has been verified.
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

    public function __construct(private readonly AuditLogger $audit) {}

    public function handle(Request $request, User $user, string $method): JsonResponse
    {
        $request->session()->forget(self::MFA_PENDING_KEY);
        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $request->session()->put(self::CONFIRMED_AT_KEY, now()->getTimestamp());

        $user->forceFill(['last_login_at' => now()])->saveQuietly();

        $this->audit->record('auth.login', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id], metadata: ['method' => $method]);

        return response()->json([
            'data' => ['status' => 'authenticated', 'user' => new UserResource($user->load('roles'))],
        ]);
    }
}
