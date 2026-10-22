<?php

namespace Tests\Feature\Http\Controllers\Api\V1;

use App\Enums\AlertRule;
use App\Enums\AlertSeverity;
use App\Enums\RoleTemplate;
use App\Models\Role;
use App\Models\SecurityAlert;
use App\Models\User;
use App\Notifications\SecurityAlertNotification;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Each person's own in-app notifications and their read status.
 */
class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $resident;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
        $this->resident = User::factory()->create();
        $this->resident->roles()->attach(Role::query()->where('key', RoleTemplate::Resident->value)->value('id'));
    }

    private function notify(User $user, string $title, AlertSeverity $severity = AlertSeverity::Medium): void
    {
        $alert = SecurityAlert::factory()->create(['title' => $title, 'severity' => $severity, 'rule' => AlertRule::BatteryLow]);
        $user->notify(new SecurityAlertNotification($alert, false));
    }

    public function test_a_user_sees_only_their_own_notifications_with_the_unread_count(): void
    {
        $this->notify($this->resident, 'Front Door: battery 20%');
        $this->notify(User::factory()->create(), 'Someone else');

        $this->actingAs($this->resident)->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Front Door: battery 20%')
            ->assertJsonPath('data.0.category', 'battery_warning')
            ->assertJsonPath('data.0.severity', 'medium')
            ->assertJsonPath('data.0.mandatory', false)
            ->assertJsonPath('data.0.read_at', null)
            ->assertJsonPath('meta.unread_count', 1);

        $this->getJson('/api/v1/notifications/summary')->assertOk()->assertJsonPath('data.unread_count', 1);
    }

    public function test_marking_one_read(): void
    {
        $this->notify($this->resident, 'First');
        $id = $this->resident->notifications()->value('id');

        $this->actingAs($this->resident)->postJson("/api/v1/notifications/{$id}/read")
            ->assertOk()
            ->assertJsonPath('data.id', $id);

        $this->assertNotNull($this->resident->notifications()->first()->read_at);
        $this->getJson('/api/v1/notifications?unread=1')->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.unread_count', 0);
    }

    public function test_another_persons_notification_cannot_be_touched(): void
    {
        $other = User::factory()->create();
        $this->notify($other, 'Private');
        $id = $other->notifications()->value('id');

        $this->actingAs($this->resident)->postJson("/api/v1/notifications/{$id}/read")->assertNotFound();

        $this->assertNull($other->notifications()->first()->read_at);
    }

    public function test_marking_all_read(): void
    {
        $this->notify($this->resident, 'One');
        $this->notify($this->resident, 'Two');

        $this->actingAs($this->resident)->postJson('/api/v1/notifications/read-all')
            ->assertOk()
            ->assertJsonPath('data.marked', 2);

        $this->assertSame(0, $this->resident->unreadNotifications()->count());
    }
}
