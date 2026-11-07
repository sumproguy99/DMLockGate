<?php

namespace Tests\Feature\Http\Controllers\Api\V1\System;

use App\Actions\Auth\CompleteLogin;
use App\Enums\RoleTemplate;
use App\Mail\TestMail;
use App\Models\AppSetting;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use App\Services\Mail\MailSettings;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Email settings: the SMTP server invitations go through. The password is stored encrypted and
 * never sent back.
 */
class EmailSettingsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
        $this->admin = User::factory()->create(['name' => 'Dana Admin']);
        $this->admin->roles()->attach(Role::query()->where('key', RoleTemplate::SuperAdministrator->value)->value('id'));
    }

    private function asAdmin(): static
    {
        return $this->actingAs($this->admin)->withSession([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()]);
    }

    /**
     * @return array<string, mixed>
     */
    private function settings(array $overrides = []): array
    {
        return [
            'enabled' => true,
            'host' => 'smtp.example.test',
            'port' => 587,
            'security' => 'starttls',
            'username' => 'lockguard@example.test',
            'password' => 'app-password-123',
            'from_address' => 'lockguard@example.test',
            'from_name' => 'DM LockGuard',
            ...$overrides,
        ];
    }

    public function test_settings_are_saved_encrypted_and_the_password_is_never_returned(): void
    {
        $this->asAdmin()->getJson(route('api.v1.settings.email.show'))->assertOk()
            ->assertJsonPath('data.configured', false)
            ->assertJsonPath('data.password_set', false);

        $this->asAdmin()->putJson(route('api.v1.settings.email.update'), $this->settings())->assertOk()
            ->assertJsonPath('data.configured', true)
            ->assertJsonPath('data.host', 'smtp.example.test')
            ->assertJsonPath('data.password_set', true)
            ->assertJsonPath('data.updated_by', 'Dana Admin')
            ->assertJsonMissingPath('data.password');

        $raw = (string) DB::table('app_settings')->value('value');
        $this->assertStringNotContainsString('app-password-123', $raw);
        $this->assertStringNotContainsString('smtp.example.test', $raw);

        $audit = AuditLog::query()->where('action', 'settings.email_updated')->sole();
        $this->assertStringNotContainsString('app-password-123', json_encode($audit->metadata));
    }

    public function test_leaving_the_password_out_keeps_it_and_an_empty_one_removes_it(): void
    {
        $this->asAdmin()->putJson(route('api.v1.settings.email.update'), $this->settings())->assertOk();

        $kept = $this->settings(['port' => 465, 'security' => 'tls']);
        unset($kept['password']);
        $this->asAdmin()->putJson(route('api.v1.settings.email.update'), $kept)->assertOk()->assertJsonPath('data.password_set', true);
        $this->assertSame('app-password-123', app(MailSettings::class)->stored()['password']);

        $this->asAdmin()->putJson(route('api.v1.settings.email.update'), $this->settings(['password' => '']))->assertOk()->assertJsonPath('data.password_set', false);
    }

    public function test_saved_settings_become_the_mailer(): void
    {
        $this->asAdmin()->putJson(route('api.v1.settings.email.update'), $this->settings(['security' => 'tls', 'port' => 465]))->assertOk();

        app(MailSettings::class)->apply();

        $this->assertSame(MailSettings::MAILER, config('mail.default'));
        $this->assertSame('smtps', config('mail.mailers.'.MailSettings::MAILER.'.scheme'));
        $this->assertSame('app-password-123', config('mail.mailers.'.MailSettings::MAILER.'.password'));
        $this->assertSame('lockguard@example.test', config('mail.from.address'));
    }

    public function test_turned_off_settings_leave_the_env_mailer(): void
    {
        $this->asAdmin()->putJson(route('api.v1.settings.email.update'), $this->settings(['enabled' => false]))->assertOk();

        app(MailSettings::class)->apply();

        $this->assertSame('array', config('mail.default'));
    }

    public function test_a_bad_server_name_is_refused(): void
    {
        $this->asAdmin()->putJson(route('api.v1.settings.email.update'), $this->settings(['host' => 'https://smtp.example.test']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('host', 'error.fields');
        $this->assertSame(0, AppSetting::query()->count());
    }

    public function test_a_test_email_is_sent_and_audited(): void
    {
        Mail::fake();

        $this->asAdmin()->postJson(route('api.v1.settings.email.test'), ['to' => 'dana@example.test'])->assertOk()->assertJsonPath('data.sent', true);

        Mail::assertSent(TestMail::class, fn (TestMail $mail): bool => $mail->hasTo('dana@example.test') && $mail->senderName === 'Dana Admin');
        $this->assertTrue(AuditLog::query()->where('action', 'settings.email_tested')->exists());
    }
}
