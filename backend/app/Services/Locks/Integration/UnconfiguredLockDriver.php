<?php

namespace App\Services\Locks\Integration;

use App\Enums\LockAction;
use App\Models\Lock;

/**
 * The default when no integration is configured: every call fails safely, nothing is sent.
 */
class UnconfiguredLockDriver implements LockDriver
{
    public function send(Lock $lock, LockAction $action, string $commandId): void
    {
        throw new IntegrationUnavailable('No lock integration is configured (LOCKGUARD_LOCK_DRIVER).');
    }

    public function readState(Lock $lock): ReportedState
    {
        throw new IntegrationUnavailable('No lock integration is configured (LOCKGUARD_LOCK_DRIVER).');
    }
}
