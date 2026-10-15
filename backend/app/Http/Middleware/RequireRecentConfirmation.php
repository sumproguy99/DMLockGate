<?php

namespace App\Http\Middleware;

use App\Actions\Auth\CompleteLogin;
use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Step-up authentication: sensitive routes require the user to have signed in or re-confirmed
 * their identity (POST /api/v1/auth/confirm) within lockguard.auth.step_up_seconds.
 */
class RequireRecentConfirmation
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $confirmedAt = $request->hasSession() ? $request->session()->get(CompleteLogin::CONFIRMED_AT_KEY) : null;

        if ($confirmedAt === null || now()->getTimestamp() - (int) $confirmedAt > (int) config('lockguard.auth.step_up_seconds')) {
            throw new ApiException(403, 'step_up_required', 'Confirm your identity to continue. Re-enter your password'.($request->user()?->mfa_confirmed_at ? ' and authenticator code.' : '.'));
        }

        return $next($request);
    }
}
