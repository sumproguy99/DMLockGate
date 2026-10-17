<?php

namespace App\Http\Controllers\Api\V1\Audit;

use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Http\Resources\AuditLogResource;
use App\Models\AuditLog;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\UserManagementGuard;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Read-only access to the audit trail for security administrators and auditors. Records are never
 * changed here; exporting is itself audited.
 */
class AuditLogController extends Controller
{
    /** Action prefixes offered as event categories. */
    public const CATEGORIES = ['auth', 'user', 'lock', 'property', 'audit'];

    public const EXPORT_LIMIT = 10_000;

    public function __construct(
        private readonly UserManagementGuard $guard,
        private readonly AuditLogger $audit,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->guard->requirePermission($request->user(), PermissionKey::AdminIncidentsView, 'audit.viewed');

        $filters = $this->filters($request);

        return AuditLogResource::collection($this->query($filters)->paginate($filters['per_page'] ?? 50)->withQueryString());
    }

    public function show(Request $request, string $eventId): AuditLogResource
    {
        $this->guard->requirePermission($request->user(), PermissionKey::AdminIncidentsView, 'audit.viewed');

        $record = AuditLog::query()
            ->with('actor:id,name', 'targetUser:id,name', 'targetLock:id,name')
            ->where('event_id', $eventId)
            ->firstOrFail();

        return (new AuditLogResource($record))->withDetail();
    }

    /**
     * CSV of the filtered records, newest first, up to EXPORT_LIMIT rows.
     */
    public function export(Request $request): StreamedResponse
    {
        $actor = $request->user();
        $this->guard->requirePermission($actor, PermissionKey::AdminIncidentsView, 'audit.exported');
        $this->guard->requirePermission($actor, PermissionKey::AdminReportsExport, 'audit.exported');

        $filters = $this->filters($request);
        $ids = $this->query($filters)->limit(self::EXPORT_LIMIT)->pluck('id');

        $this->audit->record('audit.exported', AuditOutcome::Success, actor: $actor, metadata: [
            'filters' => array_diff_key($filters, ['per_page' => true, 'page' => true]),
            'rows' => $ids->count(),
        ]);

        return response()->streamDownload(function () use ($ids): void {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['occurred_at', 'event_id', 'action', 'outcome', 'actor', 'target_user', 'target_lock', 'reason', 'ip_address'], escape: '');
            foreach ($ids->chunk(500) as $chunk) {
                $records = AuditLog::query()->with('actor:id,name', 'targetUser:id,name', 'targetLock:id,name')->whereIn('id', $chunk)->orderByDesc('id')->get();
                foreach ($records as $record) {
                    fputcsv($out, array_map(self::csvSafe(...), [
                        CarbonImmutable::parse($record->occurred_at, 'UTC')->toIso8601ZuluString('millisecond'),
                        $record->event_id,
                        $record->action,
                        $record->outcome->value,
                        $record->actor?->name ?? $record->actor_type->value,
                        $record->targetUser?->name ?? $record->target_user_id ?? '',
                        $record->targetLock?->name ?? $record->target_lock_id ?? '',
                        $record->reason ?? '',
                        $record->ip_address ?? '',
                    ]), escape: '');
                }
            }
            fclose($out);
        }, 'lockguard-audit-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * A cell a spreadsheet would treat as a formula is prefixed with a quote, so exported reasons
     * and names cannot run anything when the file is opened.
     */
    private static function csvSafe(mixed $value): string
    {
        $value = (string) $value;

        return $value !== '' && in_array($value[0], ['=', '+', '-', '@', "\t", "\r"], true) ? "'".$value : $value;
    }

    /**
     * @return array<string, mixed>
     */
    private function filters(Request $request): array
    {
        return $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'category' => ['nullable', Rule::in(self::CATEGORIES)],
            'outcome' => ['nullable', Rule::enum(AuditOutcome::class)],
            'actor_user_id' => ['nullable', 'integer'],
            'target_user_id' => ['nullable', 'integer'],
            'target_lock_id' => ['nullable', 'integer'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return Builder<AuditLog>
     */
    private function query(array $filters): Builder
    {
        $utc = fn (string $value): string => CarbonImmutable::parse($value)->utc()->format('Y-m-d H:i:s.u');

        return AuditLog::query()
            ->with('actor:id,name', 'targetUser:id,name', 'targetLock:id,name')
            ->when($filters['search'] ?? null, fn (Builder $query, string $search) => $query->where(fn (Builder $inner) => $inner
                ->where('action', 'like', "%{$search}%")
                ->orWhere('reason', 'like', "%{$search}%")
                ->orWhere('event_id', $search)))
            ->when($filters['category'] ?? null, fn (Builder $query, string $category) => $query->where('action', 'like', $category.'.%'))
            ->when($filters['outcome'] ?? null, fn (Builder $query, string $outcome) => $query->where('outcome', $outcome))
            ->when($filters['actor_user_id'] ?? null, fn (Builder $query, $id) => $query->where('actor_user_id', $id))
            ->when($filters['target_user_id'] ?? null, fn (Builder $query, $id) => $query->where('target_user_id', $id))
            ->when($filters['target_lock_id'] ?? null, fn (Builder $query, $id) => $query->where('target_lock_id', $id))
            ->when($filters['from'] ?? null, fn (Builder $query, string $from) => $query->where('occurred_at', '>=', $utc($from)))
            ->when($filters['to'] ?? null, fn (Builder $query, string $to) => $query->where('occurred_at', '<=', $utc($to)))
            ->orderByDesc('id');
    }
}
