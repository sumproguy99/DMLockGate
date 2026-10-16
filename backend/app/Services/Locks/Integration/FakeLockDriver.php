<?php

namespace App\Services\Locks\Integration;

use App\Enums\LockAction;
use App\Enums\ReportedLockState;
use App\Models\Lock;
use Carbon\CarbonImmutable;

/**
 * An in-memory simulated lock for tests and local development. Never moves real hardware.
 *
 * By default a command changes the simulated state immediately. Tests can make the next send fail
 * (`failNextSendWith`) or make the lock ignore commands (`ignoreCommands`).
 */
class FakeLockDriver implements LockDriver
{
    /** @var array<string, ReportedLockState> */
    private array $states = [];

    /** @var list<array{lock: string, action: LockAction, command_id: string}> */
    public array $sent = [];

    private ?\Throwable $nextSendFailure = null;

    private bool $ignoreCommands = false;

    public function setState(Lock $lock, ReportedLockState $state): void
    {
        $this->states[$lock->external_id] = $state;
    }

    public function failNextSendWith(\Throwable $exception): void
    {
        $this->nextSendFailure = $exception;
    }

    public function ignoreCommands(bool $ignore = true): void
    {
        $this->ignoreCommands = $ignore;
    }

    public function send(Lock $lock, LockAction $action, string $commandId): void
    {
        if ($this->nextSendFailure !== null) {
            [$failure, $this->nextSendFailure] = [$this->nextSendFailure, null];
            if ($failure instanceof IntegrationOutcomeUnknown && ! $this->ignoreCommands) {
                // The ambiguous case: the command did reach the lock even though the call failed.
                $this->states[$lock->external_id] = $action->expectedState();
            }

            throw $failure;
        }

        $this->sent[] = ['lock' => $lock->external_id, 'action' => $action, 'command_id' => $commandId];

        if (! $this->ignoreCommands) {
            $this->states[$lock->external_id] = $action->expectedState();
        }
    }

    public function readState(Lock $lock): ReportedState
    {
        return new ReportedState($this->states[$lock->external_id] ?? ReportedLockState::Unknown, CarbonImmutable::now(), 90);
    }
}
