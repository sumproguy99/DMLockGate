<?php

namespace App\Http\Controllers\Api\V1\Security;

use App\Enums\AlertRule;
use App\Enums\AlertSeverity;
use App\Enums\AlertStatus;
use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\SecurityAlertResource;
use App\Models\SecurityAlert;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Security Center alerts. Viewing needs admin.incidents_view; acknowledging and resolving need
 * admin.incidents_manage and are audited. Condition alerts (a lock offline, a low battery) cannot be
 * resolved by hand: they resolve themselves when the condition clears.
 */
class SecurityAlertController extends Controller
{
    private const RELATIONS = ['subjectUser:id,name', 'subjectLock:id,name', 'incident:id,public_id,title,status', 'acknowledger:id,name', 'resolver:id,name'];

    public function __construct(
        private readonly UserManagementGuard $guard,
        private readonly AuditLogger $audit,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->guard->requirePermission($request->user(), PermissionKey::AdminIncidentsView, 'security.alerts_viewed');

        $filters = $request->validate([
            'status' => ['nullable', Rule::in(['active', ...array_map(fn (AlertStatus $status): string => $status->value, AlertStatus::cases())])],
            'severity' => ['nullable', Rule::enum(AlertSeverity::class)],
            'rule' => ['nullable', Rule::enum(AlertRule::class)],
            'search' => ['nullable', 'string', 'max:255'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $alerts = SecurityAlert::query()
            ->with(self::RELATIONS)
            ->when($filters['status'] ?? null, fn (Builder $query, string $status) => $status === 'active'
                ? $query->active()
                : $query->where('status', $status))
            ->when($filters['severity'] ?? null, fn (Builder $query, string $severity) => $query->whereIn('severity', AlertSeverity::from($severity)->andAbove()))
            ->when($filters['rule'] ?? null, fn (Builder $query, string $rule) => $query->where('rule', $rule))
            ->when($filters['search'] ?? null, fn (Builder $query, string $search) => $query->where(fn (Builder $inner) => $inner
                ->where('title', 'like', "%{$search}%")
                ->orWhere('description', 'like', "%{$search}%")))
            ->orderByDesc('last_seen_at')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 50)
            ->withQueryString();

        return SecurityAlertResource::collection($alerts);
    }

    public function show(Request $request, SecurityAlert $alert): SecurityAlertResource
    {
        $this->guard->requirePermission($request->user(), PermissionKey::AdminIncidentsView, 'security.alerts_viewed');

        return (new SecurityAlertResource($alert->load(self::RELATIONS)))->withDetail();
    }

    public function acknowledge(Request $request, SecurityAlert $alert): SecurityAlertResource
    {
        $actor = $request->user();
        $this->guard->requirePermission($actor, PermissionKey::AdminIncidentsManage, 'security.alert_acknowledged');

        DB::transaction(function () use ($actor, $alert): void {
            $locked = SecurityAlert::query()->whereKey($alert->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== AlertStatus::Open) {
                throw new ApiException(409, 'alert_not_open', 'This alert has already been acknowledged or resolved.');
            }

            $locked->update(['status' => AlertStatus::Acknowledged, 'acknowledged_by' => $actor->id, 'acknowledged_at' => now()]);
            $this->audit->record('security.alert_acknowledged', AuditOutcome::Success, actor: $actor, targets: ['user' => $locked->subject_user_id, 'lock' => $locked->subject_lock_id], metadata: [
                'alert_id' => $locked->public_id,
                'rule' => $locked->rule->value,
            ]);
        });

        return (new SecurityAlertResource($alert->refresh()->load(self::RELATIONS)))->withDetail();
    }

    public function resolve(Request $request, SecurityAlert $alert): SecurityAlertResource
    {
        $actor = $request->user();
        $this->guard->requirePermission($actor, PermissionKey::AdminIncidentsManage, 'security.alert_resolved');

        $note = $request->validate(['note' => ['nullable', 'string', 'max:2000']])['note'] ?? null;

        DB::transaction(function () use ($actor, $alert, $note): void {
            $locked = SecurityAlert::query()->whereKey($alert->id)->lockForUpdate()->firstOrFail();
            if (! $locked->isActive()) {
                throw new ApiException(409, 'alert_resolved', 'This alert is already resolved.');
            }
            if ($locked->rule->isCondition()) {
                throw new ApiException(409, 'alert_resolves_itself', 'This alert resolves itself when the problem clears. Acknowledge it to show it is being handled.');
            }

            $locked->update([
                'status' => AlertStatus::Resolved,
                'resolved_by' => $actor->id,
                'resolved_at' => now(),
                'resolution' => SecurityAlert::RESOLUTION_MANUAL,
                'resolution_note' => $note,
            ]);
            $this->audit->record('security.alert_resolved', AuditOutcome::Success, actor: $actor, targets: ['user' => $locked->subject_user_id, 'lock' => $locked->subject_lock_id], reason: $note, metadata: [
                'alert_id' => $locked->public_id,
                'rule' => $locked->rule->value,
            ]);
        });

        return (new SecurityAlertResource($alert->refresh()->load(self::RELATIONS)))->withDetail();
    }
}
