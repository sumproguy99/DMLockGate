<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Security;

use App\Enums\AlertRule;
use App\Enums\AlertSeverity;
use App\Enums\AlertStatus;
use App\Enums\IncidentStatus;
use App\Enums\RoleTemplate;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\SecurityAlert;
use App\Models\SecurityIncident;
use App\Models\User;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Security Center alerts and incidents: listing and filtering, acknowledging and resolving alerts,
 * opening incidents and moving them through their lifecycle with a recorded history.
 */
class SecurityCenterTest extends TestCase
{
    use RefreshDatabase;

    private User $handler;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
        $this->handler = $this->userWithRole(RoleTemplate::SecurityAdministrator, ['name' => 'Sam Security']);
    }

    private function userWithRole(RoleTemplate $template, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    public function test_alerts_are_listed_newest_first_and_filtered(): void
    {
        $old = SecurityAlert::factory()->create(['title' => 'Old one', 'last_seen_at' => now()->subHour(), 'severity' => AlertSeverity::Low]);
        $resolved = SecurityAlert::factory()->create(['title' => 'Done', 'status' => AlertStatus::Resolved, 'resolved_at' => now()]);
        $high = SecurityAlert::factory()->create(['title' => 'Bridge down', 'severity' => AlertSeverity::High, 'rule' => AlertRule::IntegrationUnavailable]);

        $this->actingAs($this->handler)->getJson('/api/v1/security/alerts')
            ->assertOk()
            ->assertJsonPath('data.0.id', $this->latestOf([$resolved, $high]))
            ->assertJsonCount(3, 'data');

        $active = $this->getJson('/api/v1/security/alerts?status=active')->assertOk()->json('data.*.id');
        $this->assertEqualsCanonicalizing([$old->public_id, $high->public_id], $active);

        $this->getJson('/api/v1/security/alerts?severity=medium')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/security/alerts?search=bridge')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.rule_label', 'Lock integration unavailable')
            ->assertJsonPath('data.0.is_condition', true);
    }

    /**
     * @param  list<SecurityAlert>  $alerts
     */
    private function latestOf(array $alerts): string
    {
        return collect($alerts)->sortByDesc(fn (SecurityAlert $alert) => [$alert->last_seen_at->getTimestamp(), $alert->id])->first()->public_id;
    }

    public function test_acknowledging_an_alert_records_who_and_is_audited(): void
    {
        $alert = SecurityAlert::factory()->create();

        $this->actingAs($this->handler)->postJson("/api/v1/security/alerts/{$alert->public_id}/acknowledge")
            ->assertOk()
            ->assertJsonPath('data.status', 'acknowledged')
            ->assertJsonPath('data.acknowledged_by.name', 'Sam Security');

        $this->postJson("/api/v1/security/alerts/{$alert->public_id}/acknowledge")
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'alert_not_open');

        $this->assertSame(1, AuditLog::query()->where('action', 'security.alert_acknowledged')->where('actor_user_id', $this->handler->id)->count());
    }

    public function test_resolving_an_event_alert_keeps_the_note(): void
    {
        $alert = SecurityAlert::factory()->create();

        $this->actingAs($this->handler)->postJson("/api/v1/security/alerts/{$alert->public_id}/resolve", ['note' => 'It was me testing.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'resolved')
            ->assertJsonPath('data.resolution', 'manual')
            ->assertJsonPath('data.resolution_note', 'It was me testing.')
            ->assertJsonPath('data.resolved_by.name', 'Sam Security');

        $this->assertSame('It was me testing.', AuditLog::query()->where('action', 'security.alert_resolved')->value('reason'));
    }

    public function test_condition_alerts_cannot_be_resolved_by_hand(): void
    {
        $alert = SecurityAlert::factory()->create(['rule' => AlertRule::LockOffline]);

        $this->actingAs($this->handler)->postJson("/api/v1/security/alerts/{$alert->public_id}/resolve")
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'alert_resolves_itself');
    }

    public function test_an_auditor_can_look_but_not_act(): void
    {
        $auditor = $this->userWithRole(RoleTemplate::ReadOnlyAuditor);
        $alert = SecurityAlert::factory()->create();

        $this->actingAs($auditor)->getJson("/api/v1/security/alerts/{$alert->public_id}")->assertOk();
        $this->postJson("/api/v1/security/alerts/{$alert->public_id}/acknowledge")->assertForbidden();
        $this->postJson('/api/v1/security/incidents', ['title' => 'Nope', 'severity' => 'low'])->assertForbidden();

        $this->assertSame(AlertStatus::Open, $alert->refresh()->status);
        $this->assertSame(1, AuditLog::query()->where('action', 'security.alert_acknowledged')->where('outcome', 'denied')->count());
    }

    public function test_opening_an_incident_by_hand_attaches_the_alerts(): void
    {
        $alerts = SecurityAlert::factory()->count(2)->create();

        $response = $this->actingAs($this->handler)->postJson('/api/v1/security/incidents', [
            'title' => 'Someone trying the front door',
            'severity' => 'high',
            'description' => 'Denied requests and failed sign-ins at night.',
            'alert_ids' => $alerts->pluck('public_id')->all(),
        ])->assertCreated();

        $response->assertJsonPath('data.status', 'new')
            ->assertJsonPath('data.opened_by.name', 'Sam Security')
            ->assertJsonPath('data.alert_count', 2)
            ->assertJsonCount(2, 'data.alerts')
            ->assertJsonCount(3, 'data.history')
            ->assertJsonPath('data.history.0.actor.name', 'Sam Security');

        $this->assertSame(1, AuditLog::query()->where('action', 'security.incident_opened')->count());
    }

    public function test_unknown_alerts_are_refused_when_opening_an_incident(): void
    {
        $this->actingAs($this->handler)->postJson('/api/v1/security/incidents', [
            'title' => 'Test',
            'severity' => 'low',
            'alert_ids' => ['00000000-0000-4000-8000-000000000000'],
        ])->assertStatus(422);

        $this->assertSame(0, SecurityIncident::query()->count());
    }

    public function test_an_incident_moves_through_its_lifecycle_with_history(): void
    {
        $incident = SecurityIncident::factory()->create();
        $eventAlert = SecurityAlert::factory()->create(['security_incident_id' => $incident->id]);
        $conditionAlert = SecurityAlert::factory()->create(['security_incident_id' => $incident->id, 'rule' => AlertRule::LockOffline]);

        $this->actingAs($this->handler);
        foreach (['acknowledged', 'investigating', 'contained'] as $status) {
            $this->postJson("/api/v1/security/incidents/{$incident->public_id}/status", ['status' => $status])->assertOk()->assertJsonPath('data.status', $status);
        }
        $this->postJson("/api/v1/security/incidents/{$incident->public_id}/status", ['status' => 'resolved', 'note' => 'Batteries replaced.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'resolved')
            ->assertJsonPath('data.history.3.from_status', 'contained')
            ->assertJsonPath('data.history.3.to_status', 'resolved')
            ->assertJsonPath('data.history.3.note', 'Batteries replaced.')
            ->assertJsonPath('data.history.3.actor.name', 'Sam Security');

        $this->assertNotNull($incident->refresh()->resolved_at);
        $this->assertSame(AlertStatus::Resolved, $eventAlert->refresh()->status);
        $this->assertSame(SecurityAlert::RESOLUTION_INCIDENT, $eventAlert->resolution);
        $this->assertSame(AlertStatus::Open, $conditionAlert->refresh()->status, 'Condition alerts clear themselves.');
        $this->assertSame(4, AuditLog::query()->where('action', 'security.incident_status_changed')->count());
    }

    public function test_a_closed_incident_is_final(): void
    {
        $incident = SecurityIncident::factory()->create(['status' => IncidentStatus::Closed, 'closed_at' => now()]);

        $this->actingAs($this->handler)->postJson("/api/v1/security/incidents/{$incident->public_id}/status", ['status' => 'investigating'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'incident_closed');
    }

    public function test_the_same_status_is_refused(): void
    {
        $incident = SecurityIncident::factory()->create();

        $this->actingAs($this->handler)->postJson("/api/v1/security/incidents/{$incident->public_id}/status", ['status' => 'new'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'incident_status_unchanged');
    }

    public function test_incidents_are_listed_and_filtered(): void
    {
        SecurityIncident::factory()->create(['status' => IncidentStatus::Closed, 'severity' => AlertSeverity::Low]);
        $open = SecurityIncident::factory()->create(['status' => IncidentStatus::Investigating, 'severity' => AlertSeverity::Critical]);

        $this->actingAs($this->handler)->getJson('/api/v1/security/incidents')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/security/incidents?status=active')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $open->public_id);
        $this->getJson('/api/v1/security/incidents?severity=high')->assertOk()->assertJsonCount(1, 'data');
    }
}
