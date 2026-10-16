<?php

namespace App\Http\Controllers\Api\Internal;

use App\Enums\ReportedLockState;
use App\Http\Controllers\Controller;
use App\Models\Lock;
use App\Models\LockStateEvent;
use App\Services\Locks\Integration\ReportedState;
use App\Services\Locks\LockStateRecorder;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Receives lock events pushed by the Eufy bridge (signed; see VerifyBridgeSignature). Recording is
 * idempotent on external_event_id, so the bridge may redeliver.
 */
class EufyEventController extends Controller
{
    /** A lock clock further ahead than this is not trusted; the receive time is used instead. */
    private const MAX_FUTURE_SKEW_SECONDS = 60;

    public function __construct(private readonly LockStateRecorder $recorder) {}

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'kind' => ['required', Rule::in(['state', 'connectivity'])],
            'external_id' => ['required', 'string', 'max:128'],
            'state' => ['nullable', 'required_if:kind,state', Rule::in(['locked', 'unlocked', 'jammed'])],
            'online' => ['nullable', 'required_if:kind,connectivity', 'boolean'],
            'event_type' => ['nullable', 'integer'],
            'observed_at' => ['required', 'date'],
            'external_event_id' => ['nullable', 'string', 'max:128'],
            'actor' => ['nullable', 'string', 'max:120'],
        ]);

        $lock = Lock::query()->where('vendor', 'eufy')->where('external_id', $validated['external_id'])->first();
        if ($lock === null) {
            return response()->json(['data' => ['recorded' => false, 'reason' => 'unknown_lock']], 202);
        }

        if ($validated['kind'] === 'connectivity') {
            $this->recorder->recordConnectivity($lock, (bool) $validated['online']);

            return response()->json(['data' => ['recorded' => true]], 202);
        }

        $observedAt = CarbonImmutable::parse($validated['observed_at']);
        if ($observedAt->gt(now()->addSeconds(self::MAX_FUTURE_SKEW_SECONDS))) {
            $observedAt = CarbonImmutable::now();
        }

        $event = $this->recorder->record($lock, new ReportedState(
            ReportedLockState::from($validated['state']),
            $observedAt,
            externalEventId: $validated['external_event_id'] ?? null,
            externalActor: $validated['actor'] ?? null,
            raw: ['event_type' => $validated['event_type'] ?? null],
        ), LockStateEvent::SOURCE_PUSH);

        return response()->json(['data' => ['recorded' => true, 'event_id' => $event->id]], 202);
    }
}
