<?php

namespace App\Console\Commands;

use App\Enums\AlertStatus;
use App\Enums\AuditOutcome;
use App\Enums\IncidentStatus;
use App\Models\NotificationDelivery;
use App\Models\SecurityAlert;
use App\Models\SecurityIncident;
use App\Services\Audit\AuditLogger;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Deletes finished security records past their retention period (config lockguard.retention):
 * closed incidents (their timeline goes with them), resolved alerts outside any incident, in-app
 * notifications, and the alert email delivery log. Open work is never deleted, and the audit log,
 * the lasting record, is not touched. Incidents go first, so their alerts can go in the same run.
 */
#[Signature('lockguard:prune-security')]
#[Description('Delete old resolved alerts, closed incidents, notifications and email deliveries (scheduled daily)')]
class PruneSecurityRecordsCommand extends Command
{
    public function handle(AuditLogger $audit): int
    {
        $deleted = [
            'incidents' => $this->prune('closed_incidents_days', fn (Carbon $before): int => SecurityIncident::query()
                ->where('status', IncidentStatus::Closed)
                ->where('closed_at', '<', $before)
                ->delete()),
            'alerts' => $this->prune('resolved_alerts_days', fn (Carbon $before): int => SecurityAlert::query()
                ->where('status', AlertStatus::Resolved)
                ->whereNull('security_incident_id')
                ->where('resolved_at', '<', $before)
                ->delete()),
            'read_notifications' => $this->prune('read_notifications_days', fn (Carbon $before): int => DB::table('notifications')
                ->whereNotNull('read_at')
                ->where('created_at', '<', $before)
                ->delete()),
            'unread_notifications' => $this->prune('unread_notifications_days', fn (Carbon $before): int => DB::table('notifications')
                ->whereNull('read_at')
                ->where('created_at', '<', $before)
                ->delete()),
            'deliveries' => $this->prune('deliveries_days', fn (Carbon $before): int => NotificationDelivery::query()
                ->where('created_at', '<', $before)
                ->delete()),
        ];

        if (array_sum($deleted) > 0) {
            $audit->record('security.pruned', AuditOutcome::Success, reason: 'Finished alerts, incidents and notifications past their retention period deleted.', metadata: [
                'deleted' => $deleted,
                'retention_days' => config('lockguard.retention'),
            ]);
        }

        $this->components->info(sprintf(
            'Deleted %d incident(s), %d alert(s), %d read and %d unread notification(s), and %d email delivery record(s).',
            ...array_values($deleted),
        ));

        return self::SUCCESS;
    }

    /**
     * @param  callable(Carbon): int  $delete
     */
    private function prune(string $setting, callable $delete): int
    {
        $days = (int) config("lockguard.retention.{$setting}");

        return $days > 0 ? $delete(now()->subDays($days)) : 0;
    }
}
