<?php

namespace App\Console\Commands;

use App\Enums\AuditOutcome;
use App\Models\LocationReport;
use App\Models\LocationRequest;
use App\Services\Audit\AuditLogger;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Deletes location reports and location requests older than the retention period (project.md 20:
 * detailed location history is not kept indefinitely). Lock requests themselves are kept, without
 * their position.
 */
#[Signature('lockguard:prune-locations')]
#[Description('Delete location reports and requests older than LOCKGUARD_LOCATION_RETENTION_DAYS (scheduled daily)')]
class PruneLocationsCommand extends Command
{
    public function handle(AuditLogger $audit): int
    {
        $days = (int) config('lockguard.location.retention_days');
        $before = now()->subDays($days);

        $reports = LocationReport::query()->where('received_at', '<', $before)->delete();
        $requests = LocationRequest::query()->where('requested_at', '<', $before)->delete();

        if ($reports > 0 || $requests > 0) {
            $audit->record('location.pruned', AuditOutcome::Success, reason: "Location records older than {$days} days deleted by the retention policy.", metadata: [
                'reports' => $reports,
                'requests' => $requests,
            ]);
        }

        $this->components->info("Deleted {$reports} location report(s) and {$requests} location request(s) older than {$days} days.");

        return self::SUCCESS;
    }
}
