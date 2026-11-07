<?php

namespace App\Http\Controllers\Api\V1\Users;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\Authorization\UserManagementGuard;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The account security history: sign-ins, MFA changes and administrative changes to or by the user.
 */
class UserSecurityHistoryController extends Controller
{
    private const ACTION_PREFIXES = ['auth.', 'user.', 'device.'];

    public function __construct(private readonly UserManagementGuard $guard) {}

    public function __invoke(Request $request, User $user): JsonResponse
    {
        $this->guard->requireAnyPermission($request->user(), UserManagementGuard::VIEW_PERMISSIONS, 'user.security_history_viewed');

        $records = AuditLog::query()
            ->with('actor:id,name')
            ->where(fn ($query) => $query->where('target_user_id', $user->id)->orWhere('actor_user_id', $user->id))
            ->where(function ($query): void {
                foreach (self::ACTION_PREFIXES as $prefix) {
                    $query->orWhere('action', 'like', $prefix.'%');
                }
            })
            ->orderByDesc('id')
            ->cursorPaginate(50);

        return response()->json([
            'data' => $records->getCollection()->map(fn (AuditLog $record): array => [
                'event_id' => $record->event_id,
                'occurred_at' => CarbonImmutable::parse($record->occurred_at, 'UTC')->toIso8601ZuluString('millisecond'),
                'action' => $record->action,
                'outcome' => $record->outcome->value,
                'actor' => $record->actor === null ? null : ['id' => $record->actor->id, 'name' => $record->actor->name],
                'target_user_id' => $record->target_user_id,
                'reason' => $record->reason,
                'ip_address' => $record->ip_address,
                'user_agent' => $record->user_agent,
                'metadata' => $record->metadata,
            ])->values(),
            'next_cursor' => $records->nextCursor()?->encode(),
        ]);
    }
}
