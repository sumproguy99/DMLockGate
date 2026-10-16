<?php

namespace App\Jobs;

use App\Enums\AccessRequestStatus;
use App\Enums\AuditOutcome;
use App\Enums\LockConnectionStatus;
use App\Enums\ReportedLockState;
use App\Models\AccessRequest;
use App\Models\LockCommand;
use App\Models\LockStateEvent;
use App\Services\Audit\AuditLogger;
use App\Services\Locks\Integration\IntegrationUnavailable;
use App\Services\Locks\Integration\LockDriver;
use App\Services\Locks\LockStateRecorder;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Sleep;
use Throwable;

/**
 * Sends one authorized command to the lock and confirms it from the lock's reported state.
 *
 * Safety rules:
 *  - The request is claimed (QUEUED → SUBMITTED) in its own transaction BEFORE the integration is
 *    called, so a crash or a duplicate job can never send it twice.
 *  - An expired request is never sent.
 *  - The job runs once ($tries = 1). A command whose outcome is unclear becomes UNKNOWN_RESULT and
 *    is never retried automatically, because it may already have reached the lock.
 *  - Success is recorded only when the lock reports the expected state after submission.
 */
class SubmitLockCommand implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public readonly int $accessRequestId)
    {
        $this->timeout = (int) config('lockguard.locks.confirm_timeout_seconds') + 60;
    }

    public function handle(LockDriver $driver, LockStateRecorder $recorder, AuditLogger $audit): void
    {
        $request = $this->claim($audit);
        if ($request === null) {
            return;
        }

        $command = $request->command;
        $lock = $request->lock;

        $startedAt = hrtime(true);
        try {
            $driver->send($lock, $request->action, $request->public_id);
            $result = LockCommand::RESULT_ACKNOWLEDGED;
            $error = null;
        } catch (IntegrationUnavailable $exception) {
            $result = LockCommand::RESULT_REJECTED;
            $error = $exception->getMessage();
        } catch (Throwable $exception) {
            $result = LockCommand::RESULT_AMBIGUOUS;
            $error = $exception->getMessage();
        }

        $command->forceFill([
            'integration_result' => $result,
            'integration_responded_at' => now(),
            'integration_latency_ms' => intdiv(hrtime(true) - $startedAt, 1_000_000),
            'integration_error' => $error === null ? null : mb_substr($error, 0, 255),
        ])->save();

        if ($result === LockCommand::RESULT_REJECTED) {
            $recorder->recordError($lock, $error, LockConnectionStatus::Disconnected);
            $this->finish($request, AccessRequestStatus::Failed, $audit, 'lock.command_failed', AuditOutcome::Failure, $error);

            return;
        }

        $confirmingEvent = $this->awaitConfirmation($request, $command, $driver, $recorder);

        if ($confirmingEvent !== null) {
            $command->forceFill([
                'confirmation' => LockCommand::CONFIRMED,
                'confirmation_source' => $confirmingEvent->source,
                'confirmed_at' => $confirmingEvent->received_at,
                'confirming_state_event_id' => $confirmingEvent->id,
            ])->save();
            $this->finish($request, AccessRequestStatus::ConfirmedSuccess, $audit, 'lock.command_confirmed', AuditOutcome::Success, null, [
                'confirmation_source' => $confirmingEvent->source,
                'integration_result' => $result,
            ]);

            return;
        }

        $command->forceFill(['confirmation' => LockCommand::UNCONFIRMED])->save();
        $this->finish($request, AccessRequestStatus::UnknownResult, $audit, 'lock.command_unconfirmed', AuditOutcome::Failure,
            'The lock did not report the expected state within '.config('lockguard.locks.confirm_timeout_seconds').' seconds.', [
                'integration_result' => $result,
                'last_reported_state' => $lock->refresh()->last_reported_state->value,
            ]);
    }

    /**
     * The job crashed. A submitted command may have reached the lock, so it becomes UNKNOWN_RESULT.
     */
    public function failed(?Throwable $exception): void
    {
        $request = AccessRequest::query()->find($this->accessRequestId);
        if ($request === null || $request->status->isFinal()) {
            return;
        }

        $status = $request->status === AccessRequestStatus::Submitted ? AccessRequestStatus::UnknownResult : AccessRequestStatus::Failed;
        $this->finish($request, $status, app(AuditLogger::class), 'lock.command_failed', AuditOutcome::Failure, 'Command processing stopped unexpectedly: '.($exception?->getMessage() ?? 'unknown error'));
    }

    /**
     * Move the request from QUEUED to SUBMITTED, or expire it. Returns null when there is nothing to send.
     */
    private function claim(AuditLogger $audit): ?AccessRequest
    {
        return DB::transaction(function () use ($audit): ?AccessRequest {
            $request = AccessRequest::query()->whereKey($this->accessRequestId)->lockForUpdate()->first();
            if ($request === null || $request->status !== AccessRequestStatus::Queued) {
                return null;
            }

            if (now()->gte($request->expires_at)) {
                $this->finish($request, AccessRequestStatus::Expired, $audit, 'lock.command_expired', AuditOutcome::Failure, 'The request expired before it was sent. Nothing was sent to the lock.');

                return null;
            }

            $request->forceFill(['status' => AccessRequestStatus::Submitted])->save();
            $request->command->forceFill(['submitted_at' => now()])->save();

            return $request;
        });
    }

    /**
     * Wait for a push event or a fresh read showing the expected state. Returns the confirming event.
     *
     * A push confirms only if the lock both observed and delivered it after submission. Push events
     * arrive 2–5 s late, so one describing a manual operation just before the command could
     * otherwise be taken as the command's result. A genuine confirmation that the lock's clock
     * stamps a little early is ignored, and the next poll confirms instead.
     */
    private function awaitConfirmation(AccessRequest $request, LockCommand $command, LockDriver $driver, LockStateRecorder $recorder): ?LockStateEvent
    {
        $expected = $request->action->expectedState();
        $deadline = $command->submitted_at->copy()->addSeconds((int) config('lockguard.locks.confirm_timeout_seconds'));
        $pollSeconds = max(1, (int) config('lockguard.locks.confirm_poll_seconds'));

        while (true) {
            $pushed = LockStateEvent::query()
                ->where('lock_id', $request->lock_id)
                ->where('source', LockStateEvent::SOURCE_PUSH)
                ->where('state', $expected)
                ->where('received_at', '>=', $command->submitted_at)
                ->where('observed_at', '>=', $command->submitted_at)
                ->oldest('id')
                ->first();
            if ($pushed !== null) {
                return $pushed;
            }

            try {
                $event = $recorder->record($request->lock, $driver->readState($request->lock), LockStateEvent::SOURCE_POLL);
                if ($event->state === $expected) {
                    return $event;
                }
                if ($event->state === ReportedLockState::Jammed) {
                    return null;
                }
            } catch (IntegrationUnavailable $exception) {
                $recorder->recordError($request->lock, $exception->getMessage());
            }

            if (now()->gte($deadline)) {
                return null;
            }

            Sleep::for($pollSeconds)->seconds();
        }
    }

    /**
     * @param  array<string, mixed>  $metadata
     */
    private function finish(AccessRequest $request, AccessRequestStatus $status, AuditLogger $audit, string $action, AuditOutcome $outcome, ?string $reason, array $metadata = []): void
    {
        $request->forceFill(['status' => $status, 'completed_at' => now()])->save();

        $audit->record($action, $outcome, actor: $request->user, targets: ['user' => $request->user_id, 'lock' => $request->lock_id], reason: $reason, metadata: [
            'request_id' => $request->public_id,
            'action' => $request->action->value,
            'status' => $status->value,
            ...$metadata,
        ]);
    }
}
