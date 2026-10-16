<?php

namespace App\Services\Locks;

use App\Enums\AccessChannel;
use App\Enums\AccessRequestStatus;
use App\Enums\AuditOutcome;
use App\Enums\LockAction;
use App\Enums\PermissionKey;
use App\Exceptions\ApiException;
use App\Jobs\SubmitLockCommand;
use App\Models\AccessRequest;
use App\Models\AuthorizationDecision;
use App\Models\Lock;
use App\Models\LockCommand;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\PermissionResolver;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The single entry point for every lock and unlock request (project spec section 9). Controllers
 * must not implement their own authorization for lock operations.
 *
 * Each request is recorded, every policy check is evaluated in a fixed order and stored with the
 * decision, and only an authorized request is queued for {@see SubmitLockCommand}. The first
 * failing check denies the request; deny by default.
 */
class LockCommandService
{
    public function __construct(
        private readonly PermissionResolver $permissions,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * @param  ?int  $identityConfirmedAt  Unix time the user last proved their identity in this session.
     */
    public function request(
        User $user,
        Lock $lock,
        LockAction $action,
        AccessChannel $channel,
        string $idempotencyKey,
        ?int $identityConfirmedAt,
        ?string $ipAddress = null,
        ?string $userAgent = null,
    ): AccessRequest {
        $existing = $this->findDuplicate($user, $lock, $action, $idempotencyKey);
        if ($existing !== null) {
            return $existing;
        }

        try {
            return DB::transaction(fn (): AccessRequest => $this->createAndDecide(
                $user, $lock, $action, $channel, $idempotencyKey, $identityConfirmedAt, $ipAddress, $userAgent,
            ));
        } catch (UniqueConstraintViolationException) {
            // A concurrent request with the same idempotency key won the race; return that one.
            return $this->findDuplicate($user, $lock, $action, $idempotencyKey)
                ?? throw new ApiException(409, 'idempotency_conflict', 'A request with this idempotency key is already being processed.');
        }
    }

    private function findDuplicate(User $user, Lock $lock, LockAction $action, string $idempotencyKey): ?AccessRequest
    {
        $existing = AccessRequest::query()
            ->where('user_id', $user->id)
            ->where('idempotency_key', $idempotencyKey)
            ->first();

        if ($existing !== null && ($existing->lock_id !== $lock->id || $existing->action !== $action)) {
            throw new ApiException(409, 'idempotency_key_reused', 'This idempotency key was already used for a different request.');
        }

        return $existing;
    }

    private function createAndDecide(
        User $user,
        Lock $lock,
        LockAction $action,
        AccessChannel $channel,
        string $idempotencyKey,
        ?int $identityConfirmedAt,
        ?string $ipAddress,
        ?string $userAgent,
    ): AccessRequest {
        // Serialize requests per lock so two cannot both pass the lock_busy check.
        $lock = Lock::query()->whereKey($lock->id)->lockForUpdate()->firstOrFail();
        $now = now();

        $request = AccessRequest::query()->create([
            'public_id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'lock_id' => $lock->id,
            'action' => $action,
            'channel' => $channel,
            'idempotency_key' => $idempotencyKey,
            'status' => AccessRequestStatus::Received,
            'requested_at' => $now,
            'expires_at' => $now->copy()->addSeconds((int) config('lockguard.locks.request_ttl_seconds')),
            'ip_address' => $ipAddress,
            'user_agent' => $userAgent === null ? null : Str::limit($userAgent, 252, '...'),
        ]);
        $request->forceFill(['status' => AccessRequestStatus::Authenticating])->save();

        [$checks, $failure] = $this->evaluate($user, $lock, $action, $channel, $identityConfirmedAt);

        AuthorizationDecision::query()->create([
            'access_request_id' => $request->id,
            'decision' => $failure === null ? AuthorizationDecision::ALLOW : AuthorizationDecision::DENY,
            'reason_code' => $failure['code'] ?? 'authorized',
            'reason' => $failure['message'] ?? 'All checks passed.',
            'checks' => $checks,
            'decided_at' => now(),
        ]);

        $auditContext = ['request_id' => $request->public_id, 'action' => $action->value, 'channel' => $channel->value];

        if ($failure !== null) {
            $request->forceFill(['status' => AccessRequestStatus::Denied, 'completed_at' => now()])->save();
            $this->audit->record('lock.command_denied', AuditOutcome::Denied, actor: $user, targets: ['user' => $user->id, 'lock' => $lock->id], reason: $failure['message'], metadata: [...$auditContext, 'denial' => $failure['code']]);

            return $request;
        }

        $request->forceFill(['status' => AccessRequestStatus::Authorized])->save();
        $this->audit->record('lock.command_authorized', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id, 'lock' => $lock->id], metadata: $auditContext);

        LockCommand::query()->create([
            'access_request_id' => $request->id,
            'lock_id' => $lock->id,
            'action' => $action,
            'queued_at' => now(),
        ]);
        $request->forceFill(['status' => AccessRequestStatus::Queued])->save();

        SubmitLockCommand::dispatch($request->id)->afterCommit();

        return $request;
    }

