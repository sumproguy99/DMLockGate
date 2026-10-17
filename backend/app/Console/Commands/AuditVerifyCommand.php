<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Services\Audit\AuditIntegrity;
use App\Services\Audit\AuditLogger;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('lockguard:audit-verify')]
#[Description('Verify the audit log hash chain and that the append-only triggers are installed')]
class AuditVerifyCommand extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(AuditIntegrity $integrity): int
    {
        $protected = $integrity->triggersInstalled();
        $protected
            ? $this->components->info('Append-only triggers: PROTECTED (UPDATE and DELETE are rejected by the database).')
            : $this->components->error('Append-only triggers: UNPROTECTED. Run scripts\\protect-audit-log.ps1 as the MySQL administrator.');

        $expectedPrevious = AuditLogger::GENESIS_HASH;
        $checked = 0;
        $broken = null;

        AuditLog::query()->orderBy('id')->chunkById(500, function ($records) use (&$expectedPrevious, &$checked, &$broken): bool {
            foreach ($records as $record) {
                $attributes = [
                    ...$record->getAttributes(),
                    'occurred_at' => $this->normalizedTimestamp($record->getRawOriginal('occurred_at')),
                    'metadata' => $record->metadata,
                ];

                if ($record->previous_hash !== $expectedPrevious) {
                    $broken = "record #{$record->id} does not link to the previous record (a record was removed or inserted)";
                } elseif (! hash_equals(AuditLogger::hashFor($attributes, $record->previous_hash), $record->hash)) {
                    $broken = "record #{$record->id} content does not match its hash (the record was modified)";
                }

                if ($broken !== null) {
                    return false;
                }

                $expectedPrevious = $record->hash;
                $checked++;
            }

            return true;
        });

        if ($broken !== null) {
            $this->components->error("Hash chain: BROKEN after {$checked} valid record(s): {$broken}.");

            return self::FAILURE;
        }

        $this->components->info("Hash chain: INTACT ({$checked} record(s) verified).");

        return $protected ? self::SUCCESS : self::FAILURE;
    }

    /**
     * Databases return fractional timestamps in slightly different shapes; normalize to the format hashed at write time.
     */
    private function normalizedTimestamp(string $raw): string
    {
        return \DateTimeImmutable::createFromFormat('Y-m-d H:i:s.u', str_pad($raw, 26, '0'))->format('Y-m-d H:i:s.u');
    }
}
