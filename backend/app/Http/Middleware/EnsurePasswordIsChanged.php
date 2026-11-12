<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * An account whose password an administrator chose (password_change_required) may only see who it
 * is, change its password, or sign out. Everything else is refused with password_change_required
 * until it has chosen its own. Runs before EnsureMfaIsEnrolled, so the password comes first.
 */
class EnsurePasswordIsChanged
{
    /**
     * Routes an account that owes a password change may still use.
     *
     * @var list<string>
     */
    public const ALLOWED_ROUTES = [
        'api.v1.auth.logout',
        'api.v1.auth.me',
        'api.v1.auth.password.update',
    ];

    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user !== null
            && $user->password_change_required
            && ! in_array($request->route()?->getName(), self::ALLOWED_ROUTES, true)) {
            throw ApiException::passwordChangeRequired();
        }

        return $next($request);
    }
}
