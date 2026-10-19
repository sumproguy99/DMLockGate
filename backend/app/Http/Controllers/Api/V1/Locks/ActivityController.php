<?php

namespace App\Http\Controllers\Api\V1\Locks;

use App\Enums\AccessRequestStatus;
use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Enums\ReportedLockState;
use App\Http\Controllers\Controller;
use App\Models\AccessRequest;
use App\Models\Lock;
use App\Models\LockStateEvent;
use App\Models\User;
use App\Services\Authorization\PermissionResolver;
use App\Services\Authorization\UserManagementGuard;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The activity feed for the locks a user may see the history of: lock and unlock requests with
 * their real outcome, and the state changes the locks themselves reported. Newest first, a page at
 * a time. Other people's names are withheld; only "You" or "Another user" is shown.
 */
class ActivityController extends Controller
{
    public const PAGE_SIZE = 30;

    public const TYPES = ['all', 'requests', 'reports'];

    public const OUTCOMES = ['success', 'failure', 'denied', 'pending'];

    public function __construct(
        private readonly UserManagementGuard $guard,
        private readonly PermissionResolver $permissions,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->guard->requirePermission($user, PermissionKey::LockViewHistory, 'activity.viewed');

        $filters = $request->validate([
            'type' => ['sometimes', Rule::in(self::TYPES)],
            'outcome' => ['sometimes', Rule::in(self::OUTCOMES)],
            'before' => ['sometimes', 'date'],
        ]);
        $type = $filters['type'] ?? 'all';
        $outcome = $filters['outcome'] ?? null;
        $before = isset($filters['before']) ? CarbonImmutable::parse($filters['before'])->utc() : null;

        $lockIds = $this->lockIds($user);
        $items = collect();
        if ($type !== 'reports') {
            $items = $items->concat($this->requests($user, $lockIds, $outcome, $before));
        }
        // Lock reports have no outcome of their own, except a jam, which is a failure.
        if ($type !== 'requests' && ($outcome === null || $outcome === 'failure')) {
            $items = $items->concat($this->reports($lockIds, $outcome === 'failure', $before));
        }

        $sorted = $items->sortByDesc('occurred_at')->values();
        $page = $sorted->take(self::PAGE_SIZE)->values();

        return response()->json([
            'data' => $page->all(),
            'next_before' => $sorted->count() > self::PAGE_SIZE ? $page->last()['occurred_at'] : null,
        ]);
    }

    /**
     * Every lock for those who may see all devices, otherwise the user's own locks.
     *
     * @return list<int>
     */
    private function lockIds(User $user): array
    {
        $ids = $this->permissions->allows($user, PermissionKey::DevicesView)
            ? Lock::query()->pluck('id')
            : $user->locks()->pluck('locks.id');

        return $ids->map(fn ($id): int => (int) $id)->values()->all();
    }

    /**
     * @param  list<int>  $lockIds
     * @return Collection<int, array<string, mixed>>
     */
    private function requests(User $user, array $lockIds, ?string $outcome, ?CarbonImmutable $before): Collection
    {
        $statuses = match ($outcome) {
            'success' => [AccessRequestStatus::ConfirmedSuccess, AccessRequestStatus::AlreadyInState],
            'failure' => [AccessRequestStatus::Failed, AccessRequestStatus::UnknownResult],
            'denied' => [AccessRequestStatus::Denied],
            'pending' => array_values(array_filter(AccessRequestStatus::cases(), fn (AccessRequestStatus $status): bool => ! $status->isFinal())),
            default => null,
        };

        return AccessRequest::query()
            ->with('lock:id,name', 'command')
            ->whereIn('lock_id', $lockIds)
            ->when($statuses !== null, fn ($query) => $query->whereIn('status', $statuses))
            ->when($before !== null, fn ($query) => $query->where('requested_at', '<', $before))
            ->orderByDesc('requested_at')
            ->orderByDesc('id')
            ->limit(self::PAGE_SIZE + 1)
            ->get()
            ->map(fn (AccessRequest $request): array => [
                'id' => $request->public_id,
                'kind' => 'request',
                'occurred_at' => $request->requested_at->toIso8601ZuluString('millisecond'),
                'lock' => $request->lock ? ['id' => $request->lock->id, 'name' => $request->lock->name] : null,
                'actor' => $request->user_id === $user->id ? 'You' : 'Another user',
                'outcome' => self::outcomeOf($request->status)->value,
                'request' => [
                    'action' => $request->action->value,
                    'status' => $request->status->value,
                    'status_message' => $request->status->message(),
                    'integration_responded' => $request->command?->integration_result !== null,
                ],
                'report' => null,
            ]);
    }

    /**
     * Reported states that differ from the lock's previous report. The scheduled sync records the
     * same state every few minutes; those repeats are left out.
     *
     * @param  list<int>  $lockIds
     * @return Collection<int, array<string, mixed>>
     */
    private function reports(array $lockIds, bool $jamsOnly, ?CarbonImmutable $before): Collection
    {
        if ($lockIds === []) {
            return collect();
        }

        $withPrevious = DB::table('lock_state_events')
            ->select('id', 'lock_id', 'state', 'source', 'observed_at')
            ->selectRaw('LAG(state) OVER (PARTITION BY lock_id ORDER BY observed_at, id) AS previous_state')
            ->whereIn('lock_id', $lockIds);

        $rows = DB::query()
            ->fromSub($withPrevious, 'events')
            ->where(fn ($query) => $query->whereNull('previous_state')->orWhereColumn('previous_state', '!=', 'state'))
            ->when($jamsOnly, fn ($query) => $query->where('state', ReportedLockState::Jammed->value))
            ->when($before !== null, fn ($query) => $query->where('observed_at', '<', $before->format('Y-m-d H:i:s.v')))
            ->orderByDesc('observed_at')
            ->orderByDesc('id')
            ->limit(self::PAGE_SIZE + 1)
            ->get();

        $names = Lock::query()->whereIn('id', $rows->pluck('lock_id')->unique())->pluck('name', 'id');

        return $rows->map(fn (object $row): array => [
            'id' => 'report-'.$row->id,
            'kind' => 'report',
            'occurred_at' => CarbonImmutable::parse($row->observed_at, 'UTC')->toIso8601ZuluString('millisecond'),
            'lock' => ['id' => (int) $row->lock_id, 'name' => $names[$row->lock_id] ?? null],
            'actor' => $row->source === LockStateEvent::SOURCE_PUSH ? 'Reported by the lock' : 'Found by the scheduled check',
            'outcome' => ($row->state === ReportedLockState::Jammed->value ? AuditOutcome::Failure : AuditOutcome::Info)->value,
            'request' => null,
            'report' => ['state' => $row->state, 'source' => $row->source],
        ]);
    }

    /**
     * The same mapping as the dashboard: a request that expired or was cancelled was never sent.
     */
    private static function outcomeOf(AccessRequestStatus $status): AuditOutcome
    {
        return match ($status) {
            AccessRequestStatus::ConfirmedSuccess, AccessRequestStatus::AlreadyInState => AuditOutcome::Success,
            AccessRequestStatus::Denied => AuditOutcome::Denied,
            AccessRequestStatus::Failed, AccessRequestStatus::UnknownResult => AuditOutcome::Failure,
            default => AuditOutcome::Info,
        };
    }
}
