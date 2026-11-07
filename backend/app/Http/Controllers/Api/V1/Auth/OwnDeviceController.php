<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserDeviceResource;
use App\Models\UserDevice;
use App\Services\Auth\DeviceRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The signed-in user's own devices (project.md 34.8 E). Anyone may list, rename and revoke their own
 * devices without a special permission, since that only protects the account. Trusting a device
 * raises its standing, so it needs a recent identity check and only works on the device in hand.
 */
class OwnDeviceController extends Controller
{
    public function __construct(private readonly DeviceRegistry $devices) {}

    public function index(Request $request): JsonResponse
    {
        $devices = $request->user()->devices()
            ->with('truster:id,name', 'revoker:id,name')
            ->orderByRaw("case status when 'revoked' then 1 else 0 end")
            ->orderByDesc('last_seen_at')
            ->get();

        return response()->json([
            'data' => UserDeviceResource::collection($devices)->resolve($request),
            'meta' => [
                'current_recognized' => $request->attributes->get('device') !== null,
                'unlock_requires_trusted' => (bool) config('lockguard.devices.unlock_requires_trusted'),
            ],
        ]);
    }

    /**
     * Trust the device making this request. Behind step-up.
     */
    public function trustCurrent(Request $request): UserDeviceResource
    {
        $device = $request->attributes->get('device') ?? throw new ApiException(409, 'device_unknown', 'This browser is not recognized. Sign out and sign in again, then try once more.');

        if ($device->isTrusted()) {
            throw new ApiException(409, 'device_already_trusted', 'This device is already trusted.');
        }

        $this->devices->trust($device, $request->user());

        return new UserDeviceResource($device->refresh()->load('truster:id,name'));
    }

    public function update(Request $request, UserDevice $device): UserDeviceResource
    {
        $device = $this->own($request, $device);
        $validated = $request->validate(['name' => ['required', 'string', 'min:1', 'max:80']]);

        $this->devices->rename($device, $request->user(), trim($validated['name']));

        return new UserDeviceResource($device->refresh());
    }

    /**
     * Revoke one of the user's other devices. The device in hand is signed out instead. Reporting it
     * lost also signs out every other session, keeping this one.
     */
    public function revoke(Request $request, UserDevice $device): JsonResponse
    {
        $device = $this->own($request, $device);
        $validated = $request->validate([
            'lost' => ['sometimes', 'boolean'],
        ]);

        if ($device->isRevoked()) {
            throw new ApiException(409, 'device_already_revoked', 'This device has already been revoked.');
        }
        if ($device->is($request->attributes->get('device'))) {
            throw new ApiException(409, 'device_is_current', 'This is the device you are using. Revoke it from another device, or sign out.');
        }

        $lost = (bool) ($validated['lost'] ?? false);
        $signedOut = $this->devices->revoke(
            $device,
            $request->user(),
            $lost ? 'Reported lost by its owner.' : 'Removed by its owner.',
            $lost,
            $request->hasSession() ? $request->session()->getId() : null,
        );

        return response()->json([
            'data' => (new UserDeviceResource($device->refresh()->load('revoker:id,name')))->resolve($request),
            'meta' => ['signed_out' => $signedOut],
        ]);
    }

    /**
     * Another user's device is reported as not found, so ids cannot be probed.
     */
    private function own(Request $request, UserDevice $device): UserDevice
    {
        if ($device->user_id !== $request->user()->id) {
            throw new ApiException(404, 'not_found', 'That device was not found.');
        }

        return $device;
    }
}
