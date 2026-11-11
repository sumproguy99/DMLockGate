<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\PermissionResolver;
use App\Services\Notifications\NotificationPreferences;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The signed-in person's own notification preferences: per category, in the app and by email,
 * within the administrator's limits. Nobody can see or change anyone else's.
 */
class NotificationPreferenceController extends Controller
{
    public function __construct(
        private readonly NotificationPreferences $preferences,
        private readonly PermissionResolver $permissions,
        private readonly AuditLogger $audit,
    ) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->present($request->user())]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'preferences' => ['required', 'array:'.implode(',', array_keys(NotificationPreferences::CATEGORIES)), 'min:1'],
            'preferences.*' => ['array:in_app,email'],
            'preferences.*.in_app' => ['required', 'boolean'],
            'preferences.*.email' => ['required', 'boolean'],
        ], [
            'preferences.array' => 'Choose from the notification categories LockGuard offers.',
        ]);

        $user = $request->user();
        $changed = $this->preferences->saveForUser($user, $validated['preferences']);
        if ($changed !== []) {
            $this->audit->record('notifications.preferences_updated', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id], metadata: [
                'changed' => $changed,
                'now' => collect($this->preferences->forUser($user))
                    ->whereIn('category', $changed)
                    ->mapWithKeys(fn (array $entry): array => [$entry['category'] => ['in_app' => $entry['in_app'], 'email' => $entry['email']]])
                    ->all(),
            ]);
        }

        return response()->json(['data' => $this->present($user)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(User $user): array
    {
        $limits = $this->preferences->limits();

        return [
            'categories' => $this->preferences->forUser($user),
            'email' => $user->email,
            'email_enabled' => $limits['email_enabled'],
            'email_min_severity' => $limits['email_min_severity'],
            'handles_incidents' => $this->permissions->allows($user, PermissionKey::AdminIncidentsManage),
        ];
    }
}
