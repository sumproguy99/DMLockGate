<?php

namespace Tests\Feature\Services\Audit;

use App\Enums\AuditOutcome;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Audit\AuditWriteFailed;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use LogicException;
use Tests\TestCase;

class AuditLoggerTest extends TestCase
{
    use RefreshDatabase;

    private function logger(): AuditLogger
    {
        return app(AuditLogger::class);
    }

    public function test_records_are_chained_to_the_previous_hash(): void
    {
        $first = $this->logger()->record('user.created', AuditOutcome::Success);
        $second = $this->logger()->record('user.suspended', AuditOutcome::Success);

        $this->assertSame(AuditLogger::GENESIS_HASH, $first->previous_hash);
        $this->assertSame($first->hash, $second->previous_hash);
        $this->assertNotSame($first->hash, $second->hash);
    }

    public function test_records_actor_targets_and_outcome(): void
    {
        $actor = User::factory()->create();

        $this->logger()->record('lock.unlock_requested', AuditOutcome::Denied, actor: $actor, targets: ['user' => 7, 'lock' => 3], reason: 'Outside schedule.');

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'lock.unlock_requested',
            'outcome' => 'denied',
            'actor_type' => 'user',
            'actor_user_id' => $actor->id,
            'target_user_id' => 7,
            'target_lock_id' => 3,
            'reason' => 'Outside schedule.',
        ]);
    }

    public function test_sensitive_metadata_is_redacted_at_any_depth(): void
    {
        $record = $this->logger()->record('user.updated', AuditOutcome::Success, metadata: [
            'password' => 'hunter2hunter2',
            'changes' => ['email' => 'new@example.com', 'mfa_secret' => 'ABC', 'access_code' => '1234'],
            'session_token' => 'xyz',
        ]);

        $stored = AuditLog::query()->findOrFail($record->id)->metadata;

        $this->assertSame('[redacted]', $stored['password']);
        $this->assertSame('[redacted]', $stored['session_token']);
        $this->assertSame('[redacted]', $stored['changes']['mfa_secret']);
        $this->assertSame('[redacted]', $stored['changes']['access_code']);
        $this->assertSame('new@example.com', $stored['changes']['email']);
        $this->assertStringNotContainsString('hunter2', (string) DB::table('audit_logs')->value('metadata'));
    }

    public function test_database_rejects_updates_and_deletes(): void
    {
        $this->logger()->record('user.created', AuditOutcome::Success);

        foreach ([
            fn () => DB::table('audit_logs')->update(['outcome' => 'failure']),
            fn () => DB::table('audit_logs')->delete(),
        ] as $attempt) {
            try {
                $attempt();
                $this->fail('The database accepted a change to the audit log.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('append-only', $exception->getMessage());
            }
        }

        $this->assertSame(1, AuditLog::query()->count());
    }

    public function test_model_refuses_updates_and_deletes(): void
    {
        $record = $this->logger()->record('user.created', AuditOutcome::Success);

        $this->expectException(LogicException::class);

        $record->update(['outcome' => AuditOutcome::Failure]);
    }

    public function test_write_failure_throws_audit_write_failed(): void
    {
        DB::statement('ALTER TABLE audit_logs RENAME TO audit_logs_unavailable');

        $this->expectException(AuditWriteFailed::class);

        $this->logger()->record('lock.unlock_requested', AuditOutcome::Success);
    }
}
