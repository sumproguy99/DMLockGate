<?php

namespace App\Services\Auth;

use App\Enums\AuditOutcome;
use App\Enums\DeviceStatus;
use App\Exceptions\ApiException;
use App\Models\DeviceRegistrationCode;
use App\Models\User;
use App\Models\UserDevice;
use App\Services\Audit\AuditLogger;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\IpUtils;

/**
 * Recognizes the browser or phone behind a request (project.md sections 12 and 16).
 *
 * A browser carries a random token in an HTTP-only cookie, and the session remembers which device
 * it signed in on. The token is never stored, only its SHA-256 hash, so a database copy cannot be
 * used to impersonate a device. One browser used by two people is a separate device on each account.
 */
class DeviceRegistry
{
    /** Session key holding the id of the device this session signed in on. */
    public const SESSION_KEY = 'auth.device_id';

    /** Session key holding the id of the registration code accepted at sign-in, until it completes. */
    public const CODE_SESSION_KEY = 'auth.device_code_id';

    /** How often a device's last-seen time is written, at most. */
    private const TOUCH_SECONDS = 60;

    /** Registration codes: 8 characters without look-alikes (no 0/O, 1/I/L). */
    private const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    private const CODE_LENGTH = 8;

    private const CODE_MAX_ATTEMPTS = 5;

