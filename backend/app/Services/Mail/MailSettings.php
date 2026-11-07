<?php

namespace App\Services\Mail;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

/**
 * How LockGuard sends email, as set on the Email settings page. Stored encrypted in app_settings.
 * Until an administrator saves settings, the .env mail settings apply unchanged.
 *
 * Security: 'starttls' requires the server to upgrade the connection, 'tls' connects with TLS
 * from the start (usually port 465) and 'none' sends without encryption (only for a relay on this
 * machine or network).
 */
class MailSettings
{
    public const KEY = 'mail';

    /** The mailer LockGuard configures from these settings. */
    public const MAILER = 'lockguard_smtp';

    public const SECURITY = ['starttls', 'tls', 'none'];

    /**
     * The saved settings, or null when none have been saved.
     *
     * @return array{enabled: bool, host: string, port: int, security: string, username: string|null, password: string|null, from_address: string, from_name: string}|null
     */
    public function stored(): ?array
    {
        $value = AppSetting::query()->where('key', self::KEY)->first()?->value;

        return is_array($value) ? $value : null;
    }

    /**
     * The settings as the Email settings page shows them: never the password, only whether one is set.
     *
     * @return array<string, mixed>
     */
    public function forDisplay(): array
    {
        $stored = $this->stored();
        $row = AppSetting::query()->with('updatedBy:id,name')->where('key', self::KEY)->first();

        return [
            'configured' => $stored !== null,
            'enabled' => (bool) ($stored['enabled'] ?? false),
            'host' => $stored['host'] ?? '',
            'port' => $stored['port'] ?? 587,
            'security' => $stored['security'] ?? 'starttls',
            'username' => $stored['username'] ?? '',
            'password_set' => ($stored['password'] ?? null) !== null && $stored['password'] !== '',
            'from_address' => $stored['from_address'] ?? '',
            'from_name' => $stored['from_name'] ?? (string) config('app.name'),
            'updated_at' => $row?->updated_at?->toIso8601ZuluString('millisecond'),
            'updated_by' => $row?->updatedBy?->name,
            'fallback_mailer' => (string) config('mail.default'),
        ];
    }

    /**
     * Save the settings. A null password keeps the saved one; an empty string removes it.
     *
     * @param  array{enabled: bool, host: string, port: int, security: string, username: string|null, password?: string|null, from_address: string, from_name: string}  $settings
     * @return list<string> The names of the settings that changed (never their values).
     */
    public function save(array $settings, User $actor): array
    {
        $current = $this->stored() ?? [];
        $password = array_key_exists('password', $settings) && $settings['password'] !== null
            ? ($settings['password'] === '' ? null : $settings['password'])
            : ($current['password'] ?? null);

        $next = [
            'enabled' => (bool) $settings['enabled'],
            'host' => trim($settings['host']),
            'port' => (int) $settings['port'],
            'security' => $settings['security'],
            'username' => ($settings['username'] ?? '') === '' ? null : $settings['username'],
            'password' => $password,
            'from_address' => trim($settings['from_address']),
            'from_name' => trim($settings['from_name']),
        ];

        $changed = array_values(array_filter(array_keys($next), fn (string $key): bool => ($current[$key] ?? null) !== $next[$key]));

        $row = AppSetting::query()->firstOrNew(['key' => self::KEY]);
        $row->forceFill(['value' => $next, 'updated_by' => $actor->id])->save();

        return $changed;
    }

    /**
     * Point Laravel's mailer at the saved settings, when they are saved and turned on. Call before
     * sending; it is cheap and picks up changes made since the last send.
     */
    public function apply(): void
    {
        $stored = $this->stored();
        if ($stored === null || ! ($stored['enabled'] ?? false) || ($stored['host'] ?? '') === '') {
            return;
        }

        config([
            'mail.mailers.'.self::MAILER => [
                'transport' => 'smtp',
                'scheme' => $stored['security'] === 'tls' ? 'smtps' : 'smtp',
                'host' => $stored['host'],
                'port' => $stored['port'],
                'username' => $stored['username'],
                'password' => $stored['password'],
                'timeout' => 15,
                'auto_tls' => $stored['security'] !== 'none',
                'require_tls' => $stored['security'] === 'starttls',
                'local_domain' => parse_url((string) config('lockguard.invitations.public_url'), PHP_URL_HOST) ?: null,
            ],
            'mail.default' => self::MAILER,
            'mail.from' => ['address' => $stored['from_address'], 'name' => $stored['from_name']],
        ]);

        Mail::purge(self::MAILER);
    }
}
