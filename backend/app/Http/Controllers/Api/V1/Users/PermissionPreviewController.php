<?php

namespace App\Http\Controllers\Api\V1\Users;

use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\PermissionPreviewRequest;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\PermissionDecision;
use App\Services\Authorization\PermissionResolver;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Http\JsonResponse;

/**
 * Shows the effective permissions a proposed role/override set would produce, what would change, and
 * whether the signed-in administrator would be allowed to save it. Nothing is saved.
 */
class PermissionPreviewController extends Controller
{
    public function __construct(
        private readonly UserManagementGuard $guard,
        private readonly PermissionResolver $resolver,
    ) {}

    public function __invoke(PermissionPreviewRequest $request): JsonResponse
    {
        $actor = $request->user();
        $this->guard->requireAnyPermission($actor, [
            PermissionKey::UsersCreate,
            PermissionKey::UsersAssignRoles,
            PermissionKey::UsersModifyPermissions,
        ], 'user.permission_preview');

        $target = $request->validated('user_id') !== null ? User::query()->findOrFail($request->validated('user_id')) : null;
        $roles = Role::query()->with('permissions')->whereIn('key', $request->validated('roles', []))->get();
        $overrides = $request->overrideEffects();

        $proposed = $target !== null
            ? $this->resolver->preview($target, $roles->pluck('id')->all(), $overrides)
            : $this->resolver->resolve(true, $roles->mapWithKeys(fn (Role $role): array => [
                $role->key => $role->permissions->map(fn ($permission): string => $permission->key->value)->values()->all(),
            ])->all(), $overrides);

        $current = $target !== null ? $this->resolver->decisionsFor($target) : null;

        $currentRoleIds = $target?->roles()->pluck('roles.id')->all() ?? [];
        $violations = $this->guard->grantViolations($actor, $roles, $currentRoleIds, $overrides);
        $targetProblem = $target !== null ? $this->guard->targetProblem($actor, $target) : null;

        return response()->json(['data' => [
            'permissions' => array_values(array_map(fn (PermissionDecision $decision): array => $decision->toArray(), $proposed)),
            'changes' => $current === null ? null : $this->changes($current, $proposed),
            'violations' => $violations,
            'target_problem' => $targetProblem === null ? null : ['code' => $targetProblem['code'], 'message' => $targetProblem['message']],
            'can_save' => $targetProblem === null && $violations['roles'] === [] && $violations['permissions'] === [],
        ]]);
    }

    /**
     * @param  array<string, PermissionDecision>  $current
     * @param  array<string, PermissionDecision>  $proposed
     * @return array{gained: list<string>, lost: list<string>, sensitive_gained: list<string>}
     */
    private function changes(array $current, array $proposed): array
    {
        $gained = [];
        $lost = [];

        foreach ($proposed as $key => $decision) {
            if ($decision->granted && ! $current[$key]->granted) {
                $gained[] = $key;
            } elseif (! $decision->granted && $current[$key]->granted) {
                $lost[] = $key;
            }
        }

        return [
            'gained' => $gained,
            'lost' => $lost,
            'sensitive_gained' => array_values(array_filter($gained, fn (string $key): bool => PermissionKey::from($key)->isSensitive())),
        ];
    }
}
