<?php

namespace App\Http\Controllers\Api\V1\Location;

use App\Http\Controllers\Controller;
use App\Models\LocationReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The signed-in user's own location sharing (project.md 20, "user-visible location status"): each
 * time their phone sent its position, why, and for an administrator's request, who asked.
 */
class OwnLocationController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $reports = LocationReport::query()
            ->with(['accessRequest.lock:id,name', 'locationRequest.requester:id,name'])
            ->where('user_id', $request->user()->id)
            ->orderByDesc('received_at')
            ->limit(100)
            ->get();

        return response()->json(['data' => [
            'notice_version' => config('lockguard.location.notice_version'),
            'retention_days' => (int) config('lockguard.location.retention_days'),
            'shared' => $reports->map(fn (LocationReport $report): array => [
                'at' => $report->received_at->toIso8601ZuluString('millisecond'),
                'kind' => $report->purpose,
                'accuracy_meters' => $report->accuracy_meters,
                'lock' => $report->accessRequest?->lock?->name,
                'action' => $report->accessRequest?->action->value,
                'requested_by' => $report->locationRequest?->requester?->name,
            ])->all(),
        ]]);
    }
}
