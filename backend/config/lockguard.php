<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Authentication
    |--------------------------------------------------------------------------
    |
    | step_up_seconds: how long after a password (and MFA) confirmation a user may
    | perform sensitive actions before being asked to confirm again.
    |
    | mfa_issuer: the name shown in authenticator apps next to the account.
    |
    */

    'auth' => [
        'step_up_seconds' => (int) env('LOCKGUARD_STEP_UP_SECONDS', 600),
        'mfa_issuer' => env('LOCKGUARD_MFA_ISSUER', 'DM LockGuard'),
        'recovery_code_count' => 8,
    ],

    /*
    |--------------------------------------------------------------------------
    | Locks and the command service
    |--------------------------------------------------------------------------
    |
    | driver: 'unconfigured' (default; every command fails safely), 'fake' (simulated
    | lock for tests and development only) or 'eufy_bridge'.
    |
    | request_ttl_seconds: an authorized request not yet sent to the lock within this time
    | expires and is never sent. Nothing is ever queued for execution later.
    |
    | confirm_timeout_seconds / confirm_poll_seconds: how long to wait for the lock to report
    | the new state, and how often to re-read it. No confirmation means UNKNOWN_RESULT; the
    | command is never retried automatically.
    |
    | state_stale_seconds: a reported state older than this is shown as stale.
    |
    | poll_lag_seconds: Eufy's cloud copy of a lock's state trails the lock by a few seconds, so a
    | poll this soon after a push event from the lock does not override what the push reported.
    |
    | remote_unlock_policy: 'standard', 'step_up' (re-confirm identity first), 'location_required'
    | (rejected until location-aware access exists) or 'disabled'.
    |
    */

    'locks' => [
        'driver' => env('LOCKGUARD_LOCK_DRIVER', 'unconfigured'),
        'request_ttl_seconds' => (int) env('LOCKGUARD_COMMAND_TTL_SECONDS', 30),
        'confirm_timeout_seconds' => (int) env('LOCKGUARD_CONFIRM_TIMEOUT_SECONDS', 45),
        'confirm_poll_seconds' => (int) env('LOCKGUARD_CONFIRM_POLL_SECONDS', 5),
        'state_stale_seconds' => (int) env('LOCKGUARD_STATE_STALE_SECONDS', 900),
        'poll_lag_seconds' => (int) env('LOCKGUARD_POLL_LAG_SECONDS', 15),
        'remote_unlock_policy' => env('LOCKGUARD_REMOTE_UNLOCK_POLICY', 'step_up'),

        /*
        | The Node.js Eufy bridge (integrations/eufy, `npm run bridge`). Both directions are signed with
        | the shared secret. send_timeout must exceed the bridge's own 25 s acknowledgement timeout.
        */
        'eufy_bridge' => [
            'url' => env('LOCKGUARD_BRIDGE_URL', 'http://127.0.0.1:8788'),
            'secret' => env('LOCKGUARD_BRIDGE_SECRET'),
            'connect_timeout_seconds' => 3,
            'send_timeout_seconds' => 30,
            'read_timeout_seconds' => 15,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Location
    |--------------------------------------------------------------------------
    |
    | notice_version: the location notice shown on the sign-in screen. Signing in is agreeing to it;
    | each sign-in records this version in the audit log. Change it when the notice text changes.
    |
    | retention_days: location reports and requests older than this are deleted daily.
    |
    | request_ttl_seconds: how long an administrator's location request waits for the phone. A phone
    | browser answers only while LockGuard is open there.
    |
    | max_fix_age_seconds: a reported position older than this, or this far in the future, is refused.
    |
    | lock_request_window_seconds: how long after a lock request its location may still be attached.
    |
    */

    'location' => [
        'notice_version' => '2026-10-21',
        'retention_days' => (int) env('LOCKGUARD_LOCATION_RETENTION_DAYS', 30),
        'request_ttl_seconds' => (int) env('LOCKGUARD_LOCATION_REQUEST_TTL_SECONDS', 120),
        'max_fix_age_seconds' => 120,
        'lock_request_window_seconds' => 300,
    ],

    /*
    |--------------------------------------------------------------------------
    | Security alerts and notifications
    |--------------------------------------------------------------------------
    |
    | Event rules raise an alert when `threshold` matching audit records fall within `window_minutes`
    | (failed sign-ins count per account, or per address when the account is unknown; denied requests
    | per person; command failures per lock). Each later match adds to the same alert.
    |
    | battery_low_percent / battery_critical_percent: the battery alert is Medium at or below the
    | first and High at or below the second.
    |
    | quiet_hours: an event alert with no new occurrences for this long is resolved automatically.
    |
    | reopen_minutes: a problem that comes back this soon after its alert was resolved reopens that
    | alert without notifying anyone again, so a flapping lock or bridge cannot flood people.
    |
    | notifications_per_hour: at most this many alert notifications per person per hour. Alerts past
    | the limit are still recorded and shown in the Security Center.
    |
    */

    'alerts' => [
        'failed_sign_ins' => [
            'threshold' => (int) env('LOCKGUARD_ALERT_FAILED_SIGN_INS', 5),
            'window_minutes' => (int) env('LOCKGUARD_ALERT_FAILED_SIGN_INS_MINUTES', 15),
        ],
        'denied_lock_requests' => [
            'threshold' => (int) env('LOCKGUARD_ALERT_DENIED_REQUESTS', 3),
            'window_minutes' => (int) env('LOCKGUARD_ALERT_DENIED_REQUESTS_MINUTES', 15),
        ],
        'lock_command_failures' => [
            'threshold' => (int) env('LOCKGUARD_ALERT_COMMAND_FAILURES', 3),
            'window_minutes' => (int) env('LOCKGUARD_ALERT_COMMAND_FAILURES_MINUTES', 30),
        ],
        'battery_low_percent' => (int) env('LOCKGUARD_ALERT_BATTERY_LOW_PERCENT', 25),
        'battery_critical_percent' => (int) env('LOCKGUARD_ALERT_BATTERY_CRITICAL_PERCENT', 10),
        'quiet_hours' => (int) env('LOCKGUARD_ALERT_QUIET_HOURS', 24),
        'reopen_minutes' => (int) env('LOCKGUARD_ALERT_REOPEN_MINUTES', 60),
        'notifications_per_hour' => (int) env('LOCKGUARD_NOTIFICATIONS_PER_HOUR', 20),
    ],

    /*
    |--------------------------------------------------------------------------
    | Devices
    |--------------------------------------------------------------------------
    |
    | Each browser that signs in is recognized by a random token in an HTTP-only cookie; only its
    | hash is stored. A revoked device's session ends on its next request, and it cannot sign in or
    | make lock requests again.
    |
    | cookie / cookie_days: the cookie's name and how long a browser stays recognized.
    |
    | unlock_requires_trusted: when true, unlocking is refused from a device the user has not
    | trusted. Off by default so existing users are not locked out; locking never needs it.
    |
    | binding: when true, every account except those holding an exempt role can only be used on
    | the one device it registered with a one-time code from an administrator. Signing in anywhere
    | else is refused, and a registered device cannot be used with any other account.
    |
    | exempt_roles: role keys that are not bound (administrators).
    |
    | address_accounts: accounts locked to network addresses instead of a registered device, for
    | unattended clients such as a kiosk that cannot enter a code. Such an account is not bound and
    | needs no code, but every sign-in and request (session or API token) from any other address is
    | refused. Format: email=address|address;email=address (addresses may be CIDR ranges).
    |
    | registration_code_hours: how long a registration code stays usable.
    |
    */

    'devices' => [
        'cookie' => env('LOCKGUARD_DEVICE_COOKIE', 'lockguard_device'),
        'cookie_days' => (int) env('LOCKGUARD_DEVICE_COOKIE_DAYS', 400),
        'unlock_requires_trusted' => (bool) env('LOCKGUARD_UNLOCK_REQUIRES_TRUSTED_DEVICE', false),
        'binding' => (bool) env('LOCKGUARD_DEVICE_BINDING', true),
        'exempt_roles' => array_values(array_filter(array_map('trim', explode(',', (string) env('LOCKGUARD_DEVICE_BINDING_EXEMPT_ROLES', 'super_administrator,security_administrator'))))),
        'address_accounts' => collect(explode(';', (string) env('LOCKGUARD_DEVICE_ADDRESS_ACCOUNTS', '')))
            ->map(fn (string $entry): array => array_map('trim', explode('=', $entry, 2)))
            ->filter(fn (array $pair): bool => count($pair) === 2 && $pair[0] !== '' && $pair[1] !== '')
            ->mapWithKeys(fn (array $pair): array => [strtolower($pair[0]) => array_values(array_filter(array_map('trim', explode('|', $pair[1]))))])
            ->all(),
        'registration_code_hours' => (int) env('LOCKGUARD_DEVICE_CODE_HOURS', 24),
    ],

    /*
    |--------------------------------------------------------------------------
    | Invitations
    |--------------------------------------------------------------------------
    |
    | public_url: the address people open from the invitation email, so it must work from their
    | phone (the public HTTPS address, never localhost). The link is {public_url}/invite/{token}.
    |
    | days: how long an invitation link works. The registration code it holds lasts as long, and
    | at least a day after the account is created.
    |
    | quiz_questions: how many questions the training quiz asks; every one must be answered right.
    |
    */

    'invitations' => [
        'public_url' => rtrim((string) env('LOCKGUARD_PUBLIC_URL', 'https://lockguard.dmfmedia.net'), '/'),
        'days' => (int) env('LOCKGUARD_INVITATION_DAYS', 7),
        'quiz_questions' => 5,
    ],

    /*
    |--------------------------------------------------------------------------
    | Trusted proxies
    |--------------------------------------------------------------------------
    |
    | Addresses whose X-Forwarded-For header is believed, so the audit log, sessions, alerts and
    | address-locked accounts see the visitor's real address rather than the proxy's. Only list
    | proxies you run (the Vite dev server on this machine by default); CIDR ranges allowed.
    |
    */

    'trusted_proxies' => array_values(array_filter(array_map('trim', explode(',', (string) env('LOCKGUARD_TRUSTED_PROXIES', '127.0.0.1,::1'))))),
];
