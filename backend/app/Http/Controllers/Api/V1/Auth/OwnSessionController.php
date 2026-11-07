<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Enums\AuditOutcome;
use App\Http\Controllers\Controller;
use App\Services\Audit\AuditLogger;
use App\Services\Auth\DeviceRegistry;
use App\Services\Auth\SessionRevoker;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The signed-in user's own sign-ins: where they are signed in, and signing out everywhere else.
 * Session ids are secrets and are never returned; only which entry is this browser.
 */
class OwnSessionController extends Controller
{
    public function __construct(
        private readonly SessionRevoker $sessions,
        private readonly AuditLogger $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $currentId = $request->hasSession() ? $request->session()->getId() : null;

        $sessions = config('session.driver') === 'database'
            ? DB::connection(config('session.connection'))
                ->table(config('session.table', 'sessions'))
                ->where('user_id', $user->getKey())
                ->orderByDesc('last_activity')
                ->get(['id', 'ip_address', 'user_agent', 'last_activity'])
                ->map(fn (object $row): array => [
                    'current' => $row->id === $currentId,
                    'device' => DeviceRegistry::describeUserAgent($row->user_agent),
                    'ip_address' => $row->ip_address,
                    'last_active_at' => CarbonImmutable::createFromTimestampUTC((int) $row->last_activity)->toIso8601ZuluString('millisecond'),
                ])
                ->all()
            : [];

        return response()->json(['data' => [
            'listed' => config('session.driver') === 'database',
            'sessions' => $sessions,
            'api_clients' => $user->tokens()->count(),
        ]]);
    }

    /**
     * Sign out every other browser and API client. This browser stays signed in.
     */
    public function destroyOthers(Request $request): JsonResponse
    {
        $user = $request->user();

        $ended = DB::transaction(function () use ($request, $user): array {
            $ended = $this->sessions->revokeOthers($user, $request->hasSession() ? $request->session()->getId() : '');
            $this->audit->record('auth.other_sessions_signed_out', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id], metadata: [
                'signed_out' => $ended,
            ]);

            return $ended;
        });

        return response()->json(['data' => ['signed_out' => $ended]]);
    }
}
