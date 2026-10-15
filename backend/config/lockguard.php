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

];
