<?php

namespace App\Http\Controllers\Api\V1\Location;

use App\Enums\AccessRequestStatus;
use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Models\LocationReport;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The location map: a pin for each lock request a phone sent with its position, and each location
 * a phone shared when an administrator asked. Needs location.view_history; every view is audited.
 */
class LocationMapController extends Controller
{
    public const PERIODS = [1, 7, 30];

    public function __construct(
        private readonly UserManagementGuard $guard,
        private readonly AuditLogger $audit,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $actor = $request->user();
        $this->guard->requirePermission($actor, PermissionKey::LocationViewHistory, 'location.history_viewed');

        $filters = $request->validate([
            'days' => ['sometimes', 'integer', Rule::in(self::PERIODS)],
            'user_id' => ['sometimes', 'integer'],
        ]);
        $days = (int) ($filters['days'] ?? 7);
        $since = now()->subDays($days);

        $reports = LocationReport::query()
            ->with(['user:id,name', 'device:id,name,status', 'accessRequest.lock:id,name', 'locationRequest.requester:id,name'])
            ->where('received_at', '>=', $since)
            ->when(isset($filters['user_id']), fn ($query) => $query->where('user_id', $filters['user_id']))
            ->orderByDesc('received_at')
            ->limit(500)
            ->get();

        $this->audit->record('location.history_viewed', AuditOutcome::Info, actor: $actor, targets: ['user' => $filters['user_id'] ?? null], metadata: [
            'days' => $days,
            'pins' => $reports->count(),
        ]);

        return response()->json(['data' => [
            'days' => $days,
            'retention_days' => (int) config('lockguard.location.retention_days'),
            'pins' => $reports->map(fn (LocationReport $report): array => $this->pin($report))->all(),
            'people' => User::query()
                ->where('status', UserStatus::Active)
                ->orderBy('name')
                ->get(['id', 'name'])
                ->map(fn (User $user): array => ['id' => $user->id, 'name' => $user->name])
                ->all(),
        ]]);
    }

    /**
     * @return array<string, mixed>
     */
    private function pin(LocationReport $report): array
    {
        $pin = [
            'id' => $report->id,
            'kind' => $report->purpose,
            'latitude' => $report->latitude,
            'longitude' => $report->longitude,
            'accuracy_meters' => $report->accuracy_meters,
            'captured_at' => $report->captured_at->toIso8601ZuluString('millisecond'),
            'user' => ['id' => $report->user->id, 'name' => $report->user->name],
            'device' => $report->device === null ? null : [
                'id' => $report->device->id,
                'name' => $report->device->name,
                'status' => $report->device->status->value,
            ],
        ];

        $accessRequest = $report->accessRequest;
        if ($accessRequest !== null) {
            return [...$pin,
                'at' => $accessRequest->requested_at->toIso8601ZuluString('millisecond'),
                'action' => $accessRequest->action->value,
                'lock' => ['id' => $accessRequest->lock->id, 'name' => $accessRequest->lock->name],
                'status' => $accessRequest->status->value,
                'outcome' => self::outcomeOf($accessRequest->status),
            ];
        }

        $requester = $report->locationRequest?->requester;

        return [...$pin,
            'at' => $report->captured_at->toIso8601ZuluString('millisecond'),
            'requested_by' => $requester === null ? null : ['id' => $requester->id, 'name' => $requester->name],
        ];
    }

    /**
     * success and failure as the person pressing the button would see them; unknown when the lock
     * never confirmed, pending while the request is still on its way.
     */
    private static function outcomeOf(AccessRequestStatus $status): string
    {
        return match ($status) {
            AccessRequestStatus::ConfirmedSuccess, AccessRequestStatus::AlreadyInState => 'success',
            AccessRequestStatus::Denied => 'denied',
            AccessRequestStatus::Failed, AccessRequestStatus::Expired, AccessRequestStatus::Cancelled => 'failure',
            AccessRequestStatus::UnknownResult => 'unknown',
            default => 'pending',
        };
    }
}
