<?php

use App\Enums\PermissionKey;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Every unlock from the app uses the Remote channel, which needs lock.remote_unlock as well as
     * lock.unlock. The Property Manager, Temporary Guest and Service Provider templates had only
     * lock.unlock, so their members could lock but never unlock. The catalog seeder only fills roles
     * it creates, so add lock.remote_unlock to those existing roles here, but only where the role
     * still has lock.unlock: a role an administrator customized not to unlock stays that way.
     */
    private const ROLES = ['property_manager', 'temporary_guest', 'service_provider'];

    public function up(): void
    {
        $unlockId = DB::table('permissions')->where('key', PermissionKey::LockUnlock->value)->value('id');
        $remoteId = DB::table('permissions')->where('key', PermissionKey::LockRemoteUnlock->value)->value('id');
        if ($unlockId === null || $remoteId === null) {
            return; // Fresh install: the catalog seeder creates the roles from the updated templates.
        }

        $now = now();
        $roleIds = DB::table('roles')
            ->whereIn('key', self::ROLES)
            ->whereIn('id', DB::table('role_permissions')->where('permission_id', $unlockId)->select('role_id'))
            ->pluck('id');

        foreach ($roleIds as $roleId) {
            DB::table('role_permissions')->insertOrIgnore([
                'role_id' => $roleId,
                'permission_id' => $remoteId,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        $remoteId = DB::table('permissions')->where('key', PermissionKey::LockRemoteUnlock->value)->value('id');
        $roleIds = DB::table('roles')->whereIn('key', self::ROLES)->pluck('id');

        DB::table('role_permissions')
            ->where('permission_id', $remoteId)
            ->whereIn('role_id', $roleIds)
            ->delete();
    }
};
