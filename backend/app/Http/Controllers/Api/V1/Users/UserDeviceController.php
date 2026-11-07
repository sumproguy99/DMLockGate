<?php

namespace App\Http\Controllers\Api\V1\Users;

use App\Enums\DeviceStatus;
use App\Enums\PermissionKey;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Devices\ManageDeviceRequest;
use App\Http\Resources\UserDeviceResource;
use App\Models\User;
use App\Models\UserDevice;
use App\Services\Auth\DeviceRegistry;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/**
 * Administrators' view of everyone's devices (project.md sections 7 and 12). Viewing needs
 * devices.view; trusting, renaming and revoking need devices.enroll, devices.rename and
 * devices.revoke, and follow the same rules about the owner as other user management (not your own
 * account, not someone who outranks you). Revoking is not behind step-up, so a lost phone can be
 * cut off at once; reporting it lost also signs the owner out everywhere.
 */
class UserDeviceController extends Controller
{
    public function __construct(
        private readonly UserManagementGuard $guard,
        private readonly DeviceRegistry $devices,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->guard->requirePermission($request->user(), PermissionKey::DevicesView, 'device.list_viewed');
        $validated = $request->validate([
            'status' => ['sometimes', Rule::enum(DeviceStatus::class)],
            'search' => ['sometimes', 'string', 'max:100'],
        ]);

        $devices = UserDevice::query()
            ->with('user:id,name,email', 'truster:id,name', 'revoker:id,name')
            ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
            ->when($validated['search'] ?? null, function ($query, string $search): void {
                $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search).'%';
                $query->where(fn ($inner) => $inner
                    ->where('name', 'like', $like)
                    ->orWhereHas('user', fn ($user) => $user->where('name', 'like', $like)->orWhere('email', 'like', $like)));
            })
            ->orderByDesc('last_seen_at')
            ->paginate(50);

        return UserDeviceResource::collection($devices);
    }

    public function forUser(Request $request, User $user): JsonResponse
    {
        $this->guard->requirePermission($request->user(), PermissionKey::DevicesView, 'device.list_viewed', $user);

        $devices = $user->devices()
            ->with('truster:id,name', 'revoker:id,name')
            ->orderByRaw("case status when 'revoked' then 1 else 0 end")
            ->orderByDesc('last_seen_at')
            ->get();

        $pending = $this->devices->pendingCodeExpiry($user);

        return response()->json([
            'data' => UserDeviceResource::collection($devices)->resolve($request),
            'meta' => [
                'bound' => $this->devices->isBound($user),
                'registration_code_expires_at' => $pending?->toIso8601ZuluString('millisecond'),
            ],
        ]);
    }

    /**
     * Create a one-time code the person uses to register the one device their account works on.
     * Replaces any unused code. Needs devices.enroll and a recent identity check; the code is in
     * this response only.
     */
    public function createRegistrationCode(Request $request, User $user): JsonResponse
    {
        $this->guard->authorizeOnTarget($request->user(), $user, PermissionKey::DevicesEnroll, 'device.registration_code_created');

        if (! $this->devices->isBound($user)) {
            throw new ApiException(409, 'device_binding_not_required', 'This person is not bound to one device, so they do not need a registration code.');
        }

        $issued = $this->devices->issueCode($user, $request->user());

        return response()->json([
            'data' => [
                'code' => $issued['code'],
                'expires_at' => $issued['expires_at']->toIso8601ZuluString('millisecond'),
            ],
        ], 201);
    }

    public function trust(ManageDeviceRequest $request, UserDevice $device): UserDeviceResource
    {
        $this->authorizeOnOwner($request, $device);

        match (true) {
            $device->isRevoked() => throw new ApiException(409, 'device_revoked', 'A revoked device cannot be trusted. The person can sign in on a new device instead.'),
            $device->isTrusted() => throw new ApiException(409, 'device_already_trusted', 'This device is already trusted.'),
            default => $this->devices->trust($device, $request->user()),
        };

        return new UserDeviceResource($device->refresh()->load('user:id,name,email', 'truster:id,name'));
    }

    public function update(ManageDeviceRequest $request, UserDevice $device): UserDeviceResource
    {
        $this->authorizeOnOwner($request, $device);

        $this->devices->rename($device, $request->user(), trim($request->validated('name')));

        return new UserDeviceResource($device->refresh()->load('user:id,name,email'));
    }

    /**
     * @return JsonResponse The device, and for a lost device what was signed out.
     */
    public function revoke(ManageDeviceRequest $request, UserDevice $device): JsonResponse
    {
        $this->authorizeOnOwner($request, $device);

        if ($device->isRevoked()) {
            throw new ApiException(409, 'device_already_revoked', 'This device has already been revoked.');
        }

        $signedOut = $this->devices->revoke($device, $request->user(), $request->validated('reason'), $request->boolean('lost'));

        return response()->json([
            'data' => (new UserDeviceResource($device->refresh()->load('user:id,name,email', 'revoker:id,name')))->resolve($request),
            'meta' => ['signed_out' => $signedOut],
        ]);
    }

    private function authorizeOnOwner(ManageDeviceRequest $request, UserDevice $device): void
    {
        [$permission, $action] = $request->permission();
        $this->guard->authorizeOnTarget($request->user(), $device->user, $permission, $action);
    }
}
