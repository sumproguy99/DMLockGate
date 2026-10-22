<?php

namespace App\Http\Controllers\Api\V1\Security;

use App\Enums\AlertSeverity;
use App\Enums\AlertStatus;
use App\Enums\AuditOutcome;
use App\Enums\IncidentStatus;
use App\Enums\PermissionKey;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\SecurityIncidentResource;
use App\Models\SecurityAlert;
use App\Models\SecurityIncident;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\UserManagementGuard;
use App\Services\Security\AlertEngine;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Security incidents (project.md section 18, incident lifecycle). Viewing needs
 * admin.incidents_view; opening incidents and changing their status need admin.incidents_manage.
 * Every change is audited and kept in the incident's history with the person who made it.
 */
class SecurityIncidentController extends Controller
{
    public function __construct(
        private readonly UserManagementGuard $guard,
        private readonly AuditLogger $audit,
        private readonly AlertEngine $engine,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->guard->requirePermission($request->user(), PermissionKey::AdminIncidentsView, 'security.incidents_viewed');

        $filters = $request->validate([
            'status' => ['nullable', Rule::in(['active', ...array_map(fn (IncidentStatus $status): string => $status->value, IncidentStatus::cases())])],
            'severity' => ['nullable', Rule::enum(AlertSeverity::class)],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $incidents = SecurityIncident::query()
            ->with('opener:id,name')
            ->withCount('alerts')
            ->when($filters['status'] ?? null, fn (Builder $query, string $status) => $query->whereIn('status', $status === 'active' ? IncidentStatus::active() : [$status]))
            ->when($filters['severity'] ?? null, fn (Builder $query, string $severity) => $query->whereIn('severity', AlertSeverity::from($severity)->andAbove()))
            ->orderByDesc('opened_at')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 50)
            ->withQueryString();

        return SecurityIncidentResource::collection($incidents);
    }

    public function show(Request $request, SecurityIncident $incident): SecurityIncidentResource
    {
        $this->guard->requirePermission($request->user(), PermissionKey::AdminIncidentsView, 'security.incidents_viewed');

        return $this->present($incident);
    }

    public function store(Request $request): SecurityIncidentResource
    {
        $actor = $request->user();
        $this->guard->requirePermission($actor, PermissionKey::AdminIncidentsManage, 'security.incident_opened');

        $data = $request->validate([
            'title' => ['required', 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:5000'],
            'severity' => ['required', Rule::enum(AlertSeverity::class)],
            'alert_ids' => ['sometimes', 'array', 'max:50'],
            'alert_ids.*' => ['uuid', 'distinct'],
        ]);

        $incident = DB::transaction(function () use ($actor, $data): SecurityIncident {
            $alerts = SecurityAlert::query()->whereIn('public_id', $data['alert_ids'] ?? [])->lockForUpdate()->get();
            if ($alerts->count() !== count($data['alert_ids'] ?? [])) {
                throw new ApiException(422, 'validation_failed', 'Some fields need attention.', ['alert_ids' => ['One or more alerts were not found.']]);
            }

            $incident = SecurityIncident::query()->create([
                'public_id' => (string) Str::uuid(),
                'title' => $data['title'],
                'description' => $data['description'] ?? null,
                'severity' => AlertSeverity::from($data['severity']),
                'status' => IncidentStatus::New,
                'subject_key' => $alerts->count() === 1 ? AlertEngine::subjectKey($alerts->first()) : null,
                'opened_by' => $actor->id,
                'opened_at' => now(),
            ]);
            $this->engine->history($incident, null, IncidentStatus::New, 'Opened by hand.', $actor);

            foreach ($alerts as $alert) {
                $alert->update(['security_incident_id' => $incident->id]);
                $this->engine->history($incident, null, null, 'Alert added: '.$alert->title, $actor);
            }

            $this->audit->record('security.incident_opened', AuditOutcome::Success, actor: $actor, metadata: [
                'incident_id' => $incident->public_id,
                'severity' => $incident->severity->value,
                'alert_ids' => $alerts->pluck('public_id')->all(),
            ]);

            return $incident;
        });

        return $this->present($incident);
    }

    /**
     * Move an incident through its lifecycle. A closed incident is final. Resolving or closing it also
     * resolves its event alerts; condition alerts still resolve themselves when the problem clears.
     */
    public function updateStatus(Request $request, SecurityIncident $incident): SecurityIncidentResource
    {
        $actor = $request->user();
        $this->guard->requirePermission($actor, PermissionKey::AdminIncidentsManage, 'security.incident_status_changed');

        $data = $request->validate([
            'status' => ['required', Rule::enum(IncidentStatus::class)],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);
        $to = IncidentStatus::from($data['status']);
        $note = $data['note'] ?? null;

        DB::transaction(function () use ($actor, $incident, $to, $note): void {
            $locked = SecurityIncident::query()->whereKey($incident->id)->lockForUpdate()->firstOrFail();
            $from = $locked->status;
            if ($from === IncidentStatus::Closed) {
                throw new ApiException(409, 'incident_closed', 'This incident is closed and cannot be changed. Open a new incident instead.');
            }
            if ($from === $to) {
                throw new ApiException(409, 'incident_status_unchanged', 'The incident already has this status.');
            }

            $locked->update([
                'status' => $to,
                'resolved_at' => match ($to) {
                    IncidentStatus::Resolved => now(),
                    IncidentStatus::Closed => $locked->resolved_at ?? now(),
                    default => null,
                },
                'closed_at' => $to === IncidentStatus::Closed ? now() : null,
            ]);
            $this->engine->history($locked, $from, $to, $note, $actor);

            if (! $to->isActive()) {
                $locked->alerts()->whereIn('status', AlertStatus::active())->get()
                    ->reject(fn (SecurityAlert $alert): bool => $alert->rule->isCondition())
                    ->each(fn (SecurityAlert $alert) => $alert->update([
                        'status' => AlertStatus::Resolved,
                        'resolved_by' => $actor->id,
                        'resolved_at' => now(),
                        'resolution' => SecurityAlert::RESOLUTION_INCIDENT,
                    ]));
            }

            $this->audit->record('security.incident_status_changed', AuditOutcome::Success, actor: $actor, reason: $note, metadata: [
                'incident_id' => $locked->public_id,
                'from' => $from->value,
                'to' => $to->value,
            ]);
        });

        return $this->present($incident->refresh());
    }

    private function present(SecurityIncident $incident): SecurityIncidentResource
    {
        $incident->load([
            'opener:id,name',
            'alerts' => fn ($query) => $query->with('subjectUser:id,name', 'subjectLock:id,name', 'acknowledger:id,name', 'resolver:id,name')->orderByDesc('last_seen_at'),
            'events' => fn ($query) => $query->with('actor:id,name')->orderBy('occurred_at')->orderBy('id'),
        ])->loadCount('alerts');

        return (new SecurityIncidentResource($incident))->withDetail();
    }
}
