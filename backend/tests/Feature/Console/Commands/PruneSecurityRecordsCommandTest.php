<?php

namespace Tests\Feature\Console\Commands;

use App\Enums\AlertStatus;
use App\Enums\IncidentStatus;
use App\Models\AuditLog;
use App\Models\NotificationDelivery;
use App\Models\SecurityAlert;
use App\Models\SecurityIncident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class PruneSecurityRecordsCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['lockguard.retention' => [
            'resolved_alerts_days' => 180,
            'closed_incidents_days' => 365,
            'read_notifications_days' => 90,
            'unread_notifications_days' => 365,
            'deliveries_days' => 90,
        ]]);
    }

    private function resolvedAlert(int $daysAgo, ?SecurityIncident $incident = null): SecurityAlert
    {
        return SecurityAlert::factory()->create([
            'status' => AlertStatus::Resolved,
            'resolved_at' => now()->subDays($daysAgo),
            'security_incident_id' => $incident?->id,
        ]);
    }

    private function closedIncident(int $daysAgo): SecurityIncident
    {
        return SecurityIncident::factory()->create([
            'status' => IncidentStatus::Closed,
            'opened_at' => now()->subDays($daysAgo + 2),
            'resolved_at' => now()->subDays($daysAgo + 1),
            'closed_at' => now()->subDays($daysAgo),
        ]);
    }

    private function notification(User $user, int $daysAgo, bool $read): string
    {
        $id = (string) Str::uuid();
        DB::table('notifications')->insert([
            'id' => $id,
            'type' => 'security_alert',
            'notifiable_type' => $user->getMorphClass(),
            'notifiable_id' => $user->id,
            'data' => json_encode(['title' => 'Test']),
            'read_at' => $read ? now()->subDays($daysAgo) : null,
            'created_at' => now()->subDays($daysAgo),
            'updated_at' => now()->subDays($daysAgo),
        ]);

        return $id;
    }

    public function test_deletes_only_finished_records_past_their_retention_period(): void
    {
        $recentAlert = $this->resolvedAlert(179);
        $this->resolvedAlert(181);
        $openAlert = SecurityAlert::factory()->create(['status' => AlertStatus::Open, 'first_seen_at' => now()->subYears(2), 'last_seen_at' => now()->subYears(2)]);
        $acknowledged = SecurityAlert::factory()->create(['status' => AlertStatus::Acknowledged, 'acknowledged_at' => now()->subYears(2)]);

        $recentIncident = $this->closedIncident(364);
        $alertOfRecentIncident = $this->resolvedAlert(400, $recentIncident);
        $oldIncident = $this->closedIncident(366);
        $oldIncident->events()->create(['to_status' => 'closed', 'occurred_at' => now()->subDays(366)]);
        $alertOfOldIncident = $this->resolvedAlert(400, $oldIncident);
        $resolvedNotClosed = SecurityIncident::factory()->create(['status' => IncidentStatus::Resolved, 'opened_at' => now()->subYears(3), 'resolved_at' => now()->subYears(3)]);

        $user = User::factory()->create();
        $readRecent = $this->notification($user, 89, read: true);
        $this->notification($user, 91, read: true);
        $unreadKept = $this->notification($user, 91, read: false);
        $this->notification($user, 366, read: false);

        $deliveryKept = NotificationDelivery::factory()->create(['created_at' => now()->subDays(89)]);
        NotificationDelivery::factory()->create(['created_at' => now()->subDays(91)]);

        $this->artisan('lockguard:prune-security')->assertSuccessful();

        $this->assertEqualsCanonicalizing([$recentAlert->id, $openAlert->id, $acknowledged->id, $alertOfRecentIncident->id], SecurityAlert::query()->pluck('id')->all());
        $this->assertModelMissing($alertOfOldIncident);
        $this->assertEqualsCanonicalizing([$recentIncident->id, $resolvedNotClosed->id], SecurityIncident::query()->pluck('id')->all());
        $this->assertDatabaseMissing('security_incident_events', ['security_incident_id' => $oldIncident->id]);
        $this->assertEqualsCanonicalizing([$readRecent, $unreadKept], DB::table('notifications')->pluck('id')->all());
        $this->assertSame([$deliveryKept->id], NotificationDelivery::query()->pluck('id')->all());

        $audit = AuditLog::query()->where('action', 'security.pruned')->sole();
        $this->assertSame(['incidents' => 1, 'alerts' => 2, 'read_notifications' => 1, 'unread_notifications' => 1, 'deliveries' => 1], $audit->metadata['deleted']);
        $this->assertSame(180, $audit->metadata['retention_days']['resolved_alerts_days']);
    }

    public function test_zero_keeps_records_for_ever(): void
    {
        config(['lockguard.retention.resolved_alerts_days' => 0, 'lockguard.retention.deliveries_days' => 0]);
        $alert = $this->resolvedAlert(5000);
        $delivery = NotificationDelivery::factory()->create(['created_at' => now()->subYears(10)]);

        $this->artisan('lockguard:prune-security')->assertSuccessful();

        $this->assertModelExists($alert);
        $this->assertModelExists($delivery);
    }

    public function test_records_nothing_when_there_is_nothing_to_delete(): void
    {
        $this->artisan('lockguard:prune-security')->assertSuccessful();

        $this->assertDatabaseCount('audit_logs', 0);
    }
}
