<?php

namespace Tests\Feature\Services\Authorization;

use App\Enums\PermissionEffect;
use App\Enums\PermissionKey;
use App\Enums\RoleTemplate;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\PermissionResolver;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PermissionResolverTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
    }

    private function userWithRole(RoleTemplate $template, ?User $user = null): User
    {
        $user ??= User::factory()->create();
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    private function override(User $user, PermissionKey $key, PermissionEffect $effect): void
    {
        $user->permissionOverrides()->attach(
            Permission::query()->where('key', $key->value)->value('id'),
            ['effect' => $effect->value],
        );
    }

    /**
     * @return array<string, array{PermissionKey}>
     */
    public static function everyPermission(): array
    {
        return collect(PermissionKey::cases())
            ->mapWithKeys(fn (PermissionKey $key): array => [$key->value => [$key]])
            ->all();
    }

    public function test_user_without_roles_or_overrides_is_denied_everything(): void
    {
        $user = User::factory()->create();

        $this->assertSame([], app(PermissionResolver::class)->effectivePermissions($user));
    }

    #[DataProvider('everyPermission')]
    public function test_allow_override_grants_the_permission(PermissionKey $key): void
    {
        $user = User::factory()->create();
        $this->override($user, $key, PermissionEffect::Allow);

        $this->assertTrue(Gate::forUser($user)->allows($key->value));
    }

    #[DataProvider('everyPermission')]
    public function test_deny_override_wins_over_super_administrator_role(PermissionKey $key): void
    {
        $user = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $this->override($user, $key, PermissionEffect::Deny);

        $this->assertTrue(Gate::forUser($user)->denies($key->value));
    }

    public function test_role_templates_grant_their_declared_permissions_and_nothing_else(): void
    {
        foreach (RoleTemplate::cases() as $template) {
            $user = $this->userWithRole($template);

            $granted = app(PermissionResolver::class)->effectivePermissions($user);

            $this->assertEqualsCanonicalizing($template->permissions(), $granted, $template->value);
        }
    }

    public function test_no_role_template_grants_proximity_unlock(): void
    {
        foreach (RoleTemplate::cases() as $template) {
            $this->assertNotContains(PermissionKey::LockProximityUnlock, $template->permissions(), $template->value);
        }
    }

    public function test_guest_cannot_remote_unlock_or_manage_users(): void
    {
        $guest = $this->userWithRole(RoleTemplate::TemporaryGuest);

        $this->assertTrue(Gate::forUser($guest)->allows(PermissionKey::LockUnlock->value));
        $this->assertTrue(Gate::forUser($guest)->denies(PermissionKey::LockRemoteUnlock->value));
        $this->assertTrue(Gate::forUser($guest)->denies(PermissionKey::UsersCreate->value));
    }

    public function test_permissions_from_multiple_roles_are_combined(): void
    {
        $user = $this->userWithRole(RoleTemplate::ReadOnlyAuditor);
        $this->userWithRole(RoleTemplate::TemporaryGuest, $user);

        $resolver = app(PermissionResolver::class);

        $this->assertTrue($resolver->allows($user, PermissionKey::AdminIncidentsView));
        $this->assertTrue($resolver->allows($user, PermissionKey::LockUnlock));
        $this->assertEqualsCanonicalizing(
            ['read_only_auditor', 'temporary_guest'],
            $resolver->decisionsFor($user)[PermissionKey::LockViewStatus->value]->grantingRoles,
        );
    }

    public function test_suspended_revoked_and_expired_accounts_are_denied_everything(): void
    {
        foreach (['suspended', 'revoked', 'expired'] as $state) {
            $user = $this->userWithRole(RoleTemplate::SuperAdministrator, User::factory()->{$state}()->create());
            $this->override($user, PermissionKey::LockUnlock, PermissionEffect::Allow);

            $this->assertSame([], app(PermissionResolver::class)->effectivePermissions($user), $state);
            $this->assertTrue(Gate::forUser($user)->denies(PermissionKey::LockUnlock->value), $state);
        }
    }

    public function test_abilities_outside_the_catalog_are_denied(): void
    {
        $user = $this->userWithRole(RoleTemplate::SuperAdministrator);

        $this->assertTrue(Gate::forUser($user)->denies('lock.open_all_doors'));
    }

    public function test_preview_shows_proposed_changes_without_saving_them(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);
        $guestRoleId = Role::query()->where('key', RoleTemplate::TemporaryGuest->value)->value('id');

        $preview = app(PermissionResolver::class)->preview(
            $user,
            [$guestRoleId],
            [PermissionKey::LockUnlock->value => PermissionEffect::Deny],
        );

        $this->assertFalse($preview[PermissionKey::LockRemoteUnlock->value]->granted);
        $this->assertFalse($preview[PermissionKey::LockUnlock->value]->granted);
        $this->assertSame('Denied by an individual override.', $preview[PermissionKey::LockUnlock->value]->reason);
        $this->assertTrue($preview[PermissionKey::LockLock->value]->granted);

        $this->assertSame(['resident'], $user->fresh()->roles->pluck('key')->all());
        $this->assertSame(0, $user->permissionOverrides()->count());
    }

    public function test_reseeding_keeps_administrator_changes_to_built_in_roles(): void
    {
        $resident = Role::query()->where('key', RoleTemplate::Resident->value)->firstOrFail();
        $resident->permissions()->detach(Permission::query()->where('key', PermissionKey::LockRemoteUnlock->value)->value('id'));

        $this->seed(PermissionCatalogSeeder::class);

        $this->assertNotContains(
            PermissionKey::LockRemoteUnlock,
            $resident->fresh()->permissions->pluck('key')->all(),
        );
        $this->assertSame(count(PermissionKey::cases()), Permission::query()->count());
    }
}
