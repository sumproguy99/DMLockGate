<?php

namespace Tests\Feature\Http\Controllers\Api\V1;

use App\Actions\Auth\CompleteLogin;
use App\Enums\RoleTemplate;
use App\Models\AuditLog;
use App\Models\NotificationDelivery;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Each person's own notification preferences, and the administrator's limits around them.
 */
class NotificationPreferenceTest extends TestCase
{
    use RefreshDatabase;

    private User $resident;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
        $this->resident = $this->userWith(RoleTemplate::Resident);
        $this->admin = $this->userWith(RoleTemplate::SuperAdministrator);
    }

    private function userWith(RoleTemplate $template): User
    {
        $user = User::factory()->create();
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    public function test_everything_is_on_by_default_and_security_categories_are_required_in_the_app(): void
    {
        $response = $this->actingAs($this->resident)->getJson('/api/v1/notifications/preferences')->assertOk();

        $categories = collect($response->json('data.categories'))->keyBy('category');
        $this->assertSame(['security_incident', 'device_revoked', 'lock_connectivity', 'battery_warning', 'integration_failure'], $categories->keys()->all());
        $this->assertTrue($categories->every(fn (array $c): bool => $c['in_app'] && $c['email']));
        $this->assertTrue($categories['security_incident']['in_app_required']);
        $this->assertFalse($categories['battery_warning']['in_app_required']);
        $response->assertJsonPath('data.email_enabled', true)
            ->assertJsonPath('data.email_min_severity', 'medium')
            ->assertJsonPath('data.handles_incidents', false)
            ->assertJsonPath('data.email', $this->resident->email);
    }

    public function test_a_person_changes_their_own_preferences_and_it_is_audited(): void
    {
        $this->actingAs($this->resident)->putJson('/api/v1/notifications/preferences', [
            'preferences' => ['battery_warning' => ['in_app' => false, 'email' => false]],
        ])->assertOk();

        $battery = collect($this->getJson('/api/v1/notifications/preferences')->json('data.categories'))->firstWhere('category', 'battery_warning');
        $this->assertFalse($battery['in_app']);
        $this->assertFalse($battery['email']);

        $audit = AuditLog::query()->where('action', 'notifications.preferences_updated')->sole();
        $this->assertSame($this->resident->id, $audit->actor_user_id);
        $this->assertSame(['battery_warning'], $audit->metadata['changed']);
    }

    public function test_a_required_category_stays_on_in_the_app_but_its_email_can_be_turned_off(): void
    {
        $this->actingAs($this->resident)->putJson('/api/v1/notifications/preferences', [
            'preferences' => ['security_incident' => ['in_app' => false, 'email' => false]],
        ])->assertOk();

        $security = collect($this->getJson('/api/v1/notifications/preferences')->json('data.categories'))->firstWhere('category', 'security_incident');
        $this->assertTrue($security['in_app']);
        $this->assertFalse($security['email']);
    }

    public function test_unknown_categories_and_missing_choices_are_refused(): void
    {
        $this->actingAs($this->resident)->putJson('/api/v1/notifications/preferences', [
            'preferences' => ['door_bell' => ['in_app' => true, 'email' => true]],
        ])->assertUnprocessable()->assertJsonValidationErrors('preferences', 'error.fields');

        $this->putJson('/api/v1/notifications/preferences', [
            'preferences' => ['battery_warning' => ['in_app' => true]],
        ])->assertUnprocessable()->assertJsonValidationErrors('preferences.battery_warning.email', 'error.fields');
    }

    public function test_an_administrator_sets_the_limits_and_sees_recent_deliveries(): void
    {
        NotificationDelivery::factory()->create(['user_id' => $this->resident->id, 'status' => NotificationDelivery::STATUS_FAILED, 'attempts' => 3, 'last_error' => 'Connection refused']);

        $this->actingAs($this->admin)
            ->withSession([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()])
            ->putJson('/api/v1/settings/notifications', [
                'email_enabled' => false,
                'email_min_severity' => 'high',
                'required_categories' => ['security_incident', 'lock_connectivity'],
            ])
            ->assertOk()
            ->assertJsonPath('data.email_enabled', false)
            ->assertJsonPath('data.email_min_severity', 'high')
            ->assertJsonPath('data.required_categories', ['security_incident', 'lock_connectivity'])
            ->assertJsonPath('data.updated_by', $this->admin->name)
            ->assertJsonPath('data.recent_deliveries.0.status', 'failed')
            ->assertJsonPath('data.recent_deliveries.0.attempts', 3)
            ->assertJsonPath('data.recent_deliveries.0.last_error', 'Connection refused')
            ->assertJsonPath('data.retry.tries', 3)
            ->assertJsonPath('data.retention_days.resolved_alerts_days', config('lockguard.retention.resolved_alerts_days'));

        $audit = AuditLog::query()->where('action', 'settings.notifications_updated')->sole();
        $this->assertEqualsCanonicalizing(['email_enabled', 'email_min_severity', 'required_categories'], $audit->metadata['changed']);

        $this->actingAs($this->resident)->getJson('/api/v1/notifications/preferences')
            ->assertJsonPath('data.email_enabled', false)
            ->assertJsonPath('data.categories.2.in_app_required', true)
            ->assertJsonPath('data.categories.1.in_app_required', false);
    }

    public function test_changing_the_limits_needs_a_recent_identity_check(): void
    {
        $this->actingAs($this->admin)->putJson('/api/v1/settings/notifications', [
            'email_enabled' => true,
            'email_min_severity' => 'medium',
            'required_categories' => [],
        ])->assertForbidden();

        $this->assertDatabaseMissing('app_settings', ['key' => 'notifications']);
    }

    public function test_the_notification_list_shows_whether_it_was_emailed(): void
    {
        $id = (string) Str::uuid();
        $this->resident->notifications()->create(['id' => $id, 'type' => 'security_alert', 'data' => ['title' => 'Front Door is offline']]);
        NotificationDelivery::factory()->create(['user_id' => $this->resident->id, 'notification_id' => $id, 'status' => NotificationDelivery::STATUS_SENT]);

        $this->actingAs($this->resident)->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('data.0.email_status', 'sent');
    }
}
