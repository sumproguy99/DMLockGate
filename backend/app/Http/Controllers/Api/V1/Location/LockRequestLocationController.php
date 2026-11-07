<?php

namespace App\Http\Controllers\Api\V1\Location;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Location\StoreLockRequestLocationRequest;
use App\Models\AccessRequest;
use App\Models\LocationReport;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;

/**
 * Where the phone was when its user pressed Lock or Unlock. Sent by the mobile app right after the
 * request, so getting a position never delays the command. It is a map pin, never part of the
 * authorization decision.
 */
class LockRequestLocationController extends Controller
{
    public function store(StoreLockRequestLocationRequest $request, AccessRequest $accessRequest): JsonResponse
    {
        $window = (int) config('lockguard.location.lock_request_window_seconds');
        if ($accessRequest->requested_at->lt(now()->subSeconds($window))) {
            throw new ApiException(409, 'location_window_closed', 'This request is too old to add a location to.');
        }

        $fix = $request->fix();

        try {
            LocationReport::query()->create([
                'user_id' => $accessRequest->user_id,
                'user_device_id' => $accessRequest->user_device_id ?? $request->attributes->get('device')?->id,
                'purpose' => LocationReport::PURPOSE_LOCK_REQUEST,
                'access_request_id' => $accessRequest->id,
                'latitude' => $fix['latitude'],
                'longitude' => $fix['longitude'],
                'accuracy_meters' => $fix['accuracy'],
                'source' => LocationReport::SOURCE_BROWSER,
                'captured_at' => $fix['captured_at'],
                'received_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            throw new ApiException(409, 'location_already_recorded', 'This request already has a location.');
        }

        return response()->json(['data' => ['recorded' => true]], 201);
    }
}
