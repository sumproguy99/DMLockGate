<?php

namespace App\Http\Controllers\Api\V1\Locks;

use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Models\Lock;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\UserManagementGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * Gives or removes a user's access to one lock. Uses the same anti-escalation rules as user
 * administration: nobody changes their own access, and nobody manages a higher-ranked user.
 */
class LockAccessController extends Controller
{
    public function __construct(
        private readonly UserManagementGuard $guard,
        private readonly AuditLogger $audit,
    ) {}

    public function update(Request $request, Lock $lock, User $user): JsonResponse
    {
        $actor = $request->user();
        $this->guard->authorizeOnTarget($actor, $user, PermissionKey::AccessGrantsCreate, 'lock.access_granted');

        $validated = $request->validate([
            'valid_from' => ['nullable', 'date'],
            'valid_until' => ['nullable', 'date', 'after:valid_from', 'after:now'],
        ]);
        $window = [
            'valid_from' => $validated['valid_from'] ?? null,
            'valid_until' => $validated['valid_until'] ?? null,
        ];

        DB::transaction(function () use ($actor, $lock, $user, $window): void {
            $user->locks()->syncWithoutDetaching([$lock->id => [...$window, 'granted_by' => $actor->id]]);
            $this->audit->record('lock.access_granted', AuditOutcome::Success, actor: $actor, targets: ['user' => $user->id, 'lock' => $lock->id], metadata: $window);
        });

        return response()->json(['data' => ['user_id' => $user->id, 'lock_id' => $lock->id, ...$window]]);
    }

    public function destroy(Request $request, Lock $lock, User $user): Response
    {
        $actor = $request->user();
        $this->guard->authorizeOnTarget($actor, $user, PermissionKey::AccessGrantsRevoke, 'lock.access_revoked');

        DB::transaction(function () use ($actor, $lock, $user): void {
            if ($user->locks()->detach($lock->id) > 0) {
                $this->audit->record('lock.access_revoked', AuditOutcome::Success, actor: $actor, targets: ['user' => $user->id, 'lock' => $lock->id]);
            }
        });

        return response()->noContent();
    }
}
