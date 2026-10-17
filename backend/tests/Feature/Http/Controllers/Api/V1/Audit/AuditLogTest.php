<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Audit;

use App\Enums\AuditOutcome;
use App\Enums\RoleTemplate;
use App\Models\AuditLog;
use App\Models\Lock;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The audit trail API: who may read it, filtering, detail, and audited CSV export.
 */
class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    private AuditLogger $audit;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
        $this->audit = app(AuditLogger::class);
    }

    private function userWithRole(RoleTemplate $template, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    public function test_only_incident_viewers_may_read_the_audit_log_and_refusals_are_audited(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);

        $this->actingAs($manager)->getJson(route('api.v1.audit-logs.index'))->assertForbidden();

        $this->assertTrue(AuditLog::query()->where('action', 'audit.viewed')->where('outcome', 'denied')->where('actor_user_id', $manager->id)->exists());
    }

    public function test_lists_newest_first_with_names_and_filters(): void
    {
        $auditor = $this->userWithRole(RoleTemplate::ReadOnlyAuditor, ['name' => 'Audrey Auditor']);
        $sam = User::factory()->create(['name' => 'Sam']);
        $garage = Lock::factory()->create(['name' => 'Garage']);
        $this->audit->record('auth.login', AuditOutcome::Failure, targets: ['user' => $sam->id], reason: 'Invalid credentials.');
        $this->audit->record('lock.command_denied', AuditOutcome::Denied, actor: $sam, targets: ['user' => $sam->id, 'lock' => $garage->id], reason: 'Commands are turned off for this lock.');
        $this->audit->record('user.updated', AuditOutcome::Success, actor: $auditor, targets: ['user' => $sam->id]);

        $this->actingAs($auditor)->getJson(route('api.v1.audit-logs.index'))
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('meta.total', 3)
            ->assertJsonPath('data.0.action', 'user.updated')
            ->assertJsonPath('data.0.actor.name', 'Audrey Auditor')
            ->assertJsonPath('data.1.target_lock.name', 'Garage')
            ->assertJsonMissingPath('data.0.metadata');

        $this->getJson(route('api.v1.audit-logs.index', ['category' => 'lock']))->assertJsonCount(1, 'data');
        $this->getJson(route('api.v1.audit-logs.index', ['outcome' => 'failure']))->assertJsonCount(1, 'data')->assertJsonPath('data.0.action', 'auth.login');
        $this->getJson(route('api.v1.audit-logs.index', ['target_lock_id' => $garage->id]))->assertJsonCount(1, 'data');
        $this->getJson(route('api.v1.audit-logs.index', ['actor_user_id' => $sam->id]))->assertJsonCount(1, 'data');
        $this->getJson(route('api.v1.audit-logs.index', ['search' => 'turned off']))->assertJsonCount(1, 'data');
        $this->getJson(route('api.v1.audit-logs.index', ['from' => now()->addHour()->toIso8601String()]))->assertJsonCount(0, 'data');
        $this->getJson(route('api.v1.audit-logs.index', ['category' => 'nonsense']))->assertUnprocessable();
    }

    public function test_detail_includes_redacted_metadata_and_request_context(): void
    {
        $auditor = $this->userWithRole(RoleTemplate::ReadOnlyAuditor);
        $record = $this->audit->record('auth.mfa_verify', AuditOutcome::Failure, metadata: ['code' => '123456', 'method' => 'totp']);

        $this->actingAs($auditor)->getJson(route('api.v1.audit-logs.show', $record->event_id))
            ->assertOk()
            ->assertJsonPath('data.metadata.code', '[redacted]')
            ->assertJsonPath('data.metadata.method', 'totp')
            ->assertJsonPath('data.hash', $record->hash);
    }

    public function test_export_needs_the_export_permission_neutralizes_formulas_and_is_audited(): void
    {
        $auditor = $this->userWithRole(RoleTemplate::ReadOnlyAuditor);
        $this->audit->record('user.suspended', AuditOutcome::Success, actor: $auditor, reason: '=HYPERLINK("http://evil.example")');

        $response = $this->actingAs($auditor)->get(route('api.v1.audit-logs.export', ['category' => 'user']));

        $response->assertOk();
        $csv = $response->streamedContent();
        $this->assertStringContainsString("'=HYPERLINK", $csv);
        $this->assertStringStartsWith('occurred_at,event_id', $csv);
        $exported = AuditLog::query()->where('action', 'audit.exported')->sole();
        $this->assertSame(['category' => 'user'], $exported->metadata['filters']);
        $this->assertSame(1, $exported->metadata['rows']);

        $viewerWithoutExport = $this->userWithRole(RoleTemplate::ReadOnlyAuditor);
        $viewerWithoutExport->permissionOverrides()->attach(Permission::query()->where('key', 'admin.reports_export')->value('id'), ['effect' => 'deny']);
        $this->actingAs($viewerWithoutExport)->getJson(route('api.v1.audit-logs.index'))->assertOk();
        $this->getJson(route('api.v1.audit-logs.export'))->assertForbidden();
    }
}
