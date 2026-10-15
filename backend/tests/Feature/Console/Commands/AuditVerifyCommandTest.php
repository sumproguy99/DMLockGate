<?php

namespace Tests\Feature\Console\Commands;

use App\Enums\AuditOutcome;
use App\Services\Audit\AuditLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AuditVerifyCommandTest extends TestCase
{
    use RefreshDatabase;

    private function seedRecords(int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            app(AuditLogger::class)->record("test.event_{$i}", AuditOutcome::Success, metadata: ['n' => $i, 'nested' => ['b' => 2, 'a' => 1]]);
        }
    }

    private function dropTriggers(): void
    {
        DB::unprepared('DROP TRIGGER audit_logs_no_update');
        DB::unprepared('DROP TRIGGER audit_logs_no_delete');
    }

    public function test_intact_protected_chain_passes(): void
    {
        $this->seedRecords(3);

        $this->artisan('lockguard:audit-verify')
            ->expectsOutputToContain('PROTECTED')
            ->expectsOutputToContain('INTACT (3 record(s) verified)')
            ->assertSuccessful();
    }

    public function test_fails_when_triggers_are_missing(): void
    {
        $this->seedRecords(1);
        $this->dropTriggers();

        $this->artisan('lockguard:audit-verify')
            ->expectsOutputToContain('UNPROTECTED')
            ->assertFailed();
    }

    public function test_detects_a_modified_record(): void
    {
        $this->seedRecords(3);
        $this->dropTriggers();
        DB::table('audit_logs')->where('id', 2)->update(['outcome' => 'denied']);

        $this->artisan('lockguard:audit-verify')
            ->expectsOutputToContain('record #2 content does not match its hash')
            ->assertFailed();
    }

    public function test_detects_a_removed_record(): void
    {
        $this->seedRecords(3);
        $this->dropTriggers();
        DB::table('audit_logs')->where('id', 2)->delete();

        $this->artisan('lockguard:audit-verify')
            ->expectsOutputToContain('record #3 does not link to the previous record')
            ->assertFailed();
    }
}
