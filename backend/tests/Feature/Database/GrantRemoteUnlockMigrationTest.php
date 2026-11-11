<?php

namespace Tests\Feature\Database;

use App\Enums\PermissionKey;
use App\Enums\RoleTemplate;
use App\Models\Permission;
use App\Models\Role;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 2026_11_10_000001 gives existing unlocking roles remote unlocking without overriding administrator choices.
 */
class GrantRemoteUnlockMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_10_000001_grant_remote_unlock_to_unlocking_roles.php');
    }

    private function permissionId(PermissionKey $key): int
    {
        return (int) Permission::query()->where('key', $key->value)->value('id');
    }

    private function role(RoleTemplate $template): Role
    {
        return Role::query()->where('key', $template->value)->firstOrFail();
    }

    private function has(RoleTemplate $template, PermissionKey $key): bool
    {
        return $this->role($template)->permissions()->where('key', $key->value)->exists();
    }

    public function test_it_adds_remote_unlock_only_to_roles_that_still_unlock(): void
    {
        $this->seed(PermissionCatalogSeeder::class);
        $remote = $this->permissionId(PermissionKey::LockRemoteUnlock);
        // Put the live database's state back: the three roles as seeded before the template change.
        foreach ([RoleTemplate::PropertyManager, RoleTemplate::TemporaryGuest, RoleTemplate::ServiceProvider] as $template) {
            $this->role($template)->permissions()->detach($remote);
        }
        // An administrator took Unlock away from Service Provider: it must stay unable to unlock.
        $this->role(RoleTemplate::ServiceProvider)->permissions()->detach($this->permissionId(PermissionKey::LockUnlock));
        $auditorBefore = $this->role(RoleTemplate::ReadOnlyAuditor)->permissions()->pluck('key')->all();

        $this->migration()->up();
        $this->migration()->up(); // Safe to run twice.

        $this->assertTrue($this->has(RoleTemplate::PropertyManager, PermissionKey::LockRemoteUnlock));
        $this->assertTrue($this->has(RoleTemplate::TemporaryGuest, PermissionKey::LockRemoteUnlock));
        $this->assertFalse($this->has(RoleTemplate::ServiceProvider, PermissionKey::LockRemoteUnlock));
        $this->assertSame(1, $this->role(RoleTemplate::TemporaryGuest)->permissions()->where('key', PermissionKey::LockRemoteUnlock->value)->count());
        $this->assertSame($auditorBefore, $this->role(RoleTemplate::ReadOnlyAuditor)->permissions()->pluck('key')->all());
        $this->assertTrue($this->has(RoleTemplate::Resident, PermissionKey::LockRemoteUnlock));
    }

    public function test_rolling_back_removes_it_from_those_roles_only(): void
    {
        $this->seed(PermissionCatalogSeeder::class);

        $this->migration()->down();

        $this->assertFalse($this->has(RoleTemplate::TemporaryGuest, PermissionKey::LockRemoteUnlock));
        $this->assertFalse($this->has(RoleTemplate::PropertyManager, PermissionKey::LockRemoteUnlock));
        $this->assertTrue($this->has(RoleTemplate::Resident, PermissionKey::LockRemoteUnlock));
    }
}
