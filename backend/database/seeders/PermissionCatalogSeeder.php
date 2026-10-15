<?php

namespace Database\Seeders;

use App\Enums\PermissionKey;
use App\Enums\RoleTemplate;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Synchronizes the permissions table with {@see PermissionKey} and creates any missing
 * built-in roles from {@see RoleTemplate}. Safe to rerun: existing roles keep any
 * administrator customizations.
 */
class PermissionCatalogSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function (): void {
            foreach (PermissionKey::cases() as $key) {
                Permission::query()->updateOrCreate(['key' => $key->value], [
                    'group' => $key->group(),
                    'name' => $key->label(),
                    'description' => $key->description(),
                    'is_sensitive' => $key->isSensitive(),
                ]);
            }

            Permission::query()
                ->whereNotIn('key', array_map(fn (PermissionKey $key): string => $key->value, PermissionKey::cases()))
                ->delete();

            $permissionIds = Permission::query()->pluck('id', 'key');

            foreach (RoleTemplate::cases() as $template) {
                $role = Role::query()->firstOrCreate(['key' => $template->value], [
                    'name' => $template->label(),
                    'description' => $template->description(),
                    'is_system' => true,
                ]);

                if ($role->wasRecentlyCreated) {
                    $role->permissions()->sync(array_map(
                        fn (PermissionKey $key): int => $permissionIds[$key->value],
                        $template->permissions(),
                    ));
                }
            }
        });
    }
}
