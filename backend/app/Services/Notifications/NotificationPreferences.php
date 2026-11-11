<?php

namespace App\Services\Notifications;

use App\Enums\AlertSeverity;
use App\Models\AppSetting;
use App\Models\SecurityAlert;
use App\Models\User;

/**
 * Notification preferences (project.md section 22): each person chooses, per category, whether
 * they are told in the app and by email, within limits an administrator sets.
 *
 * Administrator limits (app_settings 'notifications'):
 * - email_enabled: whether alert emails are sent at all.
 * - email_min_severity: alerts below this are told in the app only.
 * - required_categories: categories nobody can turn off in the app.
 *
 * Mandatory notifications (people who handle incidents) ignore preferences in the app, and High and
 * Critical ones are always emailed to them while alert email is on. Nothing here can stop that.
 */
class NotificationPreferences
{
    public const KEY = 'notifications';

    /**
     * The categories alerts are sent under, as people see them.
     *
     * @var array<string, array{label: string, description: string}>
     */
    public const CATEGORIES = [
        'security_incident' => [
            'label' => 'Security alerts',
            'description' => 'Failed sign-ins, two-step sign-in turned off, recovery codes used, new administrative permissions and sign-ins on new devices.',
        ],
        'device_revoked' => [
            'label' => 'Removed and lost devices',
            'description' => 'A removed device trying to use an account, and devices reported lost.',
        ],
        'lock_connectivity' => [
            'label' => 'Lock problems',
            'description' => 'A lock going offline or jamming, or a command whose result is unknown.',
        ],
        'battery_warning' => [
            'label' => 'Lock batteries',
            'description' => 'A lock battery running low.',
        ],
        'integration_failure' => [
            'label' => 'Lock integration',
            'description' => 'LockGuard losing its connection to the Eufy locks.',
        ],
    ];

    public const SEVERITIES = ['low', 'medium', 'high', 'critical'];

    /**
     * @var array{email_enabled: bool, email_min_severity: string, required_categories: list<string>}
     */
    public const DEFAULT_LIMITS = [
        'email_enabled' => true,
        'email_min_severity' => 'medium',
        'required_categories' => ['security_incident', 'device_revoked'],
    ];

    /**
     * The administrator's limits, with defaults for anything not saved.
     *
     * @return array{email_enabled: bool, email_min_severity: string, required_categories: list<string>}
     */
    public function limits(): array
    {
        $stored = AppSetting::query()->where('key', self::KEY)->first()?->value;
        $stored = is_array($stored) ? $stored : [];

        $severity = $stored['email_min_severity'] ?? self::DEFAULT_LIMITS['email_min_severity'];

        return [
            'email_enabled' => (bool) ($stored['email_enabled'] ?? self::DEFAULT_LIMITS['email_enabled']),
            'email_min_severity' => in_array($severity, self::SEVERITIES, true) ? $severity : self::DEFAULT_LIMITS['email_min_severity'],
            'required_categories' => array_values(array_intersect(
                array_keys(self::CATEGORIES),
                (array) ($stored['required_categories'] ?? self::DEFAULT_LIMITS['required_categories']),
            )),
        ];
    }

    /**
     * The limits as the settings page shows them, with who last changed them.
     *
     * @return array<string, mixed>
     */
    public function limitsForDisplay(): array
    {
        $row = AppSetting::query()->with('updatedBy:id,name')->where('key', self::KEY)->first();

        return [
            ...$this->limits(),
            'categories' => self::categoryList(),
            'updated_at' => $row?->updated_at?->toIso8601ZuluString('millisecond'),
            'updated_by' => $row?->updatedBy?->name,
        ];
    }

    /**
     * @param  array{email_enabled: bool, email_min_severity: string, required_categories: list<string>}  $limits
     * @return list<string> The names of the limits that changed.
     */
    public function saveLimits(array $limits, User $actor): array
    {
        $current = $this->limits();
        $next = [
            'email_enabled' => (bool) $limits['email_enabled'],
            'email_min_severity' => $limits['email_min_severity'],
            'required_categories' => array_values(array_intersect(array_keys(self::CATEGORIES), $limits['required_categories'])),
        ];

        $row = AppSetting::query()->firstOrNew(['key' => self::KEY]);
        $row->forceFill(['value' => $next, 'updated_by' => $actor->id])->save();

        return array_values(array_filter(array_keys($next), fn (string $key): bool => $current[$key] !== $next[$key]));
    }

    /**
     * A person's preferences, one entry per category. A category nobody may turn off shows as on.
     *
     * @return list<array{category: string, label: string, description: string, in_app: bool, email: bool, in_app_required: bool}>
     */
    public function forUser(User $user): array
    {
        $required = $this->limits()['required_categories'];
        $stored = $user->notification_preferences ?? [];

        return array_map(function (array $category) use ($stored, $required): array {
            $key = $category['category'];
            $isRequired = in_array($key, $required, true);

            return [
                ...$category,
                'in_app' => $isRequired || (bool) ($stored[$key]['in_app'] ?? true),
                'email' => (bool) ($stored[$key]['email'] ?? true),
                'in_app_required' => $isRequired,
            ];
        }, self::categoryList());
    }

    /**
     * Save a person's choices. Categories left out keep their current setting.
     *
     * @param  array<string, array{in_app: bool, email: bool}>  $choices
     * @return list<string> The categories that changed.
     */
    public function saveForUser(User $user, array $choices): array
    {
        $before = $this->forUser($user);
        $stored = $user->notification_preferences ?? [];
        foreach ($choices as $category => $choice) {
            if (array_key_exists($category, self::CATEGORIES)) {
                $stored[$category] = ['in_app' => (bool) $choice['in_app'], 'email' => (bool) $choice['email']];
            }
        }
        $user->forceFill(['notification_preferences' => $stored])->save();

        $after = $this->forUser($user);

        return array_values(array_map(
            fn (array $entry): string => $entry['category'],
            array_filter($after, fn (array $entry, int $index): bool => $entry['in_app'] !== $before[$index]['in_app'] || $entry['email'] !== $before[$index]['email'], ARRAY_FILTER_USE_BOTH),
        ));
    }

    /**
     * How this person is told about this alert.
     *
     * @return array{in_app: bool, email: bool}
     */
    public function channels(User $user, SecurityAlert $alert, bool $mandatory): array
    {
        $limits = $this->limits();
        $category = $alert->rule->category();
        $choice = collect($this->forUser($user))->firstWhere('category', $category)
            ?? ['in_app' => true, 'email' => true];

        $emailAllowed = $limits['email_enabled']
            && trim((string) $user->email) !== ''
            && $alert->severity->atLeast(AlertSeverity::from($limits['email_min_severity']));

        if ($mandatory) {
            return [
                'in_app' => true,
                'email' => $emailAllowed && ($choice['email'] || $alert->severity->atLeast(AlertSeverity::High)),
            ];
        }

        return [
            'in_app' => $choice['in_app'],
            'email' => $emailAllowed && $choice['email'],
        ];
    }

    /**
     * @return list<array{category: string, label: string, description: string}>
     */
    public static function categoryList(): array
    {
        return array_map(
            fn (string $key, array $category): array => ['category' => $key, ...$category],
            array_keys(self::CATEGORIES),
            self::CATEGORIES,
        );
    }
}
