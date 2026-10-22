<?php

namespace App\Services\Audit;

use App\Enums\AuditActorType;
use App\Enums\AuditOutcome;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\Security\AlertEngine;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Writes tamper-evident audit records.
 *
 * Each record's hash is an HMAC-SHA256 (keyed from APP_KEY) over its canonical content plus the
 * previous record's hash, forming a chain that `lockguard:audit-verify` can check. Sensitive
 * metadata keys are redacted before anything is stored.
 *
 * A failed write throws {@see AuditWriteFailed}. Callers performing sensitive operations must let
 * it propagate (and roll back their own transaction) so the operation never succeeds unaudited.
 *
 * Once the caller's transaction commits, records the alert engine watches are handed to it.
 */
class AuditLogger
{
    public const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

    private const REDACTED = '[redacted]';

    private const SENSITIVE_KEY_PATTERN = '/pass(word)?|secret|token|otp|pin|code|credential|cookie|session|authorization|api[_-]?key/i';

    public function __construct(private readonly Request $request) {}

    /**
     * @param  array{user?: ?int, device?: ?int, lock?: ?int}  $targets
     * @param  array<string, mixed>  $metadata
     *
     * @throws AuditWriteFailed
     */
    public function record(
        string $action,
        AuditOutcome $outcome,
        ?User $actor = null,
        array $targets = [],
        ?string $reason = null,
        array $metadata = [],
        ?string $correlationId = null,
        ?AuditActorType $actorType = null,
    ): AuditLog {
        $attributes = [
            'event_id' => (string) Str::uuid(),
            'occurred_at' => Carbon::now('UTC')->format('Y-m-d H:i:s.u'),
            'actor_type' => ($actorType ?? ($actor ? AuditActorType::User : AuditActorType::System))->value,
            'actor_user_id' => $actor?->getKey(),
            'action' => $action,
            'outcome' => $outcome->value,
            'target_user_id' => $targets['user'] ?? null,
            'target_device_id' => $targets['device'] ?? null,
            'target_lock_id' => $targets['lock'] ?? null,
            'reason' => $reason,
            'correlation_id' => $correlationId ?? $this->request->header('X-Correlation-Id'),
            'session_ref' => $this->sessionReference(),
            'ip_address' => $this->request->ip(),
            'user_agent' => Str::limit((string) $this->request->userAgent(), 252, '...') ?: null,
            'metadata' => $metadata === [] ? null : self::redact($metadata),
        ];

        try {
            $record = Cache::lock('audit-log-chain', 10)->block(5, fn (): AuditLog => DB::transaction(function () use ($attributes): AuditLog {
                $previousHash = AuditLog::query()->latest('id')->lockForUpdate()->value('hash') ?? self::GENESIS_HASH;

                return AuditLog::query()->create([
                    ...$attributes,
                    'previous_hash' => $previousHash,
                    'hash' => self::hashFor($attributes, $previousHash),
                ]);
            }));
        } catch (Throwable $exception) {
            report($exception);
            AlertEngine::noteAuditWriteFailure($action, $exception);

            throw new AuditWriteFailed("Audit record for [{$action}] could not be written.", previous: $exception);
        }

        if (AlertEngine::watches($action)) {
            DB::afterCommit(fn () => $this->observe($record));
        }

        return $record;
    }

    /**
     * Hands a committed record to the alert engine. Alerting never fails the audited operation.
     */
    private function observe(AuditLog $record): void
    {
        try {
            app(AlertEngine::class)->observe($record);
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    /**
     * @param  array<string, mixed>  $attributes  Stored column values; metadata as an array or null.
     */
    public static function hashFor(array $attributes, string $previousHash): string
    {
        $fields = [
            'event_id', 'occurred_at', 'actor_type', 'actor_user_id', 'action', 'outcome',
            'target_user_id', 'target_device_id', 'target_lock_id', 'reason', 'correlation_id',
            'session_ref', 'ip_address', 'user_agent', 'metadata',
        ];

        $content = [];
        foreach ($fields as $field) {
            $value = $attributes[$field] ?? null;
            $content[$field] = is_int($value) ? (string) $value : $value;
        }
        $content['previous_hash'] = $previousHash;

        return hash_hmac('sha256', self::canonicalJson($content), self::chainKey());
    }

    /**
     * @param  array<array-key, mixed>  $value
     */
    public static function canonicalJson(array $value): string
    {
        return json_encode(self::sortKeys($value), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    /**
     * @param  array<array-key, mixed>  $metadata
     * @return array<array-key, mixed>
     */
    public static function redact(array $metadata): array
    {
        foreach ($metadata as $key => $value) {
            if (is_string($key) && preg_match(self::SENSITIVE_KEY_PATTERN, $key)) {
                $metadata[$key] = self::REDACTED;
            } elseif (is_array($value)) {
                $metadata[$key] = self::redact($value);
            }
        }

        return $metadata;
    }

    /**
     * @param  array<array-key, mixed>  $value
     * @return array<array-key, mixed>
     */
    private static function sortKeys(array $value): array
    {
        if (! array_is_list($value)) {
            ksort($value, SORT_STRING);
        }

        return array_map(fn (mixed $item): mixed => is_array($item) ? self::sortKeys($item) : $item, $value);
    }

    private static function chainKey(): string
    {
        return hash_hmac('sha256', 'lockguard-audit-chain', (string) config('app.key'), true);
    }

    /**
     * A non-reversible reference to the session, so records can be correlated without storing the session id.
     */
    private function sessionReference(): ?string
    {
        if (! $this->request->hasSession()) {
            return null;
        }

        return substr(hash_hmac('sha256', $this->request->session()->getId(), self::chainKey()), 0, 32);
    }
}
