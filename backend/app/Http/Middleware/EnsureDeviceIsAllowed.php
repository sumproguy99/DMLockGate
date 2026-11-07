<?php

namespace App\Http\Middleware;

use App\Enums\AuditOutcome;
use App\Exceptions\ApiException;
use App\Services\Audit\AuditLogger;
use App\Services\Auth\DeviceRegistry;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ends the session of a revoked device on its very next request, and of an unregistered device
 * when the account is bound to its registered one (device binding). Makes the request's device
 * available to controllers as the `device` request attribute. API-token clients have no device.
 */
class EnsureDeviceIsAllowed
{
    public function __construct(
        private readonly DeviceRegistry $devices,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $device = $user === null ? null : $this->devices->current($request, $user);

        if ($device?->isRevoked()) {
            $this->audit->record('device.revoked_access_attempt', AuditOutcome::Denied, actor: $user, targets: ['user' => $user->id, 'device' => $device->id], reason: 'Request from a revoked device.', metadata: [
                'device' => $device->name,
                'path' => $request->path(),
            ]);

            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            throw ApiException::deviceRevoked();
        }

        // An address-locked account (for example a kiosk) works only from its approved addresses.
        if ($user !== null && ! $this->devices->addressAllowed($request, $user)) {
            $this->audit->record('device.address_refused', AuditOutcome::Denied, actor: $user, targets: ['user' => $user->id], reason: 'Request from a network address this account is not allowed to use.', metadata: [
                'path' => $request->path(),
            ]);

            if ($request->hasSession()) {
                Auth::guard('web')->logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            throw ApiException::addressNotAllowed();
        }

        // Device binding: a bound account works only on its registered device, never via an API
        // token or a session from before the account was bound.
        if ($user !== null && ! $device?->isRegistered() && $this->devices->isBound($user)) {
            $this->audit->record('device.registration_required', AuditOutcome::Denied, actor: $user, targets: ['user' => $user->id, 'device' => $device?->id], reason: 'Request from a device that is not registered to this account.', metadata: [
                'path' => $request->path(),
            ]);

            if ($request->hasSession()) {
                Auth::guard('web')->logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            throw ApiException::deviceRegistrationRequired();
        }

        $request->attributes->set('device', $device);

        return $next($request);
    }
}
