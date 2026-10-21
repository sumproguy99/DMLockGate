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

];
