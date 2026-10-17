<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Users;

use App\Actions\Auth\CompleteLogin;
use App\Enums\PermissionEffect;
use App\Enums\PermissionKey;
use App\Enums\RoleTemplate;
use App\Enums\UserStatus;
use App\Models\AuditLog;
use App\Models\Lock;
use App\Models\Permission;
use App\Models\Property;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\PermissionResolver;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * User administration: permission checks, step-up, anti-escalation, status changes and auditing.
 */
class UserManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
    }

    private function userWithRole(RoleTemplate $template, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    private function override(User $user, PermissionKey $permission, PermissionEffect $effect): void
    {
        $user->permissionOverrides()->attach(Permission::query()->where('key', $permission->value)->value('id'), ['effect' => $effect->value]);
        app(PermissionResolver::class)->forget($user);
    }

    /**
     * Sign in as the user with a fresh step-up confirmation.
     */
    private function actingWithStepUp(User $user): static
    {
        return $this->actingAs($user)->withSession([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()]);
    }

    private function deniedAudit(string $action): AuditLog
    {
        return AuditLog::query()->where('action', $action)->where('outcome', 'denied')->sole();
    }

    /**
     * A Property Manager who may also assign roles and modify overrides, so the anti-escalation ceiling is what stops them.
     */
    private function delegatingManager(): User
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        $this->override($manager, PermissionKey::UsersAssignRoles, PermissionEffect::Allow);
        $this->override($manager, PermissionKey::UsersModifyPermissions, PermissionEffect::Allow);

        return $manager;
    }

    public function test_super_administrator_creates_a_user_with_roles(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);

        $response = $this->actingWithStepUp($admin)->postJson(route('api.v1.users.store'), [
            'name' => 'Rhea Resident',
            'email' => 'rhea@example.com',
            'password' => 'correct-horse-42-battery',
            'password_confirmation' => 'correct-horse-42-battery',
            'roles' => ['resident'],
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.email', 'rhea@example.com')
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.roles.0.key', 'resident')
            ->assertJsonMissingPath('data.password');

        $user = User::query()->where('email', 'rhea@example.com')->sole();
        $this->assertSame($admin->id, $user->roles()->sole()->pivot->assigned_by);

        $audit = AuditLog::query()->where('action', 'user.created')->sole();
        $this->assertSame($admin->id, $audit->actor_user_id);
        $this->assertSame(['resident'], $audit->metadata['roles']);
        $this->assertStringNotContainsString('correct-horse', json_encode($audit->getAttributes()));
    }

    public function test_creating_a_user_requires_step_up(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);

        $this->actingAs($admin)->postJson(route('api.v1.users.store'), ['name' => 'X'])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'step_up_required');
    }

    public function test_creating_a_user_with_roles_also_requires_assign_roles(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        $payload = [
            'name' => 'Gus Guest',
            'email' => 'gus@example.com',
            'password' => 'correct-horse-42-battery',
            'password_confirmation' => 'correct-horse-42-battery',
        ];

        $this->actingWithStepUp($manager)->postJson(route('api.v1.users.store'), [...$payload, 'roles' => ['temporary_guest']])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'forbidden')
            ->assertJsonPath('error.details.required_permission', 'users.assign_roles');

        $this->postJson(route('api.v1.users.store'), $payload)->assertCreated();
    }

    public function test_a_user_without_any_user_permission_cannot_list_users_and_the_attempt_is_audited(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $this->actingAs($resident)->getJson(route('api.v1.users.index'))
            ->assertForbidden()
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertSame($resident->id, $this->deniedAudit('user.list')->actor_user_id);
    }

    public function test_listing_filters_by_status_and_search(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator, ['name' => 'Ada Admin']);
        User::factory()->suspended()->create(['name' => 'Sam Suspended']);
        User::factory()->create(['name' => 'Zed Active', 'email' => 'zed@example.com']);

        $this->actingAs($admin)->getJson(route('api.v1.users.index', ['status' => 'suspended']))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Sam Suspended');

        $this->getJson(route('api.v1.users.index', ['search' => 'zed@']))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Zed Active');
    }

    public function test_administrators_cannot_change_their_own_account(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);

        $this->actingWithStepUp($admin)->postJson(route('api.v1.users.suspend', $admin), ['reason' => 'Testing'])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'self_modification_forbidden');

        $this->putJson(route('api.v1.users.roles.update', $admin), ['roles' => []])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'self_modification_forbidden');

        $this->assertSame(UserStatus::Active, $admin->fresh()->status);
        $this->assertCount(1, $admin->roles()->get());
    }

    public function test_a_lower_ranked_administrator_cannot_suspend_a_super_administrator(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);

        $this->actingAs($manager)->postJson(route('api.v1.users.suspend', $admin), ['reason' => 'Hostile takeover'])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'target_outranks_actor');

        $this->assertSame(UserStatus::Active, $admin->fresh()->status);
        $this->assertSame($admin->id, $this->deniedAudit('user.suspended')->target_user_id);
    }

    public function test_a_suspended_super_administrator_is_still_protected_from_lower_ranked_administrators(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator, ['status' => UserStatus::Suspended]);

        $this->actingWithStepUp($manager)->postJson(route('api.v1.users.reactivate', $admin), ['reason' => 'Let me back in'])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'target_outranks_actor');

        $this->assertSame(UserStatus::Suspended, $admin->fresh()->status);
    }

    public function test_suspension_needs_no_step_up_ends_sessions_and_blocks_the_next_request(): void
    {
        config(['session.driver' => 'database']);
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        $resident = $this->userWithRole(RoleTemplate::Resident);
        DB::table('sessions')->insert(['id' => 'resident-session', 'user_id' => $resident->id, 'payload' => '', 'last_activity' => now()->getTimestamp()]);
        $resident->createToken('phone');

        $this->actingAs($manager)->postJson(route('api.v1.users.suspend', $resident), ['reason' => 'Lost phone'])
            ->assertOk()
            ->assertJsonPath('data.status', 'suspended')
            ->assertJsonPath('data.is_active', false);

        $this->assertDatabaseMissing('sessions', ['user_id' => $resident->id]);
        $this->assertSame(0, $resident->tokens()->count());

        $audit = AuditLog::query()->where('action', 'user.suspended')->where('outcome', 'success')->sole();
        $this->assertSame('Lost phone', $audit->reason);
        $this->assertSame(['browser_logins' => 1, 'api_clients' => 1], $audit->metadata['signed_out']);

        $this->assertFalse(app(PermissionResolver::class)->allows($resident->fresh(), PermissionKey::LockUnlock));

        $this->actingAs($resident->fresh())->getJson(route('api.v1.auth.me'))
            ->assertForbidden()
            ->assertJsonPath('error.code', 'account_inactive');
    }

    public function test_suspension_requires_a_reason(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $this->actingAs($manager)->postJson(route('api.v1.users.suspend', $resident))
            ->assertStatus(422)
            ->assertJsonPath('error.fields.reason.0', 'The reason field is required.');
    }

    public function test_reactivation_only_applies_to_suspended_accounts(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $this->actingWithStepUp($manager)->postJson(route('api.v1.users.reactivate', $resident), ['reason' => 'Already active'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'invalid_status_transition');

        $resident->forceFill(['status' => UserStatus::Suspended])->save();

        $this->postJson(route('api.v1.users.reactivate', $resident), ['reason' => 'Phone found'])
            ->assertOk()
            ->assertJsonPath('data.status', 'active');
    }

    public function test_revocation_requires_the_permission_and_is_permanent(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        $security = $this->userWithRole(RoleTemplate::SecurityAdministrator);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $this->actingWithStepUp($manager)->postJson(route('api.v1.users.revoke', $resident), ['reason' => 'Moved out'])
            ->assertForbidden()
            ->assertJsonPath('error.details.required_permission', 'users.revoke');

        // Door-access permissions do not count toward rank, so a Security Administrator can revoke a Resident.
        $this->actingWithStepUp($security)->postJson(route('api.v1.users.revoke', $resident), ['reason' => 'Moved out'])
            ->assertOk()
            ->assertJsonPath('data.status', 'revoked');

        $this->postJson(route('api.v1.users.reactivate', $resident), ['reason' => 'Undo'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'account_revoked');
    }

    public function test_super_administrator_replaces_roles_and_the_change_is_audited(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $user = $this->userWithRole(RoleTemplate::TemporaryGuest);

        $this->actingWithStepUp($admin)->putJson(route('api.v1.users.roles.update', $user), ['roles' => ['resident'], 'reason' => 'Signed a lease'])
            ->assertOk()
            ->assertJsonPath('data.roles', [['key' => 'resident', 'name' => 'Resident']]);

        $audit = AuditLog::query()->where('action', 'user.roles_changed')->sole();
        $this->assertSame(['resident'], $audit->metadata['added']);
        $this->assertSame(['temporary_guest'], $audit->metadata['removed']);
        $this->assertSame('Signed a lease', $audit->reason);
        $this->assertTrue(app(PermissionResolver::class)->allows($user->fresh(), PermissionKey::LockRemoteUnlock));
    }

    public function test_assigning_roles_requires_step_up(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $user = $this->userWithRole(RoleTemplate::TemporaryGuest);

        $this->actingAs($admin)->putJson(route('api.v1.users.roles.update', $user), ['roles' => ['super_administrator']])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'step_up_required');
    }

    public function test_an_administrator_cannot_assign_a_role_beyond_their_own_permissions(): void
    {
        $manager = $this->delegatingManager();
        $guest = $this->userWithRole(RoleTemplate::TemporaryGuest);

        $this->actingWithStepUp($manager)->putJson(route('api.v1.users.roles.update', $guest), ['roles' => ['temporary_guest', 'super_administrator']])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'role_exceeds_your_permissions')
            ->assertJsonPath('error.details.roles', ['super_administrator']);

        $this->assertSame(['temporary_guest'], $guest->roles()->pluck('key')->all());
        $this->assertSame('role_exceeds_your_permissions', $this->deniedAudit('user.roles_changed')->metadata['denial']);

        $this->putJson(route('api.v1.users.roles.update', $guest), ['roles' => ['service_provider']])->assertOk();
    }

    public function test_a_property_manager_can_assign_the_resident_role_despite_not_holding_remote_unlock(): void
    {
        $manager = $this->delegatingManager();
        $guest = $this->userWithRole(RoleTemplate::TemporaryGuest);

        $this->actingWithStepUp($manager)->putJson(route('api.v1.users.roles.update', $guest), ['roles' => ['resident']])
            ->assertOk()
            ->assertJsonPath('data.roles.0.key', 'resident');
    }

    public function test_a_property_manager_cannot_manage_a_security_administrator(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        $security = $this->userWithRole(RoleTemplate::SecurityAdministrator);

        $this->actingAs($manager)->postJson(route('api.v1.users.suspend', $security), ['reason' => 'Testing'])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'target_outranks_actor')
            ->assertJsonPath('error.details.permissions', fn (array $permissions) => in_array('users.revoke', $permissions, true));
    }

    public function test_an_administrator_cannot_grant_an_override_beyond_their_own_permissions(): void
    {
        $manager = $this->delegatingManager();
        $guest = $this->userWithRole(RoleTemplate::TemporaryGuest);

        $this->actingWithStepUp($manager)->putJson(route('api.v1.users.permissions.update', $guest), [
            'overrides' => [['permission' => 'admin.incidents_view', 'effect' => 'allow']],
        ])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'grant_exceeds_your_permissions')
            ->assertJsonPath('error.details.permissions', ['admin.incidents_view']);

        $this->putJson(route('api.v1.users.permissions.update', $guest), [
            'overrides' => [['permission' => 'lock.proximity_unlock', 'effect' => 'allow']],
        ])
            ->assertForbidden()
            ->assertJsonPath('error.details.permissions', ['lock.proximity_unlock']);

        $this->putJson(route('api.v1.users.permissions.update', $guest), [
            'overrides' => [
                ['permission' => 'lock.view_history', 'effect' => 'allow', 'reason' => 'Needs to check deliveries'],
                ['permission' => 'lock.unlock', 'effect' => 'deny'],
            ],
        ])
            ->assertOk()
            ->assertJsonCount(2, 'data.permission_overrides');

        $resolver = app(PermissionResolver::class);
        $this->assertTrue($resolver->allows($guest->fresh(), PermissionKey::LockViewHistory));
        $this->assertFalse($resolver->allows($guest->fresh(), PermissionKey::LockUnlock));

        $audit = AuditLog::query()->where('action', 'user.permissions_changed')->where('outcome', 'success')->sole();
        $this->assertSame(['lock.unlock' => 'deny', 'lock.view_history' => 'allow'], $audit->metadata['after']);
    }

    public function test_removing_a_deny_override_cannot_expose_a_role_permission_beyond_the_actors_own(): void
    {
        $manager = $this->delegatingManager();
        $auditor = $this->userWithRole(RoleTemplate::ReadOnlyAuditor);
        $this->override($auditor, PermissionKey::LocationReviewAudit, PermissionEffect::Deny);
        $this->override($auditor, PermissionKey::AdminIncidentsView, PermissionEffect::Deny);
        $this->override($auditor, PermissionKey::AdminReportsExport, PermissionEffect::Deny);

        $this->actingWithStepUp($manager)->putJson(route('api.v1.users.permissions.update', $auditor), [
            'overrides' => [
                ['permission' => 'location.review_audit', 'effect' => 'deny'],
                ['permission' => 'admin.reports_export', 'effect' => 'deny'],
            ],
        ])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'grant_exceeds_your_permissions')
            ->assertJsonPath('error.details.permissions', ['admin.incidents_view']);

        $this->assertSame(3, $auditor->permissionOverrides()->count());
    }

    public function test_only_a_super_administrator_can_grant_proximity_unlocking(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $this->actingWithStepUp($admin)->putJson(route('api.v1.users.permissions.update', $resident), [
            'overrides' => [['permission' => 'lock.proximity_unlock', 'effect' => 'allow', 'reason' => 'Validated phone']],
        ])->assertOk();

        $this->assertTrue(app(PermissionResolver::class)->allows($resident->fresh(), PermissionKey::LockProximityUnlock));
    }

    public function test_permission_preview_reports_changes_and_violations_without_saving(): void
    {
        $manager = $this->delegatingManager();
        $guest = $this->userWithRole(RoleTemplate::TemporaryGuest);

        $data = $this->actingAs($manager)->postJson(route('api.v1.permission-preview'), [
            'user_id' => $guest->id,
            'roles' => ['read_only_auditor'],
            'overrides' => [
                ['permission' => 'lock.remote_unlock', 'effect' => 'allow'],
                ['permission' => 'lock.unlock', 'effect' => 'deny'],
            ],
        ])->assertOk()->json('data');

        $this->assertFalse($data['can_save']);
        $this->assertSame(['read_only_auditor'], $data['violations']['roles']);
        $this->assertSame(['location.review_audit', 'admin.incidents_view', 'admin.reports_export'], $data['violations']['permissions']);
        $this->assertSame(['lock.lock', 'lock.unlock'], $data['changes']['lost']);
        $this->assertSame(['lock.remote_unlock'], $data['changes']['sensitive_gained']);
        $this->assertSame('Denied by an individual override.', collect($data['permissions'])->firstWhere('key', 'lock.unlock')['reason']);

        $this->assertSame(['temporary_guest'], $guest->roles()->pluck('key')->all());
        $this->assertSame(0, $guest->permissionOverrides()->count());
    }

    public function test_permission_preview_for_a_new_user_with_allowed_roles_can_be_saved(): void
    {
        $manager = $this->delegatingManager();

        $this->actingAs($manager)->postJson(route('api.v1.permission-preview'), ['roles' => ['temporary_guest']])
            ->assertOk()
            ->assertJsonPath('data.can_save', true)
            ->assertJsonPath('data.changes', null);
    }

    public function test_profile_update_records_changed_fields_without_note_contents(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $resident = $this->userWithRole(RoleTemplate::Resident, ['name' => 'Old Name']);

        $this->actingWithStepUp($admin)->patchJson(route('api.v1.users.update', $resident), [
            'name' => 'New Name',
            'admin_notes' => 'Gate code is on the fridge',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'New Name')
            ->assertJsonPath('data.admin_notes', 'Gate code is on the fridge');

        $audit = AuditLog::query()->where('action', 'user.updated')->sole();
        $this->assertSame(['from' => 'Old Name', 'to' => 'New Name'], $audit->metadata['changes']['name']);
        $this->assertSame(['changed' => true], $audit->metadata['changes']['admin_notes']);
        $this->assertStringNotContainsString('fridge', json_encode($audit->getAttributes()));
    }

    public function test_profile_update_rejects_a_duplicate_email(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $other = User::factory()->create();

        $this->actingWithStepUp($admin)->patchJson(route('api.v1.users.update', $resident), ['email' => $other->email])
            ->assertStatus(422)
            ->assertJsonPath('error.fields.email.0', 'The email has already been taken.');
    }

    public function test_security_history_lists_the_users_auth_and_admin_events(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $this->actingAs($manager)->postJson(route('api.v1.users.suspend', $resident), ['reason' => 'Lost phone'])->assertOk();

        $this->getJson(route('api.v1.users.security-history', $resident))
            ->assertOk()
            ->assertJsonPath('data.0.action', 'user.suspended')
            ->assertJsonPath('data.0.actor.id', $manager->id)
            ->assertJsonPath('data.0.reason', 'Lost phone');
    }

    public function test_roles_and_permission_catalog_are_listed_for_user_administrators(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);

        $this->actingAs($manager)->getJson(route('api.v1.roles.index'))
            ->assertOk()
            ->assertJsonCount(count(RoleTemplate::cases()), 'data');

        $this->getJson(route('api.v1.permissions.index'))
            ->assertOk()
            ->assertJsonCount(count(PermissionKey::cases()), 'data');
    }

    public function test_listing_filters_by_role_lock_and_property(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator, ['name' => 'Ada Admin']);
        $home = Property::factory()->create();
        $front = Lock::factory()->for($home)->create();
        $elsewhere = Lock::factory()->create();
        $rhea = $this->userWithRole(RoleTemplate::Resident, ['name' => 'Rhea Resident']);
        $rhea->locks()->attach($front->id);
        $gus = $this->userWithRole(RoleTemplate::TemporaryGuest, ['name' => 'Gus Guest']);
        $gus->locks()->attach($elsewhere->id);

        $this->actingAs($admin)->getJson(route('api.v1.users.index', ['role' => 'resident']))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Rhea Resident');

        $this->getJson(route('api.v1.users.index', ['lock_id' => $elsewhere->id]))
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Gus Guest');

        $this->getJson(route('api.v1.users.index', ['property_id' => $home->id]))
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Rhea Resident');

        $this->getJson(route('api.v1.users.index', ['role' => 'no_such_role']))->assertUnprocessable();
    }

    public function test_user_detail_lists_lock_access_with_its_window(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $lock = Lock::factory()->create(['name' => 'Garage']);
        $guest = $this->userWithRole(RoleTemplate::TemporaryGuest);
        $guest->locks()->attach($lock->id, ['valid_until' => now()->addDays(2)]);

        $this->actingAs($admin)->getJson(route('api.v1.users.show', $guest))
            ->assertOk()
            ->assertJsonPath('data.locks.0.name', 'Garage')
            ->assertJsonPath('data.locks.0.property.id', $lock->property_id)
            ->assertJsonPath('data.locks.0.valid_from', null)
            ->assertJsonPath('data.locks.0.valid_until', fn (?string $until): bool => $until !== null);
    }

    public function test_signing_a_user_out_everywhere_keeps_the_account_active(): void
    {
        config(['session.driver' => 'database']);
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $resident = $this->userWithRole(RoleTemplate::Resident);
        DB::table('sessions')->insert(['id' => 'resident-session', 'user_id' => $resident->id, 'payload' => '', 'last_activity' => now()->getTimestamp()]);

        $this->actingAs($admin)->postJson(route('api.v1.users.sessions.revoke', $resident), ['reason' => 'Shared computer'])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'step_up_required');

        $this->actingWithStepUp($admin)->postJson(route('api.v1.users.sessions.revoke', $resident), ['reason' => 'Shared computer'])
            ->assertOk()
            ->assertJsonPath('data.signed_out.browser_logins', 1);

        $this->assertDatabaseMissing('sessions', ['user_id' => $resident->id]);
        $this->assertSame(UserStatus::Active, $resident->fresh()->status);
        $audit = AuditLog::query()->where('action', 'user.sessions_revoked')->sole();
        $this->assertSame('Shared computer', $audit->reason);
    }

    public function test_signing_users_out_requires_the_permission(): void
    {
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $this->actingWithStepUp($manager)->postJson(route('api.v1.users.sessions.revoke', $resident), ['reason' => 'Shared computer'])
            ->assertForbidden();
        $this->deniedAudit('user.sessions_revoked');
    }
}
