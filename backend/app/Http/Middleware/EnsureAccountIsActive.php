<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Rejects every authenticated request from a suspended, revoked or expired account and ends its
 * session, so a status change takes effect on the account's very next request.
 */
class EnsureAccountIsActive
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Re-read the status from the database rather than trusting an in-memory user object.
        $user = $request->user()?->refresh();

        if ($user !== null && ! $user->isActive()) {
            if ($request->hasSession()) {
                Auth::guard('web')->logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            throw ApiException::accountInactive();
        }

        return $next($request);
    }
}
