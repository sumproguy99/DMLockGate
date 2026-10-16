<?php

namespace App\Console\Commands;

use App\Enums\AccessRequestStatus;
use App\Enums\AuditOutcome;
use App\Models\AccessRequest;
use App\Services\Audit\AuditLogger;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

#[Signature('lockguard:expire-commands')]
#[Description('Expire lock requests that were never sent, and close submitted ones whose worker stopped (scheduled every minute)')]
class ExpireLockCommandsCommand extends Command
{
    public function handle(AuditLogger $audit): int
    {
        $expired = $this->close(
            AccessRequest::query()->where('status', AccessRequestStatus::Queued)->where('expires_at', '<=', now()),
            AccessRequestStatus::Expired,
            'lock.command_expired',
            'The request expired before it was sent. Nothing was sent to the lock.',
            $audit,
        );

        // A submitted command whose job should long since have finished: the worker died mid-flight.
        $abandonedBefore = now()->subSeconds((int) config('lockguard.locks.confirm_timeout_seconds') + 120);
        $abandoned = $this->close(
            AccessRequest::query()->where('status', AccessRequestStatus::Submitted)->where('requested_at', '<=', $abandonedBefore),
            AccessRequestStatus::UnknownResult,
            'lock.command_unconfirmed',
            'Command processing stopped before the lock confirmed. The command may have reached the lock.',
            $audit,
        );

        $this->components->info("Expired {$expired} unsent request(s); closed {$abandoned} abandoned command(s) as unknown result.");

        return self::SUCCESS;
    }

    /**
     * @param  Builder<AccessRequest>  $query
     */
    private function close($query, AccessRequestStatus $to, string $action, string $reason, AuditLogger $audit): int
    {
        $count = 0;

        foreach ($query->pluck('id') as $id) {
            $closed = DB::transaction(function () use ($id, $to, $action, $reason, $audit): bool {
                $request = AccessRequest::query()->whereKey($id)->lockForUpdate()->first();
                if ($request === null || $request->status->isFinal()) {
                    return false;
                }

                $request->forceFill(['status' => $to, 'completed_at' => now()])->save();
                $audit->record($action, AuditOutcome::Failure, targets: ['user' => $request->user_id, 'lock' => $request->lock_id], reason: $reason, metadata: [
                    'request_id' => $request->public_id,
                    'status' => $to->value,
                ]);

                return true;
            });

            $count += (int) $closed;
        }

        return $count;
    }
}
