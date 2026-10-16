<?php

namespace App\Http\Controllers\Api\V1\Users;

use App\Enums\AuditOutcome;
use App\Enums\PermissionEffect;
use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\UpdateUserRolesRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\Role;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\PermissionResolver;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Support\Facades\DB;

class UserRoleController extends Controller
{
    public function __construct(
        private readonly UserManagementGuard $guard,
        private readonly AuditLogger $audit,
        private readonly PermissionResolver $resolver,
    ) {}

    /**
     * Replace the user's role set.
     */
    public function update(UpdateUserRolesRequest $request, User $user): ManagedUserResource
    {
        $actor = $request->user();
        $this->guard->authorizeOnTarget($actor, $user, PermissionKey::UsersAssignRoles, 'user.roles_changed');

        $user->load('roles', 'permissionOverrides');
        $roles = Role::query()->with('permissions')->whereIn('key', $request->validated('roles'))->get();
        $currentIds = $user->roles->pluck('id')->all();
        $overrides = $user->permissionOverrides
            ->mapWithKeys(fn ($permission): array => [$permission->key->value => PermissionEffect::from($permission->pivot->effect)])
            ->all();

        $this->guard->authorizeGrant($actor, $user, $roles, $currentIds, $overrides, 'user.roles_changed');

        $added = $roles->reject(fn (Role $role): bool => in_array($role->id, $currentIds, true));
        $removed = $user->roles->reject(fn (Role $role): bool => $roles->contains('id', $role->id));

        if ($added->isNotEmpty() || $removed->isNotEmpty()) {
            DB::transaction(function () use ($request, $actor, $user, $added, $removed, $roles): void {
                $user->roles()->detach($removed->pluck('id')->all());
                $user->roles()->attach($added->pluck('id')->mapWithKeys(fn (int $id): array => [$id => ['assigned_by' => $actor->id]])->all());

                $this->audit->record('user.roles_changed', AuditOutcome::Success, actor: $actor, targets: ['user' => $user->id], reason: $request->validated('reason'), metadata: [
                    'added' => $added->pluck('key')->values()->all(),
                    'removed' => $removed->pluck('key')->values()->all(),
                    'roles' => $roles->pluck('key')->values()->all(),
                ]);
            });
        }

        $this->resolver->forget($user);

        return new ManagedUserResource($user->load('roles', 'permissionOverrides'));
    }
}
