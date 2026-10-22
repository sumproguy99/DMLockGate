<?php

namespace App\Notifications;

use App\Models\SecurityAlert;
use Illuminate\Notifications\Notification;

/**
 * An in-app notification about a security alert. Stored in the notifications table with read
 * status; there is no push or email channel yet.
 *
 * mandatory: sent because the person handles incidents. Their preferences can never turn it off.
 */
class SecurityAlertNotification extends Notification
{
    public function __construct(
        public readonly SecurityAlert $alert,
        public readonly bool $mandatory,
        public readonly ?string $title = null,
        public readonly ?string $description = null,
    ) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function databaseType(object $notifiable): string
    {
        return 'security_alert';
    }

    /**
     * @return array{category: string, severity: string, title: string, description: string, alert_id: string, rule: string, lock_id: ?int, mandatory: bool}
     */
    public function toArray(object $notifiable): array
    {
        return [
            'category' => $this->alert->rule->category(),
            'severity' => $this->alert->severity->value,
            'title' => $this->title ?? $this->alert->title,
            'description' => $this->description ?? $this->alert->description,
            'alert_id' => $this->alert->public_id,
            'rule' => $this->alert->rule->value,
            'lock_id' => $this->alert->subject_lock_id,
            'mandatory' => $this->mandatory,
        ];
    }
}
