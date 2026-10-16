<?php

namespace App\Http\Controllers\Api\V1\Locks;

use App\Actions\Auth\CompleteLogin;
use App\Enums\AccessChannel;
use App\Enums\AccessRequestStatus;
use App\Enums\LockAction;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\AccessRequestResource;
use App\Models\AccessRequest;
use App\Models\Lock;
use App\Services\Locks\LockCommandService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Thin HTTP adapter over LockCommandService. All authorization for commands happens in the service.
 */
class LockCommandController extends Controller
{
    public function __construct(private readonly LockCommandService $commands) {}

    /**
     * Request a lock or unlock. 202 means accepted for processing, never that the door moved:
     * poll GET lock-requests/{id} until is_final, and trust only CONFIRMED_SUCCESS.
     */
    public function store(Request $request, Lock $lock): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', Rule::enum(LockAction::class)],
            'idempotency_key' => ['required', 'string', 'min:8', 'max:64', 'regex:/^[A-Za-z0-9._:-]+$/'],
        ]);

        $accessRequest = $this->commands->request(
            user: $request->user(),
            lock: $lock,
            action: LockAction::from($validated['action']),
            channel: AccessChannel::Remote,
            idempotencyKey: $validated['idempotency_key'],
            identityConfirmedAt: $request->hasSession() ? $request->session()->get(CompleteLogin::CONFIRMED_AT_KEY) : null,
            ipAddress: $request->ip(),
            userAgent: $request->userAgent(),
        );
        $accessRequest->load('decision', 'command');

        if ($accessRequest->status === AccessRequestStatus::Denied) {
            throw new ApiException(403, $accessRequest->decision->reason_code, $accessRequest->decision->reason, [
                'request_id' => $accessRequest->public_id,
            ]);
        }

        return (new AccessRequestResource($accessRequest))->response()->setStatusCode(202);
    }

    public function show(AccessRequest $accessRequest): AccessRequestResource
    {
        Gate::authorize('view', $accessRequest);

        return new AccessRequestResource($accessRequest->load('decision', 'command'));
    }
}
