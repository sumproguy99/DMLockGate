<?php

namespace App\Http\Controllers\Api\V1\Users;

use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\UpdateUserPermissionsRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\Permission;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\PermissionResolver;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Support\Facades\DB;

class UserPermissionController extends Controller
{
    public function __construct(
        private readonly UserManagementGuard $guard,
        private readonly AuditLogger $audit,
        private readonly PermissionResolver $resolver,
    ) {}

    /**
     * Replace the user's individual allow/deny overrides.
     */
    public function update(UpdateUserPermissionsRequest $request, User $user): ManagedUserResource
    {
        $actor = $request->user();
        $this->guard->authorizeOnTarget($actor, $user, PermissionKey::UsersModifyPermissions, 'user.permissions_changed');

        $user->load('roles.permissions', 'permissionOverrides');
        $overrides = $request->overrideEffects();

        $this->guard->authorizeGrant($actor, $user, $user->roles, $user->roles->pluck('id')->all(), $overrides, 'user.permissions_changed');

        $before = $user->permissionOverrides
            ->mapWithKeys(fn ($permission): array => [$permission->key->value => [
                'effect' => $permission->pivot->effect,
                'reason' => $permission->pivot->reason,
            ]])
            ->sortKeys()
            ->all();
        $after = collect($request->validated('overrides'))
            ->mapWithKeys(fn (array $override): array => [$override['permission'] => [
                'effect' => $override['effect'],
                'reason' => $override['reason'] ?? null,
            ]])
            ->sortKeys()
            ->all();

        if ($before !== $after) {
            DB::transaction(function () use ($actor, $user, $before, $after): void {
                $permissionIds = Permission::query()->pluck('id', 'key');

                $user->permissionOverrides()->sync(collect($after)
                    ->mapWithKeys(fn (array $override, string $key): array => [$permissionIds[$key] => [
                        ...$override,
                        'granted_by' => $actor->id,
                    ]])
                    ->all());

                $this->audit->record('user.permissions_changed', AuditOutcome::Success, actor: $actor, targets: ['user' => $user->id], metadata: [
                    'before' => array_map(fn (array $override): string => $override['effect'], $before),
                    'after' => array_map(fn (array $override): string => $override['effect'], $after),
                ]);
            });
        }

        $this->resolver->forget($user);

        return new ManagedUserResource($user->load('roles', 'permissionOverrides'));
    }
}
