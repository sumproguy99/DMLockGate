<?php

namespace App\Services\Audit;

use Illuminate\Support\Facades\DB;

/**
 * Cheap integrity facts about the audit trail. The full hash-chain check is
 * `php artisan lockguard:audit-verify`; it reads every record, so it is not run per request.
 */
class AuditIntegrity
{
    /**
     * Whether the database triggers that reject UPDATE and DELETE on audit_logs are installed.
     */
    public function triggersInstalled(): bool
    {
        $names = match (DB::getDriverName()) {
            'mysql', 'mariadb' => DB::table('information_schema.TRIGGERS')
                ->where('TRIGGER_SCHEMA', DB::getDatabaseName())
                ->where('EVENT_OBJECT_TABLE', 'audit_logs')
                ->pluck('TRIGGER_NAME'),
            'sqlite' => DB::table('sqlite_master')
                ->where('type', 'trigger')
                ->where('tbl_name', 'audit_logs')
                ->pluck('name'),
            default => collect(),
        };

        return $names->contains('audit_logs_no_update') && $names->contains('audit_logs_no_delete');
    }
}
