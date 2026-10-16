<?php

namespace App\Services\Locks\Integration;

use App\Enums\LockAction;
use App\Models\Lock;

/**
 * The boundary between LockGuard and a lock vendor. Only the lock command service and the state
 * synchronization use it; nothing else may talk to a lock.
 */
interface LockDriver
{
    /**
     * Send one command, exactly once. Returning normally means the integration acknowledged
     * DELIVERY only; it is never proof that the bolt moved.
     *
     * @throws IntegrationUnavailable when the command was certainly not delivered.
     * @throws IntegrationOutcomeUnknown when the command may or may not have reached the lock.
     */
    public function send(Lock $lock, LockAction $action, string $commandId): void;

    /**
     * Read the state the lock currently reports (a fresh read, not a cached guess).
     *
     * @throws IntegrationUnavailable
     */
    public function readState(Lock $lock): ReportedState;
}
