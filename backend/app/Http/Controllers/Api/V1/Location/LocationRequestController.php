<?php

namespace App\Http\Controllers\Api\V1\Location;

use App\Enums\AuditOutcome;
use App\Enums\LocationRequestStatus;
use App\Enums\PermissionKey;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Location\RespondLocationRequestRequest;
use App\Http\Requests\Location\StoreLocationRequestRequest;
use App\Models\LocationReport;
use App\Models\LocationRequest;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\PermissionResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Administrators asking for a user's current location, and that user's phone answering.
 *
 * Users agree to this at sign-in, so the phone answers without prompting them. It can only answer
 * while LockGuard is open there with location allowed; a closed browser cannot be reached, and the
 * request then expires. Every request and answer is audited, and the user can see their own
 * shared locations (GET location/mine).
 */
class LocationRequestController extends Controller
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly PermissionResolver $permissions,
    ) {}

    public function store(StoreLocationRequestRequest $request): JsonResponse
    {
        $actor = $request->user();
        $target = User::query()->findOrFail($request->validated('user_id'));

        if (! $target->isActive()) {
            throw new ApiException(409, 'account_inactive', 'This account is suspended, revoked or expired, so it cannot share its location.');
        }

        LocationRequest::expireDue();

        // One open request per person: asking again while their phone has not answered returns that one.
        $locationRequest = LocationRequest::query()
            ->where('target_user_id', $target->id)
            ->where('status', LocationRequestStatus::Pending)
            ->first();

        if ($locationRequest === null) {
            $locationRequest = DB::transaction(function () use ($actor, $target): LocationRequest {
                $locationRequest = LocationRequest::query()->create([
                    'public_id' => (string) Str::uuid(),
                    'requested_by' => $actor->id,
                    'target_user_id' => $target->id,
                    'status' => LocationRequestStatus::Pending,
                    'requested_at' => now(),
                    'expires_at' => now()->addSeconds((int) config('lockguard.location.request_ttl_seconds')),
                ]);
                $this->audit->record('location.requested', AuditOutcome::Info, actor: $actor, targets: ['user' => $target->id], metadata: [
                    'location_request_id' => $locationRequest->public_id,
                ]);

                return $locationRequest;
            });
        }

        return response()->json(['data' => $this->present($locationRequest)], 202);
    }

    /**
     * Whoever asked, or anyone allowed to see location history, can follow a request.
     */
    public function show(Request $request, LocationRequest $locationRequest): JsonResponse
    {
        $user = $request->user();
        if ($locationRequest->requested_by !== $user->id && ! $this->permissions->allows($user, PermissionKey::LocationViewHistory)) {
            throw new ApiException(403, 'forbidden', 'You do not have permission to do this.');
        }

        LocationRequest::expireDue();

        return response()->json(['data' => $this->present($locationRequest->refresh())]);
    }

    /**
     * The open requests addressed to the caller, for their phone to answer. Says nothing about who asked.
     */
    public function pending(Request $request): JsonResponse
    {
        LocationRequest::expireDue();

        $open = LocationRequest::query()
            ->where('target_user_id', $request->user()->id)
            ->where('status', LocationRequestStatus::Pending)
            ->orderBy('requested_at')
            ->get(['public_id', 'expires_at']);

        return response()->json(['data' => $open->map(fn (LocationRequest $open): array => [
            'id' => $open->public_id,
            'expires_at' => $open->expires_at->toIso8601ZuluString('millisecond'),
        ])->all()]);
    }

    public function respond(RespondLocationRequestRequest $request, LocationRequest $locationRequest): JsonResponse
    {
        $user = $request->user();

        LocationRequest::expireDue();
        $locationRequest->refresh();
        if (! $locationRequest->isOpen()) {
            throw new ApiException(409, 'location_request_closed', 'This location request has already been answered or has expired.');
        }

        DB::transaction(function () use ($request, $locationRequest, $user): void {
            if ($request->isUnavailable()) {
                $locationRequest->update([
                    'status' => LocationRequestStatus::Unavailable,
                    'failure_reason' => $request->validated('unavailable'),
                    'completed_at' => now(),
                ]);
                $this->audit->record('location.shared', AuditOutcome::Failure, actor: $user, targets: ['user' => $user->id], reason: 'The phone could not give its position.', metadata: [
                    'location_request_id' => $locationRequest->public_id,
                    'unavailable' => $request->validated('unavailable'),
                ]);

                return;
            }

            $fix = $request->fix();
            LocationReport::query()->create([
                'user_id' => $user->id,
                'user_device_id' => $request->attributes->get('device')?->id,
                'purpose' => LocationReport::PURPOSE_LOCATION_REQUEST,
                'location_request_id' => $locationRequest->id,
                'latitude' => $fix['latitude'],
                'longitude' => $fix['longitude'],
                'accuracy_meters' => $fix['accuracy'],
                'source' => LocationReport::SOURCE_BROWSER,
                'captured_at' => $fix['captured_at'],
                'received_at' => now(),
            ]);
            $locationRequest->update(['status' => LocationRequestStatus::Fulfilled, 'completed_at' => now()]);
            $this->audit->record('location.shared', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id], metadata: [
                'location_request_id' => $locationRequest->public_id,
                'accuracy_meters' => round($fix['accuracy']),
            ]);
        });

        return response()->json(['data' => ['status' => $locationRequest->status->value]]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(LocationRequest $locationRequest): array
    {
        $locationRequest->loadMissing('target', 'report');
        $report = $locationRequest->report;

        return [
            'id' => $locationRequest->public_id,
            'status' => $locationRequest->status->value,
            'failure_reason' => $locationRequest->failure_reason,
            'user' => ['id' => $locationRequest->target->id, 'name' => $locationRequest->target->name],
            'requested_at' => $locationRequest->requested_at->toIso8601ZuluString('millisecond'),
            'expires_at' => $locationRequest->expires_at->toIso8601ZuluString('millisecond'),
            'completed_at' => $locationRequest->completed_at?->toIso8601ZuluString('millisecond'),
            'location' => $report === null ? null : [
                'latitude' => $report->latitude,
                'longitude' => $report->longitude,
                'accuracy_meters' => $report->accuracy_meters,
                'captured_at' => $report->captured_at->toIso8601ZuluString('millisecond'),
            ],
        ];
    }
}
