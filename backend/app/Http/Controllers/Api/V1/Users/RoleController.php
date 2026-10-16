<?php

namespace App\Http\Controllers\Api\V1\Users;

use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Http\Resources\RoleResource;
use App\Models\Role;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class RoleController extends Controller
{
    public function __construct(private readonly UserManagementGuard $guard) {}

    /**
     * Every role with its permission keys, for role assignment screens.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->guard->requireAnyPermission($request->user(), UserManagementGuard::VIEW_PERMISSIONS, 'role.list');

        return RoleResource::collection(Role::query()->with('permissions')->orderByDesc('is_system')->orderBy('name')->get());
    }

    /**
     * The permission catalog with labels, descriptions and sensitivity, for override screens.
     */
    public function permissions(Request $request): JsonResponse
    {
        $this->guard->requireAnyPermission($request->user(), UserManagementGuard::VIEW_PERMISSIONS, 'permission.list');

        return response()->json(['data' => array_map(fn (PermissionKey $key): array => [
            'key' => $key->value,
            'group' => $key->group(),
            'label' => $key->label(),
            'description' => $key->description(),
            'sensitive' => $key->isSensitive(),
        ], PermissionKey::cases())]);
    }
}