    private const CODE_DECAY_SECONDS = 900;

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly SessionRevoker $sessions,
    ) {}

    /**
     * The device this browser's cookie identifies on the user's account, or null when it is new.
     */
    public function find(Request $request, User $user): ?UserDevice
    {
        $token = $this->token($request);

        return $token === null ? null : $user->devices()->where('token_hash', hash('sha256', $token))->first();
    }

    /**
     * Whether device binding applies to this user: their account can only be used on the one
     * device they registered with a code. Holders of an exempt role (administrators) and accounts
     * locked to network addresses instead (see allowedAddresses) are not bound.
     */
    public function isBound(User $user): bool
    {
        if (! config('lockguard.devices.binding') || $this->allowedAddresses($user) !== null) {
            return false;
        }

        $exempt = (array) config('lockguard.devices.exempt_roles');

        return ! $user->roles->contains(fn ($role): bool => in_array($role->key, $exempt, true));
    }

    /**
     * The network addresses (or CIDR ranges) this account is locked to instead of a registered
     * device, or null when it is not address-locked.
     *
     * @return list<string>|null
     */
    public function allowedAddresses(User $user): ?array
    {
        if (! config('lockguard.devices.binding')) {
            return null;
        }

        $addresses = ((array) config('lockguard.devices.address_accounts'))[strtolower((string) $user->email)] ?? null;

        return $addresses === null ? null : array_values((array) $addresses);
    }

    /**
     * Whether this request comes from an address the account may be used from. Always true for
     * accounts that are not address-locked.
     */
    public function addressAllowed(Request $request, User $user): bool
    {
        $addresses = $this->allowedAddresses($user);
        if ($addresses === null) {
            return true;
        }

        $ip = $request->ip();

        return $ip !== null && $addresses !== [] && IpUtils::checkIp($ip, $addresses);
    }

    /**
     * Device binding at sign-in, after the password was accepted. A device registered to another
     * bound person cannot be used with this account. A bound user needs this browser to be their
     * registered device, or a usable registration code, which is held in the session until the
     * sign-in completes (after the MFA step, when there is one).
     *
     * @throws ApiException|ValidationException When this device may not be used with this account.
     */
    public function checkSignIn(Request $request, User $user, ?string $code): void
    {
        if (! $this->addressAllowed($request, $user)) {
            $this->audit->record('device.address_refused', AuditOutcome::Denied, targets: ['user' => $user->id], reason: 'Sign-in from a network address this account is not allowed to use.');

            throw ApiException::addressNotAllowed();
        }

        $other = $this->registeredToOther($request, $user);
        if ($other !== null) {
            $this->audit->record('device.other_account_refused', AuditOutcome::Denied, targets: ['user' => $user->id, 'device' => $other->id], reason: 'Sign-in on a device registered to another person.', metadata: [
                'device' => $other->name,
            ]);

            throw ApiException::deviceBelongsToOther();
        }

        if ($request->hasSession()) {
            $request->session()->forget(self::CODE_SESSION_KEY);
        }
        if (! $this->isBound($user) || $this->find($request, $user)?->isRegistered()) {
            return;
        }

        $code = $code === null ? '' : self::normalizeCode($code);
        if ($code === '') {
            $this->audit->record('device.registration_required', AuditOutcome::Denied, targets: ['user' => $user->id], reason: 'Sign-in on a device that is not registered to this account.', metadata: [
                'device' => self::describeUserAgent($request->userAgent()),
            ]);

            throw ApiException::deviceRegistrationRequired();
        }

        $throttleKey = 'device-code:'.$user->id;
        if (RateLimiter::tooManyAttempts($throttleKey, self::CODE_MAX_ATTEMPTS)) {
            throw new ApiException(429, 'too_many_requests', 'Too many incorrect registration codes. Try again in '.ceil(RateLimiter::availableIn($throttleKey) / 60).' minute(s).');
        }

        $found = DeviceRegistrationCode::query()->where('user_id', $user->id)->usable()->where('code_hash', hash('sha256', $code))->first();
        if ($found === null) {
            RateLimiter::hit($throttleKey, self::CODE_DECAY_SECONDS);
            $this->audit->record('device.registration_code_rejected', AuditOutcome::Failure, targets: ['user' => $user->id], reason: 'Registration code not valid, used or expired.');

            throw ValidationException::withMessages(['device_code' => 'That registration code is not valid, has been used or has expired.']);
        }

        RateLimiter::clear($throttleKey);
        if ($request->hasSession()) {
            $request->session()->put(self::CODE_SESSION_KEY, $found->id);
        }
    }

    /**
     * Create a one-time registration code for a person, replacing any unused one. The code is
     * returned only here; only its hash is stored.
     *
     * @return array{code: string, expires_at: CarbonInterface}
     */
    public function issueCode(User $user, ?User $actor, string $channel = 'web'): array
    {
        return DB::transaction(function () use ($user, $actor, $channel): array {
            DeviceRegistrationCode::query()->where('user_id', $user->id)->usable()->update(['cancelled_at' => now()]);

            $code = '';
            for ($i = 0; $i < self::CODE_LENGTH; $i++) {
                $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
            }
            $expiresAt = now()->addHours((int) config('lockguard.devices.registration_code_hours'));

            DeviceRegistrationCode::query()->create([
                'user_id' => $user->id,
                'code_hash' => hash('sha256', $code),
                'created_by' => $actor?->id,
                'expires_at' => $expiresAt,
            ]);

            $this->audit->record('device.registration_code_created', AuditOutcome::Success, actor: $actor, targets: ['user' => $user->id], metadata: [
                'expires_at' => $expiresAt->toIso8601ZuluString(),
                'channel' => $channel,
            ]);

            return ['code' => substr($code, 0, 4).'-'.substr($code, 4), 'expires_at' => $expiresAt];
        });
    }

    /**
     * When the person's unused registration code expires, or null when they have none.
     */
    public function pendingCodeExpiry(User $user): ?CarbonInterface
    {
        return DeviceRegistrationCode::query()->where('user_id', $user->id)->usable()->latest('id')->value('expires_at');
    }

    /**
     * Record that the user signed in on this browser: the existing device, or a new one. Sets the
     * cookie and binds the session to the device. Never call it for a revoked device. A bound user
     * gets their registered device, or registers this one with the code checkSignIn accepted.
     *
     * @return array{device: UserDevice, new: bool, first_for_account: bool}
     */
    public function register(Request $request, User $user): array
    {
        $codeId = $request->hasSession() ? $request->session()->pull(self::CODE_SESSION_KEY) : null;
        if ($this->isBound($user)) {
            if ($codeId !== null) {
                return $this->redeem($request, $user, (int) $codeId);
            }
            if (! $this->find($request, $user)?->isRegistered()) {
                throw ApiException::deviceRegistrationRequired();
            }
        }

        $existing = $this->find($request, $user);
        if ($existing !== null) {
            $existing->forceFill([
                'last_seen_at' => now(),
                'last_ip_address' => $request->ip(),
                'user_agent' => self::limitUserAgent($request->userAgent()),
            ])->save();
            $this->bind($request, $existing, $this->token($request));

            return ['device' => $existing, 'new' => false, 'first_for_account' => false];
        }

        // Keep the browser's token when it already has one (another account signed in here).
        $token = $this->token($request) ?? Str::random(64);
        $firstForAccount = ! $user->devices()->exists();
        $device = $user->devices()->create([
            'public_id' => (string) Str::uuid(),
            'token_hash' => hash('sha256', $token),
            'name' => Str::limit(self::describeUserAgent($request->userAgent()) ?? 'Unknown browser', 80, ''),
            'status' => DeviceStatus::Recognized,
            'user_agent' => self::limitUserAgent($request->userAgent()),
            'last_ip_address' => $request->ip(),
            'first_seen_at' => now(),
            'last_seen_at' => now(),
        ]);
        $this->bind($request, $device, $token);

        return ['device' => $device, 'new' => true, 'first_for_account' => $firstForAccount];
    }

    /**
     * The device this session signed in on. Sessions from before devices were recorded get one now,
     * except for bound users, who only ever get their registered device.
     */
    public function current(Request $request, User $user): ?UserDevice
    {
        if (! $request->hasSession()) {
            return null;
        }

        $id = $request->session()->get(self::SESSION_KEY);
        if ($id === null && $this->isBound($user)) {
            return $this->find($request, $user);
        }
        if ($id === null) {
            $found = $this->find($request, $user);

            return $found?->isRevoked() ? $found : $this->register($request, $user)['device'];
        }

        $device = $user->devices()->whereKey($id)->first();
        if ($device !== null && ! $device->isRevoked() && $device->last_seen_at->lt(now()->subSeconds(self::TOUCH_SECONDS))) {
            $device->forceFill(['last_seen_at' => now(), 'last_ip_address' => $request->ip()])->save();
        }

        return $device;
    }

    /**
     * Revoke a device: it cannot sign in or make requests again, and its session ends on its next
     * request. A lost device also ends every session and API token of the account at once, since a
     * lost phone may hold other sign-ins; when its owner reports it, the session they report it
     * from ($keepSessionId) stays signed in.
     *
     * @return array{browser_logins: int, api_clients: int}|null What was signed out for a lost device.
     */
    public function revoke(UserDevice $device, User $actor, string $reason, bool $lost, ?string $keepSessionId = null): ?array
    {
        return DB::transaction(function () use ($device, $actor, $reason, $lost, $keepSessionId): ?array {
            $device->forceFill([
                'status' => DeviceStatus::Revoked,
                'revoked_at' => now(),
                'revoked_by' => $actor->id,
                'revoke_reason' => $reason,
                'reported_lost' => $lost,
            ])->save();

            $signedOut = match (true) {
                ! $lost => null,
                $keepSessionId !== null => $this->sessions->revokeOthers($device->user, $keepSessionId),
                default => $this->sessions->revokeAll($device->user),
            };

            $this->audit->record($lost ? 'device.reported_lost' : 'device.revoked', AuditOutcome::Success, actor: $actor, targets: [
                'user' => $device->user_id,
                'device' => $device->id,
            ], reason: $reason, metadata: array_filter([
                'device' => $device->name,
                'signed_out' => $signedOut,
            ], fn ($value): bool => $value !== null));

            return $signedOut;
        });
    }

    /**
     * Trust a device, so it may be required for unlocking.
     */
    public function trust(UserDevice $device, User $actor): void
    {
        DB::transaction(function () use ($device, $actor): void {
            $device->forceFill(['status' => DeviceStatus::Trusted, 'trusted_at' => now(), 'trusted_by' => $actor->id])->save();
            $this->audit->record('device.trusted', AuditOutcome::Success, actor: $actor, targets: [
                'user' => $device->user_id,
                'device' => $device->id,
            ], metadata: ['device' => $device->name]);
        });
    }

    public function rename(UserDevice $device, User $actor, string $name): void
    {
        DB::transaction(function () use ($device, $actor, $name): void {
            $from = $device->name;
            $device->forceFill(['name' => $name])->save();
            $this->audit->record('device.renamed', AuditOutcome::Success, actor: $actor, targets: [
                'user' => $device->user_id,
                'device' => $device->id,
            ], metadata: ['from' => $from, 'to' => $name]);
        });
    }

    /**
     * "Chrome on Android" from a user agent, or null when it is not recognized.
     */
    public static function describeUserAgent(?string $userAgent): ?string
    {
        if ($userAgent === null || $userAgent === '') {
            return null;
        }

        $browser = match (true) {
            str_contains($userAgent, 'Edg/') => 'Edge',
            str_contains($userAgent, 'Firefox/') || str_contains($userAgent, 'FxiOS/') => 'Firefox',
            str_contains($userAgent, 'CriOS/') || str_contains($userAgent, 'Chrome/') => 'Chrome',
            str_contains($userAgent, 'Safari/') => 'Safari',
            default => null,
        };
        $system = match (true) {
            str_contains($userAgent, 'iPhone') || str_contains($userAgent, 'iPad') => 'iOS',
            str_contains($userAgent, 'Android') => 'Android',
            str_contains($userAgent, 'Windows') => 'Windows',
            str_contains($userAgent, 'Mac OS X') => 'macOS',
            str_contains($userAgent, 'Linux') => 'Linux',
            default => null,
        };

        return match (true) {
            $browser !== null && $system !== null => "{$browser} on {$system}",
            default => $browser ?? $system,
        };
    }

    /**
     * Register this browser as the user's one device with a code: every earlier device of theirs
     * is revoked, the code is used up, and the browser gets a fresh token of its own.
     *
     * @return array{device: UserDevice, new: bool, first_for_account: bool}
     */
    private function redeem(Request $request, User $user, int $codeId): array
    {
        return DB::transaction(function () use ($request, $user, $codeId): array {
            $code = DeviceRegistrationCode::query()->whereKey($codeId)->where('user_id', $user->id)->usable()->lockForUpdate()->first()
                ?? throw new ApiException(409, 'device_code_expired', 'The registration code expired or was already used. Ask your administrator for a new one.');

            $replaced = $user->devices()->where('status', '!=', DeviceStatus::Revoked->value)->get();
            foreach ($replaced as $old) {
                $old->forceFill([
                    'status' => DeviceStatus::Revoked,
                    'revoked_at' => now(),
                    'revoked_by' => $code->created_by,
                    'revoke_reason' => 'Replaced by a newly registered device.',
                ])->save();
            }

            $token = Str::random(64);
            $device = $user->devices()->create([
                'public_id' => (string) Str::uuid(),
                'token_hash' => hash('sha256', $token),
                'name' => Str::limit(self::describeUserAgent($request->userAgent()) ?? 'Unknown browser', 80, ''),
                'status' => DeviceStatus::Recognized,
                'user_agent' => self::limitUserAgent($request->userAgent()),
                'last_ip_address' => $request->ip(),
                'first_seen_at' => now(),
                'last_seen_at' => now(),
                'registered_at' => now(),
            ]);
            $code->forceFill(['used_at' => now(), 'user_device_id' => $device->id])->save();

            $this->audit->record('device.registered', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id, 'device' => $device->id], metadata: array_filter([
                'device' => $device->name,
                'replaced' => $replaced->pluck('name')->all() ?: null,
            ]));

            $this->bind($request, $device, $token);

            // An administrator sanctioned this device, so it is not reported as a surprise new sign-in.
            return ['device' => $device, 'new' => true, 'first_for_account' => true];
        });
    }

    /**
     * The device this browser's cookie identifies when it is registered to another bound person.
     */
    private function registeredToOther(Request $request, User $user): ?UserDevice
    {
        $token = $this->token($request);
        if ($token === null) {
            return null;
        }

        $device = UserDevice::query()
            ->with('user.roles')
            ->where('token_hash', hash('sha256', $token))
            ->where('user_id', '!=', $user->id)
            ->whereNotNull('registered_at')
            ->where('status', '!=', DeviceStatus::Revoked->value)
            ->first();

        return $device !== null && $this->isBound($device->user) ? $device : null;
    }

    /**
     * A code as typed: upper case, without spaces or dashes.
     */
    private static function normalizeCode(string $code): string
    {
        return strtoupper((string) preg_replace('/[\s-]+/', '', $code));
    }

    /**
     * The cookie token, when it looks like one LockGuard issued.
     */
    private function token(Request $request): ?string
    {
        $token = $request->cookie((string) config('lockguard.devices.cookie'));

        return is_string($token) && preg_match('/^[A-Za-z0-9]{64}$/', $token) === 1 ? $token : null;
    }

    private function bind(Request $request, UserDevice $device, ?string $token): void
    {
        if ($request->hasSession()) {
            $request->session()->put(self::SESSION_KEY, $device->id);
        }
        if ($token !== null) {
            Cookie::queue(Cookie::make(
                (string) config('lockguard.devices.cookie'),
                $token,
                (int) config('lockguard.devices.cookie_days') * 24 * 60,
                secure: config('session.secure'),
                httpOnly: true,
                sameSite: 'lax',
            ));
        }
    }

    private static function limitUserAgent(?string $userAgent): ?string
    {
        return $userAgent === null ? null : Str::limit($userAgent, 252, '...');
    }
}
