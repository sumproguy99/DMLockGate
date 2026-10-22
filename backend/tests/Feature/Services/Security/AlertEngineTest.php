<?php

namespace Tests\Feature\Services\Security;

use App\Enums\AlertRule;
use App\Enums\AlertSeverity;
use App\Enums\AlertStatus;
use App\Enums\AuditOutcome;
use App\Enums\IncidentStatus;
use App\Enums\LockConnectionStatus;
use App\Enums\ReportedLockState;
use App\Enums\RoleTemplate;
use App\Models\Lock;
use App\Models\Role;
use App\Models\SecurityAlert;
use App\Models\SecurityIncident;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Security\AlertEngine;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

/**
 * The alert engine: event rules fed by audit records, condition rules run by lockguard:check-alerts,
 * deduplication, reopening, correlation into incidents, and who is notified.
 */
class AlertEngineTest extends TestCase
{
    use RefreshDatabase;

    private Lock $frontDoor;

    private User $handler;

    private User $auditor;

    private User $resident;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->frontDoor = Lock::factory()->reporting(ReportedLockState::Locked)->create(['name' => 'Front Door', 'battery_level' => 80]);

        $this->handler = $this->userWithRole(RoleTemplate::SecurityAdministrator, ['name' => 'Sam Security']);
        $this->auditor = $this->userWithRole(RoleTemplate::ReadOnlyAuditor);
        $this->resident = $this->userWithRole(RoleTemplate::Resident, ['name' => 'Riley Resident']);
        $this->resident->locks()->attach($this->frontDoor->id);
    }

    protected function tearDown(): void
    {
        @unlink(AlertEngine::auditFailureFlagPath());

        parent::tearDown();
    }

    private function userWithRole(RoleTemplate $template, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    private function audit(string $action, AuditOutcome $outcome, array $targets = [], ?User $actor = null, array $metadata = []): void
    {
        app(AuditLogger::class)->record($action, $outcome, actor: $actor, targets: $targets, reason: 'Test event.', metadata: $metadata);
    }

    private function failedSignIns(User $user, int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $this->audit('auth.login', AuditOutcome::Failure, ['user' => $user->id]);
        }
    }

    private function check(): void
    {
        app(AlertEngine::class)->checkConditions();
    }

    public function test_failed_sign_ins_below_the_threshold_raise_nothing(): void
    {
        $this->failedSignIns($this->resident, 4);

        $this->assertSame(0, SecurityAlert::query()->count());
    }

    public function test_repeated_failed_sign_ins_raise_one_high_alert_with_an_incident(): void
    {
        $this->failedSignIns($this->resident, 5);

        $alert = SecurityAlert::query()->sole();
        $this->assertSame(AlertRule::FailedSignIns, $alert->rule);
        $this->assertSame(AlertSeverity::High, $alert->severity);
        $this->assertSame(AlertStatus::Open, $alert->status);
        $this->assertSame(5, $alert->occurrences);
        $this->assertSame($this->resident->id, $alert->subject_user_id);
        $this->assertStringContainsString('Riley Resident', $alert->title);

        $incident = SecurityIncident::query()->sole();
        $this->assertSame($incident->id, $alert->security_incident_id);
        $this->assertSame(IncidentStatus::New, $incident->status);
        $this->assertNull($incident->opened_by);
        $this->assertSame(1, $incident->events()->count());
    }

    public function test_incident_handlers_and_the_account_owner_are_told_and_auditors_are_not(): void
    {
        $this->failedSignIns($this->resident, 5);

        $handlerNote = $this->handler->notifications()->sole();
        $this->assertTrue($handlerNote->data['mandatory']);
        $this->assertSame('security_incident', $handlerNote->data['category']);
        $this->assertStringContainsString('Riley Resident', $handlerNote->data['title']);

        $ownNote = $this->resident->notifications()->sole();
        $this->assertFalse($ownNote->data['mandatory']);
        $this->assertSame('Failed sign-in attempts on your account', $ownNote->data['title']);

        $this->assertSame(0, $this->auditor->notifications()->count());
    }

    public function test_more_failures_add_to_the_same_alert_without_notifying_again(): void
    {
        $this->failedSignIns($this->resident, 8);

        $this->assertSame(8, SecurityAlert::query()->sole()->occurrences);
        $this->assertSame(1, $this->handler->notifications()->count());
        $this->assertSame(1, SecurityIncident::query()->count());
    }

    public function test_failed_sign_ins_for_unknown_accounts_are_counted_per_address(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->audit('auth.login', AuditOutcome::Failure);
        }

        $alert = SecurityAlert::query()->sole();
        $this->assertNull($alert->subject_user_id);
        $this->assertSame('127.0.0.1', $alert->subject_ip);
        $this->assertSame('failed_sign_ins:ip:127.0.0.1', $alert->fingerprint);
    }

    public function test_failed_identity_checks_count_as_failed_sign_ins(): void
    {
        $this->failedSignIns($this->resident, 3);
        $this->audit('auth.mfa_verify', AuditOutcome::Failure, ['user' => $this->resident->id]);
        $this->audit('auth.step_up', AuditOutcome::Failure, ['user' => $this->resident->id]);

        $this->assertSame(AlertRule::FailedSignIns, SecurityAlert::query()->sole()->rule);
    }

    public function test_repeated_denied_lock_requests_raise_a_medium_alert_without_an_incident(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->audit('lock.command_denied', AuditOutcome::Denied, ['user' => $this->resident->id, 'lock' => $this->frontDoor->id], $this->resident);
        }

        $alert = SecurityAlert::query()->sole();
        $this->assertSame(AlertRule::DeniedLockRequests, $alert->rule);
        $this->assertSame(AlertSeverity::Medium, $alert->severity);
        $this->assertNull($alert->security_incident_id);
        $this->assertSame(1, $this->handler->notifications()->count());
        $this->assertSame(0, $this->resident->notifications()->count());
    }

    public function test_an_unconfirmed_command_raises_outcome_unknown_and_repeats_raise_command_failures(): void
    {
        $targets = ['user' => $this->resident->id, 'lock' => $this->frontDoor->id];
        $this->audit('lock.command_unconfirmed', AuditOutcome::Failure, $targets);

        $this->assertSame([AlertRule::LockOutcomeUnknown], SecurityAlert::query()->pluck('rule')->all());

        $this->audit('lock.command_failed', AuditOutcome::Failure, $targets);
        $this->audit('lock.command_failed', AuditOutcome::Failure, $targets);

        $failures = SecurityAlert::query()->where('rule', AlertRule::LockCommandFailures)->sole();
        $this->assertSame(AlertSeverity::High, $failures->severity);
        $this->assertSame($this->frontDoor->id, $failures->subject_lock_id);
        $this->assertNotNull($failures->security_incident_id);
    }

    public function test_expired_requests_are_not_command_failures(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->audit('lock.command_expired', AuditOutcome::Failure, ['lock' => $this->frontDoor->id]);
        }

        $this->assertSame(0, SecurityAlert::query()->count());
    }

    public function test_giving_someone_an_administrative_role_raises_an_alert_and_door_access_does_not(): void
    {
        $this->audit('user.roles_changed', AuditOutcome::Success, ['user' => $this->resident->id], $this->handler, ['added' => ['resident'], 'removed' => [], 'roles' => ['resident']]);
        $this->assertSame(0, SecurityAlert::query()->count());

        $this->audit('user.roles_changed', AuditOutcome::Success, ['user' => $this->resident->id], $this->handler, ['added' => ['security_administrator'], 'removed' => [], 'roles' => ['resident', 'security_administrator']]);

        $alert = SecurityAlert::query()->sole();
        $this->assertSame(AlertRule::AdminPermissionChange, $alert->rule);
        $this->assertStringContainsString('Sam Security', $alert->description);
    }

    public function test_an_individual_allow_on_a_sensitive_permission_raises_an_alert(): void
    {
        $this->audit('user.permissions_changed', AuditOutcome::Success, ['user' => $this->resident->id], $this->handler, [
            'before' => ['lock.view_history' => 'deny'],
            'after' => ['lock.view_history' => 'deny', 'location.view_history' => 'allow'],
        ]);

        $this->assertStringContainsString('View location history', SecurityAlert::query()->sole()->description);
    }

    public function test_turning_off_two_step_sign_in_raises_an_alert(): void
    {
        $this->audit('auth.mfa_disabled', AuditOutcome::Success, ['user' => $this->resident->id], $this->resident);

        $alert = SecurityAlert::query()->sole();
        $this->assertSame(AlertRule::MfaDisabled, $alert->rule);
        $this->assertSame('Two-step sign-in was turned off for your account', $this->resident->notifications()->sole()->data['title']);
    }

    public function test_nothing_is_raised_when_the_audited_operation_rolls_back(): void
    {
        try {
            DB::transaction(function (): void {
                $this->failedSignIns($this->resident, 5);

                throw new RuntimeException('Operation failed after auditing.');
            });
        } catch (RuntimeException) {
        }

        $this->assertSame(0, SecurityAlert::query()->count());
    }

    public function test_an_offline_lock_raises_an_alert_for_handlers_and_its_users_and_clears_itself(): void
    {
        $this->frontDoor->forceFill(['connection_status' => LockConnectionStatus::Disconnected])->save();
        $this->check();

        $alert = SecurityAlert::query()->sole();
        $this->assertSame(AlertRule::LockOffline, $alert->rule);
        $this->assertSame(AlertSeverity::High, $alert->severity);
        $this->assertSame('lock_connectivity', $this->resident->notifications()->sole()->data['category']);
        $this->assertSame(1, $this->handler->notifications()->count());

        $this->check();
        $this->assertSame(1, $alert->refresh()->occurrences, 'A condition still present is not a new occurrence.');

        $this->frontDoor->forceFill(['connection_status' => LockConnectionStatus::Connected])->save();
        $this->check();

        $alert->refresh();
        $this->assertSame(AlertStatus::Resolved, $alert->status);
        $this->assertSame(SecurityAlert::RESOLUTION_CLEARED, $alert->resolution);
    }

    public function test_a_flapping_lock_reopens_its_alert_without_notifying_again(): void
    {
        $this->frontDoor->forceFill(['connection_status' => LockConnectionStatus::Disconnected])->save();
        $this->check();
        $this->frontDoor->forceFill(['connection_status' => LockConnectionStatus::Connected])->save();
        $this->check();
        $this->frontDoor->forceFill(['connection_status' => LockConnectionStatus::Disconnected])->save();
        $this->check();

        $alert = SecurityAlert::query()->sole();
        $this->assertSame(AlertStatus::Open, $alert->status);
        $this->assertSame(2, $alert->occurrences);
        $this->assertSame(1, $this->handler->notifications()->count());
        $this->assertSame(1, $this->resident->notifications()->count());
    }

    public function test_alerts_about_the_same_lock_share_one_incident(): void
    {
        $this->frontDoor->forceFill(['connection_status' => LockConnectionStatus::Disconnected, 'battery_level' => 5])->save();
        $this->check();

        $this->assertSame(2, SecurityAlert::query()->count());
        $incident = SecurityIncident::query()->sole();
        $this->assertSame('lock:'.$this->frontDoor->id, $incident->subject_key);
        $this->assertSame(2, $incident->alerts()->count());
    }

    public function test_battery_alert_severity_follows_the_battery_level(): void
    {
        $this->frontDoor->forceFill(['battery_level' => 20])->save();
        $this->check();
        $alert = SecurityAlert::query()->sole();
        $this->assertSame(AlertSeverity::Medium, $alert->severity);
        $this->assertSame('battery_warning', $this->resident->notifications()->sole()->data['category']);

        $this->frontDoor->forceFill(['battery_level' => 8])->save();
        $this->check();
        $this->assertSame(AlertSeverity::High, $alert->refresh()->severity);
        $this->assertSame(2, $this->resident->notifications()->count(), 'A worse battery is worth telling people again.');

        $this->frontDoor->forceFill(['battery_level' => 100])->save();
        $this->check();
        $this->assertSame(AlertStatus::Resolved, $alert->refresh()->status);
    }

    public function test_a_stale_or_jammed_lock_raises_its_condition(): void
    {
        $this->frontDoor->forceFill(['last_state_observed_at' => now()->subHours(2)])->save();
        $this->check();
        $this->assertSame([AlertRule::LockStateUnconfirmed], SecurityAlert::query()->active()->pluck('rule')->all());
        $this->assertSame(0, $this->resident->notifications()->count(), 'Only incident handlers hear about stale state.');

        $this->frontDoor->forceFill(['last_reported_state' => ReportedLockState::Jammed, 'last_state_observed_at' => now()])->save();
        $this->check();
        $this->assertSame([AlertRule::LockJammed], SecurityAlert::query()->active()->pluck('rule')->all());
    }

    public function test_locks_not_in_use_raise_nothing(): void
    {
        Lock::factory()->create(['registration_status' => 'pending', 'connection_status' => LockConnectionStatus::Disconnected]);

        $this->check();

        $this->assertSame(0, SecurityAlert::query()->count());
    }

    public function test_event_alerts_resolve_after_going_quiet(): void
    {
        $this->failedSignIns($this->resident, 5);
        $alert = SecurityAlert::query()->sole();

        $this->travel((int) config('lockguard.alerts.quiet_hours') + 1)->hours();
        $this->frontDoor->forceFill(['last_state_observed_at' => now()])->save();
        $this->check();

        $alert->refresh();
        $this->assertSame(AlertStatus::Resolved, $alert->status);
        $this->assertSame(SecurityAlert::RESOLUTION_QUIET, $alert->resolution);
    }

    public function test_notifications_per_person_are_capped_except_critical(): void
    {
        config(['lockguard.alerts.notifications_per_hour' => 2]);
        foreach ([$this->auditor, $this->resident, $this->handler] as $index => $user) {
            app(AlertEngine::class)->raise(AlertRule::MfaDisabled, 'cap-test:'.$index, AlertSeverity::Medium, 'Alert '.$index, 'Test.');
        }
        $this->assertSame(2, $this->handler->notifications()->count());
        $this->assertSame(3, SecurityAlert::query()->count(), 'Alerts past the limit are still recorded.');

        app(AlertEngine::class)->raise(AlertRule::AuditWriteFailure, 'cap-test:critical', AlertSeverity::Critical, 'Critical', 'Test.');
        $this->assertSame(3, $this->handler->notifications()->count());
    }

    public function test_a_failed_audit_write_raises_a_critical_alert_on_the_next_check(): void
    {
        AlertEngine::noteAuditWriteFailure('user.updated', new RuntimeException('Database went away.'));

        $this->check();

        $alert = SecurityAlert::query()->sole();
        $this->assertSame(AlertRule::AuditWriteFailure, $alert->rule);
        $this->assertSame(AlertSeverity::Critical, $alert->severity);
        $this->assertStringContainsString('user.updated', $alert->description);
        $this->assertFileDoesNotExist(AlertEngine::auditFailureFlagPath());
    }

    public function test_an_unconfigured_integration_raises_nothing(): void
    {
        $this->check();

        $this->assertSame(0, SecurityAlert::query()->where('rule', AlertRule::IntegrationUnavailable)->count());
    }
}
