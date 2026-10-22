<?php

namespace App\Console\Commands;

use App\Services\Security\AlertEngine;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Runs the alert engine's condition rules (locks offline, jammed or unconfirmed, low batteries, the
 * integration, the audit trail) and resolves alerts whose cause has cleared. Scheduled every minute.
 * Sends nothing to any lock.
 */
#[Signature('lockguard:check-alerts')]
#[Description('Check locks, the integration and the audit trail for alert conditions')]
class CheckAlertsCommand extends Command
{
    public function handle(AlertEngine $engine): int
    {
        $result = $engine->checkConditions();

        $this->components->info("{$result['raised']} condition(s) present, {$result['resolved']} alert(s) resolved.");

        return self::SUCCESS;
    }
}
