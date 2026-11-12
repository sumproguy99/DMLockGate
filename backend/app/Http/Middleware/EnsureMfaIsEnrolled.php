<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Services\Auth\SecurityPolicy;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * An account whose role must use two-step sign-in (SecurityPolicy) but has no authenticator yet
 * may only see who it is, confirm its identity, set up the authenticator, or sign out. Everything
 * else is refused with mfa_setup_required until it is set up. Checked on every request, so a
 * policy or role change takes effect at once. Refusals are not audited one by one: the sign-in
 * that started the session records it.
 */
class EnsureMfaIsEnrolled
{
    /**
     * Routes an account that owes its authenticator may still use.
     *
     * @var list<string>
     */
    public const ALLOWED_ROUTES = [
        'api.v1.auth.logout',
        'api.v1.auth.me',
        'api.v1.auth.confirm',
        'api.v1.auth.mfa.store',
        'api.v1.auth.mfa.confirm',
        'api.v1.auth.password.update',
    ];

    public function __construct(private readonly SecurityPolicy $policy) {}

    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user !== null
            && ! in_array($request->route()?->getName(), self::ALLOWED_ROUTES, true)
            && $this->policy->owesMfaSetup($user)) {
            throw ApiException::mfaSetupRequired();
        }

        return $next($request);
    }
}
