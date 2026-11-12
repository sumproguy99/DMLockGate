<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Enums\AuditOutcome;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Jobs\SendPasswordChangedEmail;
use App\Services\Audit\AuditLogger;
use App\Services\Auth\SessionRevoker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * The signed-in user changes their own password with their current one. This is also how someone
 * whose password an administrator chose (password_change_required) picks their own. Other sessions
 * end; this one carries on.
 */
class PasswordController extends Controller
{
    private const MAX_ATTEMPTS = 5;

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly SessionRevoker $sessions,
    ) {}

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string', 'max:1024'],
            'password' => ['required', 'string', 'max:1024', 'confirmed', Password::min(12)->letters()->numbers()],
        ]);
        $user = $request->user();

        $throttleKey = 'password-change:'.$user->id;
        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_ATTEMPTS)) {
            throw new ApiException(429, 'too_many_requests', 'Too many attempts. Wait a few minutes and try again.');
        }
        if (! Hash::check($validated['current_password'], $user->password)) {
            RateLimiter::hit($throttleKey, 300);
            $this->audit->record('auth.password_changed', AuditOutcome::Failure, actor: $user, targets: ['user' => $user->id], reason: 'Invalid current password.');

            throw ValidationException::withMessages(['current_password' => 'The current password is incorrect.']);
        }
        RateLimiter::clear($throttleKey);

        if (Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages(['password' => 'Choose a password different from your current one.']);
        }

        $wasRequired = (bool) $user->password_change_required;
        $currentSession = $request->hasSession() ? $request->session()->getId() : '';

        $ended = DB::transaction(function () use ($user, $validated, $wasRequired, $currentSession): array {
            $user->forceFill([
                'password' => $validated['password'],
                'password_change_required' => false,
                'remember_token' => Str::random(60),
            ])->save();
            $ended = $this->sessions->revokeOthers($user, $currentSession);

            $this->audit->record('auth.password_changed', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id], metadata: array_filter([
                'signed_out' => $ended,
                'was_required' => $wasRequired ?: null,
            ], fn ($value): bool => $value !== null));
            SendPasswordChangedEmail::dispatch($user->id, SendPasswordChangedEmail::CHANGED)->afterCommit();

            return $ended;
        });

        // Sanctum's AuthenticateSession signs a session out when the password hash it saw changes,
        // so this session takes the new hash and stays signed in.
        if ($request->hasSession()) {
            foreach ((array) config('sanctum.guard', ['web']) as $guard) {
                $request->session()->put('password_hash_'.$guard, $user->getAuthPassword());
            }
        }

        return response()->json(['data' => ['status' => 'changed', 'signed_out' => $ended]]);
    }
}
