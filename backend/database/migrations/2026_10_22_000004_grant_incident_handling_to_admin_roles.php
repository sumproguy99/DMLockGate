<?php

use App\Enums\PermissionKey;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * admin.incidents_manage is new. The catalog seeder only fills the permissions of roles it creates,
     * so give it to the existing built-in Super Administrator and Security Administrator roles here.
     * Other roles, including customized ones, are left alone.
     */
    public function up(): void
    {
        $key = PermissionKey::AdminIncidentsManage;
        $now = now();

        DB::table('permissions')->updateOrInsert(['key' => $key->value], [
            'group' => $key->group(),
            'name' => $key->label(),
            'description' => $key->description(),
            'is_sensitive' => $key->isSensitive(),
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $permissionId = DB::table('permissions')->where('key', $key->value)->value('id');

        $roleIds = DB::table('roles')->whereIn('key', ['super_administrator', 'security_administrator'])->pluck('id');
        foreach ($roleIds as $roleId) {
            DB::table('role_permissions')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId, 'created_at' => $now, 'updated_at' => $now]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('permissions')->where('key', PermissionKey::AdminIncidentsManage->value)->delete();
    }
};
