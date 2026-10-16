<?php

namespace App\Console\Commands;

use App\Enums\AuditOutcome;
use App\Models\Lock;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

use function Laravel\Prompts\confirm;

/**
 * Operator bootstrap for lock access. The API never lets anyone change their own access, so a
 * single-administrator household needs a path that requires being at the server. Like
 * lockguard:create-admin, it is audited with channel "console" and no acting user.
 */
#[Signature('lockguard:grant-lock-access {email : Sign-in email of the user} {lock : Lock ID} {--until= : Optional end of the access window} {--revoke : Remove the access instead}')]
#[Description('Give or remove one user\'s access to one lock from the server console (audited)')]
class GrantLockAccessCommand extends Command
{
    public function handle(AuditLogger $audit): int
    {
        $user = User::query()->where('email', $this->argument('email'))->first();
        if ($user === null) {
            $this->components->error('No user has that email address.');

            return self::FAILURE;
        }

        $lock = Lock::query()->find($this->argument('lock'));
        if ($lock === null) {
            $this->components->error('No lock has that ID.');

            return self::FAILURE;
        }

        return $this->option('revoke')
            ? $this->revoke($user, $lock, $audit)
            : $this->grant($user, $lock, $audit);
    }

    private function grant(User $user, Lock $lock, AuditLogger $audit): int
    {
        if (! $user->isActive()) {
            $this->components->error('That account is not active. Reactivate it before granting lock access.');

            return self::FAILURE;
        }

        $until = null;
        if ($this->option('until') !== null) {
            try {
                $until = Carbon::parse($this->option('until'));
            } catch (Throwable) {
                $this->components->error('--until is not a valid date.');

                return self::FAILURE;
            }

            if (! $until->isFuture()) {
                $this->components->error('--until must be in the future.');

                return self::FAILURE;
            }
        }

        $window = $until === null ? 'with no end date' : 'until '.$until->toDateTimeString();
        if (! confirm("Give {$user->email} access to \"{$lock->name}\" {$window}?", default: false)) {
            $this->components->warn('Nothing changed.');

            return self::FAILURE;
        }

        DB::transaction(function () use ($user, $lock, $until, $audit): void {
            $user->locks()->syncWithoutDetaching([$lock->id => ['valid_from' => null, 'valid_until' => $until, 'granted_by' => null]]);
            $audit->record('lock.access_granted', AuditOutcome::Success, targets: ['user' => $user->id, 'lock' => $lock->id], reason: 'Lock access granted from the server console.', metadata: [
                'valid_until' => $until?->toIso8601String(),
                'channel' => 'console',
            ]);
        });

        $this->components->info("{$user->email} now has access to \"{$lock->name}\". Their role permissions still decide what they may do with it.");

        return self::SUCCESS;
    }

    private function revoke(User $user, Lock $lock, AuditLogger $audit): int
    {
        if (! confirm("Remove {$user->email}'s access to \"{$lock->name}\"?", default: false)) {
            $this->components->warn('Nothing changed.');

            return self::FAILURE;
        }

        $removed = DB::transaction(function () use ($user, $lock, $audit): bool {
            if ($user->locks()->detach($lock->id) === 0) {
                return false;
            }
            $audit->record('lock.access_revoked', AuditOutcome::Success, targets: ['user' => $user->id, 'lock' => $lock->id], reason: 'Lock access removed from the server console.', metadata: ['channel' => 'console']);

            return true;
        });

        $removed
            ? $this->components->info("{$user->email} no longer has access to \"{$lock->name}\".")
            : $this->components->warn("{$user->email} did not have access to \"{$lock->name}\".");

        return self::SUCCESS;
    }
}
