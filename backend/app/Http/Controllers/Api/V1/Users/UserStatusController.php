<?php

namespace App\Http\Controllers\Api\V1\Users;

use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Enums\UserStatus;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\ChangeUserStatusRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Auth\SessionRevoker;
use App\Services\Authorization\PermissionResolver;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * Suspension, reactivation and permanent revocation. Suspension and revocation end every session
 * of the account at once; EnsureAccountIsActive also rejects its next request.
 */
class UserStatusController extends Controller
{
    public function __construct(
        private readonly UserManagementGuard $guard,
        private readonly AuditLogger $audit,
        private readonly SessionRevoker $sessions,
        private readonly PermissionResolver $resolver,
    ) {}

    public function suspend(ChangeUserStatusRequest $request, User $user): ManagedUserResource
    {
        return $this->transition($request, $user, PermissionKey::UsersSuspend, 'user.suspended', [UserStatus::Active], UserStatus::Suspended);
    }

    public function reactivate(ChangeUserStatusRequest $request, User $user): ManagedUserResource
    {
        return $this->transition($request, $user, PermissionKey::UsersReactivate, 'user.reactivated', [UserStatus::Suspended], UserStatus::Active);
    }

    public function revoke(ChangeUserStatusRequest $request, User $user): ManagedUserResource
    {
        return $this->transition($request, $user, PermissionKey::UsersRevoke, 'user.revoked', [UserStatus::Active, UserStatus::Suspended], UserStatus::Revoked);
    }

    /**
     * Sign the user out everywhere without changing their status, for a lost phone or a shared
     * computer. They can sign in again with their password.
     */
    public function revokeSessions(ChangeUserStatusRequest $request, User $user): JsonResponse
    {
        $actor = $request->user();
        $this->guard->authorizeOnTarget($actor, $user, PermissionKey::DevicesRevokeSessions, 'user.sessions_revoked');

        $ended = DB::transaction(function () use ($request, $actor, $user): array {
            $ended = $this->sessions->revokeAll($user);
            $this->audit->record('user.sessions_revoked', AuditOutcome::Success, actor: $actor, targets: ['user' => $user->id], reason: $request->validated('reason'), metadata: [
                'signed_out' => $ended,
            ]);

            return $ended;
        });

        return response()->json(['data' => ['signed_out' => $ended]]);
    }

    /**
     * @param  list<UserStatus>  $allowedFrom
     */
    private function transition(ChangeUserStatusRequest $request, User $user, PermissionKey $permission, string $action, array $allowedFrom, UserStatus $to): ManagedUserResource
    {
        $actor = $request->user();
        $this->guard->authorizeOnTarget($actor, $user, $permission, $action);

        DB::transaction(function () use ($request, $actor, $user, $action, $allowedFrom, $to): void {
            // Re-read under a row lock so two administrators cannot race on the same account.
            $locked = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $from = $locked->status;

            if (! in_array($from, $allowedFrom, true)) {
                throw new ApiException(409, 'invalid_status_transition', "This account is {$from->label()}; it cannot be changed to {$to->label()}.");
            }

            $locked->forceFill(['status' => $to, 'status_changed_at' => now()])->save();
            $ended = $to === UserStatus::Active ? null : $this->sessions->revokeAll($locked);

            $this->audit->record($action, AuditOutcome::Success, actor: $actor, targets: ['user' => $locked->id], reason: $request->validated('reason'), metadata: array_filter([
                'from' => $from->value,
                'to' => $to->value,
                'signed_out' => $ended,
            ], fn ($value): bool => $value !== null));
        });

        $this->resolver->forget($user);

        return new ManagedUserResource($user->refresh()->load('roles', 'permissionOverrides'));
    }
}
