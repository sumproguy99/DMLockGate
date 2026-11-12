<?php

namespace App\Http\Controllers\Api\V1\Users;

use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\ChangeUserStatusRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Auth\SecurityPolicy;
use App\Services\Auth\SessionRevoker;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Support\Facades\DB;

/**
 * An administrator resets another person's two-step sign-in, for someone who has lost both their
 * phone and their recovery codes. The authenticator and recovery codes are cleared and the person is
 * signed out everywhere; at their next sign-in they set up a new authenticator (straight away, and
 * nothing else, when their role must use it).
 */
class UserMfaController extends Controller
{
    public function __construct(
        private readonly UserManagementGuard $guard,
        private readonly AuditLogger $audit,
        private readonly SessionRevoker $sessions,
        private readonly SecurityPolicy $policy,
    ) {}

    public function reset(ChangeUserStatusRequest $request, User $user): ManagedUserResource
    {
        $actor = $request->user();
        $this->guard->authorizeOnTarget($actor, $user, PermissionKey::AdminSecurityPolicies, 'user.mfa_reset');

        DB::transaction(function () use ($request, $actor, $user): void {
            $locked = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            if ($locked->mfa_secret === null && $locked->mfa_confirmed_at === null) {
                throw new ApiException(409, 'mfa_not_enabled', 'This person has not set up two-step sign-in, so there is nothing to reset.');
            }

            $wasConfirmed = $locked->mfa_confirmed_at !== null;
            $locked->forceFill([
                'mfa_secret' => null,
                'mfa_confirmed_at' => null,
                'mfa_recovery_codes' => null,
                'mfa_last_used_step' => null,
            ])->save();
            $ended = $this->sessions->revokeAll($locked);

            $this->audit->record('user.mfa_reset', AuditOutcome::Success, actor: $actor, targets: ['user' => $locked->id], reason: $request->validated('reason'), metadata: array_filter([
                'was_confirmed' => $wasConfirmed,
                'signed_out' => $ended,
                'mfa_setup_required' => $this->policy->requiresMfa($locked) ?: null,
            ], fn ($value): bool => $value !== null));
        });

        return new ManagedUserResource($user->refresh()->load('roles', 'permissionOverrides'));
    }
}
