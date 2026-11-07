<?php

namespace App\Http\Controllers\Api\V1\Locks;

use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Http\Resources\AccessRequestResource;
use App\Http\Resources\LockResource;
use App\Models\AccessRequest;
use App\Models\Lock;
use App\Models\LockStateEvent;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\PermissionResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class LockController extends Controller
{
    public function __construct(
        private readonly PermissionResolver $permissions,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * Locks the signed-in user may see: every lock for devices.view holders, otherwise the user's own locks.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();

        $locks = match (true) {
            $this->permissions->allows($user, PermissionKey::DevicesView) => Lock::query(),
            // By id, not through the grant join: the grant table's own id would overwrite each lock's.
            $this->permissions->allows($user, PermissionKey::LockViewStatus) => Lock::query()->whereIn('locks.id', $user->locks()->select('locks.id')),
            default => Lock::query()->whereRaw('1 = 0'),
        };

        return LockResource::collection($locks->with('property')->orderBy('locks.name')->get());
    }

    public function show(Lock $lock): LockResource
    {
        Gate::authorize('view', $lock);

        return new LockResource($lock->load('property'));
    }

    /**
     * Recent reported states and requests for one lock.
     */
    public function history(Lock $lock): JsonResponse
    {
        Gate::authorize('viewHistory', $lock);

        $states = $lock->stateEvents()->latest('observed_at')->limit(50)->get()->map(fn (LockStateEvent $event): array => [
            'state' => $event->state->value,
            'source' => $event->source,
            'observed_at' => $event->observed_at->toIso8601ZuluString('millisecond'),
            'battery_level' => $event->battery_level,
            'external_actor' => $event->external_actor,
        ]);

        $requests = AccessRequest::query()
            ->with('decision', 'command')
            ->where('lock_id', $lock->id)
            ->latest('requested_at')
            ->limit(50)
            ->get();

        return response()->json(['data' => [
            'states' => $states,
            'requests' => AccessRequestResource::collection($requests),
        ]]);
    }

    /**
     * Register a lock. Commands start disabled until an administrator enables them deliberately.
     */
    public function store(Request $request): JsonResponse
    {
        Gate::authorize('manage', Lock::class);

        $validated = $request->validate([
            'property_id' => ['required', 'integer', 'exists:properties,id'],
            'name' => ['required', 'string', 'max:120'],
            'vendor' => ['sometimes', 'string', Rule::in(['eufy'])],
            'model' => ['nullable', 'string', 'max:64'],
            'external_id' => ['required', 'string', 'max:128', Rule::unique('locks')->where('vendor', $request->input('vendor', 'eufy'))],
        ]);

        $lock = DB::transaction(function () use ($validated, $request): Lock {
            $lock = Lock::query()->create([...$validated, 'commands_enabled' => false]);
            $this->audit->record('lock.registered', AuditOutcome::Success, actor: $request->user(), targets: ['lock' => $lock->id], metadata: [
                'name' => $lock->name,
                'external_id' => $lock->external_id,
                'model' => $lock->model,
            ]);

            return $lock;
        });

        return (new LockResource($lock->refresh()->load('property')))->response()->setStatusCode(201);
    }

    /**
     * Rename a lock, or turn commands on or off. Turning commands off takes effect for new requests at once.
     */
    public function update(Request $request, Lock $lock): LockResource
    {
        Gate::authorize('manage', Lock::class);

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'commands_enabled' => ['sometimes', 'boolean'],
            'registration_status' => ['sometimes', Rule::in(['active', 'disabled'])],
        ]);

        DB::transaction(function () use ($validated, $request, $lock): void {
            $lock->fill($validated);
            $changes = [];
            foreach (array_keys($lock->getDirty()) as $field) {
                $changes[$field] = ['from' => $lock->getOriginal($field), 'to' => $lock->getAttribute($field)];
            }
            if ($changes === []) {
                return;
            }

            $lock->save();
            $this->audit->record('lock.updated', AuditOutcome::Success, actor: $request->user(), targets: ['lock' => $lock->id], metadata: ['changes' => $changes]);
        });

        return new LockResource($lock->load('property'));
    }
}
