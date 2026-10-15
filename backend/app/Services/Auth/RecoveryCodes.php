<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * One-time MFA recovery codes. Only keyed hashes are stored; the plain codes are shown once.
 */
class RecoveryCodes
{
    /**
     * Generate a fresh set, store their hashes on the user, and return the plain codes for one-time display.
     *
     * @return list<string>
     */
    public function regenerate(User $user): array
    {
        $codes = [];
        for ($i = 0; $i < (int) config('lockguard.auth.recovery_code_count'); $i++) {
            $codes[] = Str::upper(Str::random(5).'-'.Str::random(5));
        }

        $user->forceFill(['mfa_recovery_codes' => array_map($this->hash(...), $codes)])->save();

        return $codes;
    }

    /**
     * Consume a recovery code if it is valid. Each code works once.
     */
    public function consume(User $user, string $code): bool
    {
        $hash = $this->hash($code);

        return DB::transaction(function () use ($user, $hash): bool {
            $locked = User::query()->whereKey($user->getKey())->lockForUpdate()->firstOrFail();
            $remaining = $locked->mfa_recovery_codes ?? [];

            $index = array_search($hash, $remaining, true);
            if ($index === false) {
                return false;
            }

            unset($remaining[$index]);
            $locked->forceFill(['mfa_recovery_codes' => array_values($remaining)])->save();
            $user->setRawAttributes($locked->getAttributes(), true);

            return true;
        });
    }

    public function remaining(User $user): int
    {
        return count($user->mfa_recovery_codes ?? []);
    }

    private function hash(string $code): string
    {
        $normalized = Str::upper(preg_replace('/[\s-]+/', '', $code));

        return hash_hmac('sha256', $normalized, (string) config('app.key'));
    }
}
