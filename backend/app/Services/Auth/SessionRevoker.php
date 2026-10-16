<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Ends every session and API token of a user, for suspension and revocation.
 *
 * EnsureAccountIsActive already rejects an inactive account's next request; this removes the
 * sessions themselves so nothing is left to replay if the account is later reactivated.
 */
class SessionRevoker
{
    /**
     * @return array{browser_logins: int, api_clients: int}
     */
    public function revokeAll(User $user): array
    {
        $sessions = config('session.driver') === 'database'
            ? DB::connection(config('session.connection'))
                ->table(config('session.table', 'sessions'))
                ->where('user_id', $user->getKey())
                ->delete()
            : 0;

        $tokens = $user->tokens()->delete();

        return ['browser_logins' => $sessions, 'api_clients' => $tokens];
    }
}
