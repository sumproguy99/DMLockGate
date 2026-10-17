<?php

namespace App\Http\Controllers\Api\V1\System;

use App\Enums\AccessRequestStatus;
use App\Enums\AuditActorType;
use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\AccessRequestResource;
use App\Models\AccessRequest;
use App\Models\AuditLog;
use App\Models\Lock;
use App\Models\User;
use App\Services\Authorization\PermissionResolver;
use App\Services\Authorization\UserManagementGuard;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The dashboard's summaries. Each section is null when the signed-in user may not see it, so the
 * client never has to guess from permissions what the server would allow.
 */
class DashboardController extends Controller
{
    public const ACTIVITY_LIMIT = 15;

    public const SECURITY_WINDOW_HOURS = 24;

    public const EXPIRING_WITHIN_DAYS = 7;

    public function __construct(private readonly PermissionResolver $permissions) {}

    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        $historyLockIds = $this->historyLockIds($user);

        return response()->json(['data' => [
            'users' => $this->users($user),
            'security' => $this->security($user),
            'activity' => $this->activity($user, $historyLockIds),
            'last_requests' => $this->lastRequests($historyLockIds),
        ]]);
    }

    /**
     * Locks whose request history this user may read (LockPolicy::viewHistory), or null for none.
     *
     * @return list<int>|null
     */
    private function historyLockIds(User $user): ?array
    {
        if (! $this->permissions->allows($user, PermissionKey::LockViewHistory)) {
            return null;
        }

        $ids = $this->permissions->allows($user, PermissionKey::DevicesView)
            ? Lock::query()->pluck('id')
            : $user->locks()->pluck('locks.id');

        return $ids->map(fn ($id): int => (int) $id)->values()->all();
    }

    /**
     * @return array<string, int>|null
     */
    private function users(User $user): ?array
    {
        $canView = collect(UserManagementGuard::VIEW_PERMISSIONS)->contains(fn (PermissionKey $key): bool => $this->permissions->allows($user, $key));
        if (! $canView) {
            return null;
        }

        $notExpired = fn ($query) => $query->whereNull('account_expires_at')->orWhere('account_expires_at', '>', now());
        $active = User::query()->where('status', UserStatus::Active)->where($notExpired);

        return [
            'active' => (clone $active)->count(),
            'active_without_mfa' => (clone $active)->whereNull('mfa_confirmed_at')->count(),
            'suspended' => User::query()->where('status', UserStatus::Suspended)->count(),
            'revoked' => User::query()->where('status', UserStatus::Revoked)->count(),
            'expired' => User::query()->where('status', UserStatus::Active)->where('account_expires_at', '<=', now())->count(),
            'temporary_access' => DB::table('user_lock_access')->where('valid_until', '>', now())->count(),
            'expiring_access' => DB::table('user_lock_access')->whereBetween('valid_until', [now(), now()->addDays(self::EXPIRING_WITHIN_DAYS)])->count(),
            'expiring_within_days' => self::EXPIRING_WITHIN_DAYS,
        ];
    }

    /**
     * Counts of failed and denied events in the last 24 hours, and the most recent of them.
     *
     * @return array<string, mixed>|null
     */
    private function security(User $user): ?array
    {
        if (! $this->permissions->allows($user, PermissionKey::AdminIncidentsView)) {
            return null;
        }

        $since = now()->subHours(self::SECURITY_WINDOW_HOURS);
        $failures = fn (string $action): int => AuditLog::query()
            ->where('action', $action)
            ->whereIn('outcome', [AuditOutcome::Failure, AuditOutcome::Denied])
            ->where('occurred_at', '>=', $since)
            ->count();

        $recent = AuditLog::query()
            ->with('actor:id,name')
            ->whereIn('outcome', [AuditOutcome::Failure, AuditOutcome::Denied])
            ->where('occurred_at', '>=', $since)
            ->orderByDesc('id')
            ->limit(5)
            ->get();

        return [
            'window_hours' => self::SECURITY_WINDOW_HOURS,
            'failed_sign_ins' => $failures('auth.login'),
            'failed_mfa' => $failures('auth.mfa_verify'),
            'failed_step_ups' => $failures('auth.step_up'),
            'denied_commands' => $failures('lock.command_denied'),
            'unresolved_commands' => AccessRequest::query()
                ->whereIn('status', [AccessRequestStatus::Failed, AccessRequestStatus::UnknownResult])
                ->where('requested_at', '>=', $since)
                ->count(),
            'recent' => $this->auditEntries($recent),
        ];
    }

    /**
     * Security administrators and auditors see the audit trail; other people with history access see
     * the lock requests on their locks, with other people's names withheld.
     *
     * @param  list<int>|null  $historyLockIds
     * @return list<array<string, mixed>>|null
     */
    private function activity(User $user, ?array $historyLockIds): ?array
    {
        if ($this->permissions->allows($user, PermissionKey::AdminIncidentsView)) {
            return $this->auditEntries(AuditLog::query()->with('actor:id,name')->orderByDesc('id')->limit(self::ACTIVITY_LIMIT)->get());
        }

        if ($historyLockIds === null) {
            return null;
        }

        return AccessRequest::query()
            ->with('lock:id,name', 'command')
            ->whereIn('lock_id', $historyLockIds)
            ->orderByDesc('requested_at')
            ->limit(self::ACTIVITY_LIMIT)
            ->get()
            ->map(fn (AccessRequest $request): array => [
                'id' => $request->public_id,
                'kind' => 'request',
                'occurred_at' => $request->requested_at->toIso8601ZuluString('millisecond'),
                'action' => 'lock.request',
                'outcome' => match ($request->status) {
                    AccessRequestStatus::ConfirmedSuccess, AccessRequestStatus::AlreadyInState => AuditOutcome::Success->value,
                    AccessRequestStatus::Denied => AuditOutcome::Denied->value,
                    AccessRequestStatus::Failed, AccessRequestStatus::UnknownResult => AuditOutcome::Failure->value,
                    default => AuditOutcome::Info->value,
                },
                'actor' => $request->user_id === $user->id ? 'You' : 'Another user',
                'lock' => $request->lock?->name,
                'detail' => $request->status->message(),
                'request' => [
                    'action' => $request->action->value,
                    'status' => $request->status->value,
                    'integration_responded' => $request->command?->integration_result !== null,
                ],
            ])
            ->all();
    }

    /**
     * The newest request for each lock, so the lock panel can show the last command outcome.
     *
     * @param  list<int>|null  $historyLockIds
     * @return list<AccessRequestResource>|null
     */
    private function lastRequests(?array $historyLockIds): ?array
    {
        if ($historyLockIds === null) {
            return null;
        }

        $latestIds = AccessRequest::query()
            ->whereIn('lock_id', $historyLockIds)
            ->selectRaw('max(id) as id')
            ->groupBy('lock_id')
            ->pluck('id');

        return AccessRequest::query()
            ->with('decision', 'command')
            ->whereIn('id', $latestIds)
            ->get()
            ->map(fn (AccessRequest $request): AccessRequestResource => new AccessRequestResource($request))
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, AuditLog>  $records
     * @return list<array<string, mixed>>
     */
    private function auditEntries(Collection $records): array
    {
        $lockNames = Lock::query()->whereIn('id', $records->pluck('target_lock_id')->filter()->unique())->pluck('name', 'id');
        $userNames = User::query()->whereIn('id', $records->pluck('target_user_id')->filter()->unique())->pluck('name', 'id');

        return $records->map(fn (AuditLog $record): array => [
            'id' => $record->event_id,
            'kind' => 'audit',
            'occurred_at' => CarbonImmutable::parse($record->occurred_at, 'UTC')->toIso8601ZuluString('millisecond'),
            'action' => $record->action,
            'outcome' => $record->outcome->value,
            'actor' => $this->actorName($record, $userNames),
            'lock' => $record->target_lock_id === null ? null : ($lockNames[$record->target_lock_id] ?? 'Removed lock'),
            'detail' => $record->reason,
        ])->values()->all();
    }

    /**
     * Sign-in attempts are recorded before anyone is signed in, so their actor is the account being
     * signed in to, or nobody when the email matched no account.
     *
     * @param  Collection<int, string>  $userNames  Target user names by id.
     */
    private function actorName(AuditLog $record, Collection $userNames): string
    {
        if ($record->actor_user_id !== null) {
            return $record->actor?->name ?? 'Removed user';
        }
        if (str_starts_with($record->action, 'auth.')) {
            return $record->target_user_id === null ? 'Unknown account' : ($userNames[$record->target_user_id] ?? 'Removed user');
        }

        return $record->actor_type === AuditActorType::Integration ? 'Eufy bridge' : 'System';
    }
}
