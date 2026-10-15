<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Append-only audit trail. Each row stores the SHA-256 hash of its own content chained to the
     * previous row's hash, so any edit, insertion or removal inside the chain is detectable with
     * `php artisan lockguard:audit-verify`. Database triggers reject UPDATE and DELETE.
     *
     * Target ids are deliberately NOT foreign keys: audit records must outlive the users, devices
     * and locks they describe.
     */
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->uuid('event_id')->unique();
            $table->timestamp('occurred_at', 6)->index();
            $table->string('actor_type', 16);
            $table->unsignedBigInteger('actor_user_id')->nullable()->index();
            $table->string('action', 64)->index();
            $table->string('outcome', 16);
            $table->unsignedBigInteger('target_user_id')->nullable()->index();
            $table->unsignedBigInteger('target_device_id')->nullable()->index();
            $table->unsignedBigInteger('target_lock_id')->nullable()->index();
            $table->text('reason')->nullable();
            $table->uuid('correlation_id')->nullable()->index();
            $table->string('session_ref', 64)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->json('metadata')->nullable();
            $table->char('previous_hash', 64);
            $table->char('hash', 64)->unique();
        });

        match (DB::getDriverName()) {
            'mysql', 'mariadb' => $this->createMySqlTriggers(),
            'sqlite' => $this->createSqliteTriggers(),
            default => throw new RuntimeException('audit_logs append-only triggers are not implemented for driver '.DB::getDriverName()),
        };
    }

    /**
     * Reverse the migrations.
     *
     * Destructive: permanently deletes the entire audit trail. Never run in production.
     */
    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS audit_logs_no_update');
        DB::unprepared('DROP TRIGGER IF EXISTS audit_logs_no_delete');
        Schema::dropIfExists('audit_logs');
    }

    /**
     * With binary logging enabled, MySQL lets only privileged accounts create triggers. The app user
     * is deliberately not privileged, so in that case the triggers are created by an administrator
     * with scripts/protect-audit-log.ps1, and `lockguard:audit-verify` reports UNPROTECTED until then.
     */
    private function createMySqlTriggers(): void
    {
        try {
            foreach (['UPDATE' => 'audit_logs_no_update', 'DELETE' => 'audit_logs_no_delete'] as $event => $name) {
                DB::unprepared(<<<SQL
                    CREATE TRIGGER {$name} BEFORE {$event} ON audit_logs FOR EACH ROW
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only'
                    SQL);
            }
        } catch (QueryException $exception) {
            if (($exception->errorInfo[1] ?? null) !== 1419) {
                throw $exception;
            }

            fwrite(STDERR, PHP_EOL.'WARNING: audit_logs was created WITHOUT its append-only triggers because the database user '
                .'lacks the privilege to create triggers while binary logging is enabled.'.PHP_EOL
                .'Run scripts\\protect-audit-log.ps1 as the MySQL administrator to add them.'.PHP_EOL.PHP_EOL);
        }
    }

    private function createSqliteTriggers(): void
    {
        foreach (['UPDATE' => 'audit_logs_no_update', 'DELETE' => 'audit_logs_no_delete'] as $event => $name) {
            DB::unprepared(<<<SQL
                CREATE TRIGGER {$name} BEFORE {$event} ON audit_logs
                BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END
                SQL);
        }
    }
};
