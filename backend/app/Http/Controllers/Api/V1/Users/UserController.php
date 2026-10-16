<?php

namespace App\Http\Controllers\Api\V1\Users;

use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\StoreUserRequest;
use App\Http\Requests\Users\UpdateUserRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\Role;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\UserManagementGuard;
use DateTimeInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function __construct(
        private readonly UserManagementGuard $guard,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * List users, optionally filtered by status or a name/username/email search.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->guard->requireAnyPermission($request->user(), UserManagementGuard::VIEW_PERMISSIONS, 'user.list');

        $filters = $request->validate([
            'status' => ['nullable', Rule::enum(UserStatus::class)],
            'search' => ['nullable', 'string', 'max:255'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $users = User::query()
            ->with('roles')
            ->when($filters['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
            ->when($filters['search'] ?? null, function ($query, string $search): void {
                $query->where(fn ($inner) => $inner
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('username', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%"));
            })
            ->orderBy('name')
            ->paginate($filters['per_page'] ?? 25)
            ->withQueryString();

        return ManagedUserResource::collection($users);
    }

    public function show(Request $request, User $user): ManagedUserResource
    {
        $this->guard->requireAnyPermission($request->user(), UserManagementGuard::VIEW_PERMISSIONS, 'user.view');

        return new ManagedUserResource($user->load('roles', 'permissionOverrides'));
    }

    /**
     * Create an account. Assigning roles at creation also requires users.assign_roles and the anti-escalation checks.
     */
    public function store(StoreUserRequest $request): JsonResponse
    {
        $actor = $request->user();
        $this->guard->requirePermission($actor, PermissionKey::UsersCreate, 'user.created');

        $roles = Role::query()->with('permissions')->whereIn('key', $request->validated('roles', []))->get();
        if ($roles->isNotEmpty()) {
            $this->guard->requirePermission($actor, PermissionKey::UsersAssignRoles, 'user.created');
            $this->guard->authorizeGrant($actor, null, $roles, [], [], 'user.created');
        }

        $user = DB::transaction(function () use ($request, $actor, $roles): User {
            $user = User::query()->create($request->safe()->only(['name', 'username', 'email', 'password', 'account_expires_at', 'admin_notes']));
            $user->forceFill(['status' => UserStatus::Active, 'status_changed_at' => now()])->save();
            $user->roles()->attach($roles->pluck('id')->mapWithKeys(fn (int $id): array => [$id => ['assigned_by' => $actor->id]])->all());

            $this->audit->record('user.created', AuditOutcome::Success, actor: $actor, targets: ['user' => $user->id], metadata: [
                'email' => $user->email,
                'username' => $user->username,
                'roles' => $roles->pluck('key')->values()->all(),
                'account_expires_at' => $user->account_expires_at?->toIso8601String(),
            ]);

            return $user;
        });

        return (new ManagedUserResource($user->load('roles', 'permissionOverrides')))->response()->setStatusCode(201);
    }

    /**
     * Change profile details. Status, roles and overrides have their own endpoints.
     */
    public function update(UpdateUserRequest $request, User $user): ManagedUserResource
    {
        $actor = $request->user();
        $this->guard->authorizeOnTarget($actor, $user, PermissionKey::UsersEdit, 'user.updated');

        DB::transaction(function () use ($request, $actor, $user): void {
            $user->fill($request->validated());
            $dirty = array_keys($user->getDirty());
            if ($dirty === []) {
                return;
            }

            $changes = [];
            foreach ($dirty as $field) {
                // Notes may hold personal details, so only the fact that they changed is recorded.
                $changes[$field] = $field === 'admin_notes'
                    ? ['changed' => true]
                    : ['from' => $this->auditValue($user->getOriginal($field)), 'to' => $this->auditValue($user->getAttribute($field))];
            }

            $user->save();
            $this->audit->record('user.updated', AuditOutcome::Success, actor: $actor, targets: ['user' => $user->id], metadata: ['changes' => $changes]);
        });

        return new ManagedUserResource($user->load('roles', 'permissionOverrides'));
    }

    private function auditValue(mixed $value): mixed
    {
        return $value instanceof DateTimeInterface ? $value->format(DATE_ATOM) : $value;
    }
}