    /**
     * Run every policy check in order, stopping at the first failure.
     *
     * @return array{0: list<array{check: string, result: string, detail?: string}>, 1: array{code: string, message: string}|null}
     */
    private function evaluate(User $user, Lock $lock, LockAction $action, AccessChannel $channel, ?int $identityConfirmedAt): array
    {
        $isRemoteUnlock = $action === LockAction::Unlock && $channel === AccessChannel::Remote;
        $remotePolicy = (string) config('lockguard.locks.remote_unlock_policy');

        $checks = [
            'account_active' => fn (): ?array => $user->isActive() ? null
                : ['account_inactive', 'This account is suspended, revoked or expired.'],

            'valid_operation' => fn (): ?array => match (true) {
                $channel === AccessChannel::Proximity => ['proximity_unavailable', 'Proximity unlocking is not available yet.'],
                ! $lock->isRegistered() => ['lock_not_registered', 'This lock is not registered for use.'],
                ! $lock->commands_enabled => ['lock_commands_disabled', 'Commands are turned off for this lock.'],
                default => null,
            },

            'permission' => function () use ($user, $action, $isRemoteUnlock): ?array {
                $required = $action === LockAction::Lock ? [PermissionKey::LockLock] : [PermissionKey::LockUnlock];
                if ($isRemoteUnlock) {
                    $required[] = PermissionKey::LockRemoteUnlock;
                }
                foreach ($required as $permission) {
                    if (! $this->permissions->allows($user, $permission)) {
                        return ['permission_denied', "You do not have the \"{$permission->label()}\" permission."];
                    }
                }

                return null;
            },

            'lock_access' => fn (): ?array => $this->accessRow($user, $lock) !== null ? null
                : ['no_lock_access', 'You have not been given access to this lock.'],

            'schedule' => function () use ($user, $lock): ?array {
                $access = $this->accessRow($user, $lock);
                $from = $access->valid_from === null ? null : Carbon::parse($access->valid_from);
                $until = $access->valid_until === null ? null : Carbon::parse($access->valid_until);
                if ($from !== null && now()->lt($from)) {
                    return ['outside_access_window', 'Your access to this lock has not started yet.'];
                }
                if ($until !== null && now()->gte($until)) {
                    return ['outside_access_window', 'Your access to this lock has ended.'];
                }

                return null;
            },

            'remote_unlock_policy' => fn (): ?array => match (true) {
                ! $isRemoteUnlock => null,
                $remotePolicy === 'disabled' => ['remote_unlock_disabled', 'Remote unlocking is turned off.'],
                in_array($remotePolicy, ['standard', 'step_up', 'location_required'], true) => null,
                default => ['remote_unlock_policy_invalid', 'The remote-unlock policy is misconfigured, so remote unlocking is refused.'],
            },

            'authentication_strength' => function () use ($isRemoteUnlock, $remotePolicy, $identityConfirmedAt): ?array {
                if (! $isRemoteUnlock || $remotePolicy !== 'step_up') {
                    return null;
                }
                $window = (int) config('lockguard.auth.step_up_seconds');
                if ($identityConfirmedAt === null || now()->getTimestamp() - $identityConfirmedAt > $window) {
                    return ['step_up_required', 'Confirm your identity before unlocking remotely.'];
                }

                return null;
            },

            'location' => fn (): ?array => $isRemoteUnlock && $remotePolicy === 'location_required'
                ? ['location_unavailable', 'A recent location report is required, and location-aware access is not available yet.']
                : null,

            'security_hold' => fn (): ?array => null,

            'lock_busy' => fn (): ?array => AccessRequest::query()
                ->where('lock_id', $lock->id)
                ->whereIn('status', [AccessRequestStatus::Queued, AccessRequestStatus::Submitted])
                ->exists()
                ? ['lock_busy', 'Another command for this lock is still in progress. Wait for it to finish.']
                : null,
        ];

        $notApplicable = [
            'security_hold' => 'Lockdown and security holds are not implemented yet.',
        ];

        $results = [];
        foreach ($checks as $name => $check) {
            $failure = $check();
            if ($failure !== null) {
                $results[] = ['check' => $name, 'result' => 'fail', 'detail' => $failure[0]];

                return [$results, ['code' => $failure[0], 'message' => $failure[1]]];
            }
            $results[] = isset($notApplicable[$name])
                ? ['check' => $name, 'result' => 'not_applicable', 'detail' => $notApplicable[$name]]
                : ['check' => $name, 'result' => 'pass'];
        }

        return [$results, null];
    }

    /**
     * The user_lock_access pivot row, or null when the user has no access to the lock.
     */
    private function accessRow(User $user, Lock $lock): ?object
    {
        return $user->locks()->whereKey($lock->id)->first()?->pivot;
    }
}
