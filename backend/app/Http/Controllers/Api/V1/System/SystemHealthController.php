<?php

namespace App\Http\Controllers\Api\V1\System;

use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Services\Authorization\PermissionResolver;
use App\Services\System\SystemHealth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SystemHealthController extends Controller
{
    /**
     * Everyone signed in gets the integration's overall status, so the header can say honestly
     * whether lock commands can work. Administrators who look after the system also get the
     * bridge's diagnostics and every subsystem.
     */
    public function __invoke(Request $request, SystemHealth $health, PermissionResolver $permissions): JsonResponse
    {
        $user = $request->user();
        $detailed = $permissions->allows($user, PermissionKey::AdminIntegrationSettings)
            || $permissions->allows($user, PermissionKey::AdminIncidentsView);

        $integration = $health->integration();
        $data = [
            'integration' => [
                'status' => $integration['status'],
                'checked_at' => $integration['checked_at'],
                'last_sync_at' => $integration['last_sync_at'],
            ],
        ];

        if ($detailed) {
            $data['integration']['details'] = $integration['details'];
            $data['subsystems'] = $health->subsystems($integration);
        }

        return response()->json(['data' => $data]);
    }
}
