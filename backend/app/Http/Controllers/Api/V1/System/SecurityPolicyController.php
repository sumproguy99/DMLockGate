<?php

namespace App\Http\Controllers\Api\V1\System;

use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Services\Audit\AuditLogger;
use App\Services\Auth\SecurityPolicy;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Security policy (admin.security_policies): which roles must use two-step sign-in. Saving needs
 * step-up and is audited. Holders of a newly required role without an authenticator must set one
 * up on their next request.
 */
class SecurityPolicyController extends Controller
{
    public function __construct(
        private readonly SecurityPolicy $policy,
        private readonly UserManagementGuard $guard,
        private readonly AuditLogger $audit,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $this->guard->requirePermission($request->user(), PermissionKey::AdminSecurityPolicies, 'settings.security_viewed');

        return response()->json(['data' => $this->policy->forDisplay()]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->guard->requirePermission($request->user(), PermissionKey::AdminSecurityPolicies, 'settings.security_updated');

        $validated = $request->validate([
            'mfa_required_roles' => ['present', 'array'],
            'mfa_required_roles.*' => ['string', 'distinct', Rule::exists('roles', 'key')],
        ]);

        $changed = $this->policy->save($validated['mfa_required_roles'], $request->user());
        $this->audit->record('settings.security_updated', AuditOutcome::Success, actor: $request->user(), metadata: [
            'mfa_required_roles_added' => $changed['added'],
            'mfa_required_roles_removed' => $changed['removed'],
            'mfa_required_roles' => $this->policy->mfaRequiredRoles(),
        ]);

        return response()->json(['data' => $this->policy->forDisplay()]);
    }
}
