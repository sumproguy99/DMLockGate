<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Services\Auth\PasswordResetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Password;

/**
 * Signed-out password reset: ask for an emailed link, then choose a new password with it.
 */
class PasswordResetController extends Controller
{
    public const REQUESTED_MESSAGE = 'If that email belongs to a LockGuard account that can reset its password, a reset link is on its way. Check your inbox and spam folder.';

    public function __construct(private readonly PasswordResetService $resets) {}

    /**
     * Always the same answer, whether or not the account exists.
     */
    public function request(Request $request): JsonResponse
    {
        $validated = $request->validate(['email' => ['required', 'string', 'email', 'max:255']]);

        $this->resets->request($validated['email']);

        return response()->json(['data' => ['status' => 'requested', 'message' => self::REQUESTED_MESSAGE]], 202);
    }

    public function reset(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
            'token' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:1024', 'confirmed', Password::min(12)->letters()->numbers()],
        ]);

        $ended = $this->resets->reset($validated['email'], $validated['token'], $validated['password']);

        return response()->json(['data' => ['status' => 'reset', 'signed_out' => $ended]]);
    }
}
