<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\NotificationDelivery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;

/**
 * The signed-in user's own in-app notifications, with read status and, when one was emailed too,
 * the email's delivery status. Nobody can read or change
 * anyone else's. Marking a notification read never changes the alert behind it.
 */
class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'unread' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $user = $request->user();

        $page = $user->notifications()
            ->when($request->boolean('unread'), fn ($query) => $query->whereNull('read_at'))
            ->paginate($filters['per_page'] ?? 30)
            ->withQueryString();

        $emails = NotificationDelivery::query()
            ->whereIn('notification_id', $page->getCollection()->pluck('id'))
            ->pluck('status', 'notification_id');

        return response()->json([
            'data' => $page->getCollection()->map(fn (DatabaseNotification $notification): array => self::present($notification, $emails[$notification->id] ?? null))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'unread_count' => $user->unreadNotifications()->count(),
            ],
        ]);
    }

    /**
     * Just the unread count, for the bell in the header.
     */
    public function summary(Request $request): JsonResponse
    {
        return response()->json(['data' => ['unread_count' => $request->user()->unreadNotifications()->count()]]);
    }

    public function markRead(Request $request, string $notification): JsonResponse
    {
        $found = $request->user()->notifications()->whereKey($notification)->firstOrFail();
        $found->markAsRead();

        return response()->json(['data' => self::present($found, NotificationDelivery::query()->where('notification_id', $found->id)->value('status'))]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $marked = $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return response()->json(['data' => ['marked' => $marked]]);
    }

    /**
     * @return array<string, mixed>
     */
    private static function present(DatabaseNotification $notification, ?string $emailStatus): array
    {
        $data = $notification->data;

        return [
            'id' => $notification->id,
            'type' => $notification->type,
            'category' => $data['category'] ?? 'general',
            'severity' => $data['severity'] ?? 'info',
            'title' => $data['title'] ?? '',
            'description' => $data['description'] ?? '',
            'alert_id' => $data['alert_id'] ?? null,
            'lock_id' => $data['lock_id'] ?? null,
            'mandatory' => (bool) ($data['mandatory'] ?? false),
            'email_status' => $emailStatus,
            'created_at' => $notification->created_at?->toIso8601ZuluString('millisecond'),
            'read_at' => $notification->read_at?->toIso8601ZuluString('millisecond'),
        ];
    }
}
