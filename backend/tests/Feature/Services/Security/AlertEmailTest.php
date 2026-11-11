<?php

namespace Tests\Feature\Services\Security;

use App\Enums\AlertRule;
use App\Enums\AlertSeverity;
use App\Enums\RoleTemplate;
use App\Enums\UserStatus;
use App\Jobs\SendAlertEmail;
use App\Mail\AlertMail;
use App\Models\AppSetting;
use App\Models\AuditLog;
use App\Models\Lock;
use App\Models\NotificationDelivery;
use App\Models\Role;
use App\Models\SecurityAlert;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Mail\MailSettings;
use App\Services\Notifications\NotificationPreferences;
use App\Services\Security\AlertNotifier;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use RuntimeException;
use Tests\TestCase;

/**
 * Alert emails: who gets one under their preferences and the administrator's limits, the mandatory
 * emails for incident handlers, and the retry and delivery tracking of each email.
 */
class AlertEmailTest extends TestCase
{
    use RefreshDatabase;

    private Lock $frontDoor;

    private User $handler;

    private User $resident;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->frontDoor = Lock::factory()->create(['name' => 'Front Door']);
        $this->handler = $this->userWithRole(RoleTemplate::SecurityAdministrator);
        $this->resident = $this->userWithRole(RoleTemplate::Resident);
        $this->resident->locks()->attach($this->frontDoor->id);
        Queue::fake();
    }

    private function userWithRole(RoleTemplate $template): User
    {
        $user = User::factory()->create();
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    private function batteryAlert(AlertSeverity $severity = AlertSeverity::Medium): SecurityAlert
    {
        return SecurityAlert::factory()->create([
            'rule' => AlertRule::BatteryLow,
            'severity' => $severity,
            'title' => 'Front Door: battery 15%',
            'subject_lock_id' => $this->frontDoor->id,
        ]);
    }

    private function limits(array $limits): void
    {
        AppSetting::query()->create(['key' => NotificationPreferences::KEY, 'value' => [...NotificationPreferences::DEFAULT_LIMITS, ...$limits]]);
    }

    private function prefer(User $user, string $category, bool $inApp, bool $email): void
    {
        $user->forceFill(['notification_preferences' => [$category => ['in_app' => $inApp, 'email' => $email]]])->save();
    }

    public function test_by_default_each_recipient_is_told_in_the_app_and_by_email(): void
    {
        app(AlertNotifier::class)->notify($this->batteryAlert());

        $this->assertSame(1, $this->resident->notifications()->count());
        $this->assertSame(1, $this->handler->notifications()->count());

        $deliveries = NotificationDelivery::query()->get()->keyBy('user_id');
        $this->assertCount(2, $deliveries);
        $this->assertSame($this->resident->email, $deliveries[$this->resident->id]->recipient);
        $this->assertSame(NotificationDelivery::STATUS_QUEUED, $deliveries[$this->resident->id]->status);
        $this->assertSame($this->resident->notifications()->value('id'), $deliveries[$this->resident->id]->notification_id);
        $this->assertStringEndsWith('/notifications', $deliveries[$this->resident->id]->link);
        $this->assertStringContainsString('/security?alert=', $deliveries[$this->handler->id]->link);
        $this->assertTrue($deliveries[$this->handler->id]->mandatory);
        Queue::assertPushed(SendAlertEmail::class, 2);
    }

    public function test_a_person_can_turn_off_a_category_in_the_app_and_by_email(): void
    {
        $this->prefer($this->resident, 'battery_warning', false, false);

        app(AlertNotifier::class)->notify($this->batteryAlert());

        $this->assertSame(0, $this->resident->notifications()->count());
        $this->assertDatabaseMissing('notification_deliveries', ['user_id' => $this->resident->id]);
    }

    public function test_email_only_still_sends_the_email_without_an_in_app_notification(): void
    {
        $this->prefer($this->resident, 'battery_warning', false, true);

        app(AlertNotifier::class)->notify($this->batteryAlert());

        $this->assertSame(0, $this->resident->notifications()->count());
        $delivery = NotificationDelivery::query()->where('user_id', $this->resident->id)->sole();
        $this->assertNull($delivery->notification_id);
    }

    public function test_alerts_below_the_minimum_severity_are_not_emailed(): void
    {
        $this->limits(['email_min_severity' => 'high']);

        app(AlertNotifier::class)->notify($this->batteryAlert(AlertSeverity::Medium));

        $this->assertSame(1, $this->resident->notifications()->count());
        $this->assertSame(0, NotificationDelivery::query()->count());
    }

    public function test_turning_alert_email_off_stops_every_email_even_mandatory_ones(): void
    {
        $this->limits(['email_enabled' => false]);

        app(AlertNotifier::class)->notify($this->batteryAlert(AlertSeverity::Critical));

        $this->assertSame(1, $this->handler->notifications()->count());
        $this->assertSame(0, NotificationDelivery::query()->count());
        Queue::assertNothingPushed();
    }

    public function test_an_incident_handler_cannot_turn_off_mandatory_alerts(): void
    {
        $this->prefer($this->handler, 'battery_warning', false, false);

        app(AlertNotifier::class)->notify($this->batteryAlert(AlertSeverity::Medium));
        $this->assertSame(1, $this->handler->notifications()->count(), 'In the app: always.');
        $this->assertDatabaseMissing('notification_deliveries', ['user_id' => $this->handler->id]);

        app(AlertNotifier::class)->notify($this->batteryAlert(AlertSeverity::High));
        $this->assertSame(2, $this->handler->notifications()->count());
        $this->assertDatabaseHas('notification_deliveries', ['user_id' => $this->handler->id, 'severity' => 'high', 'mandatory' => true]);
    }

    public function test_a_required_category_is_shown_in_the_app_even_when_turned_off(): void
    {
        $this->limits(['required_categories' => ['battery_warning']]);
        $this->prefer($this->resident, 'battery_warning', false, false);

        app(AlertNotifier::class)->notify($this->batteryAlert());

        $this->assertSame(1, $this->resident->notifications()->count());
        $this->assertDatabaseMissing('notification_deliveries', ['user_id' => $this->resident->id]);
    }

    public function test_the_job_sends_the_email_and_records_it(): void
    {
        Mail::fake();
        $delivery = NotificationDelivery::factory()->create(['user_id' => $this->resident->id, 'recipient' => $this->resident->email, 'severity' => 'high']);

        (new SendAlertEmail($delivery->id))->handle(app(MailSettings::class), app(AuditLogger::class));

        Mail::assertSent(AlertMail::class, fn (AlertMail $mail): bool => $mail->hasTo($this->resident->email)
            && $mail->alertTitle === 'Front Door: battery 20%'
            && $mail->envelope()->subject === '[High] Front Door: battery 20%');
        $delivery->refresh();
        $this->assertSame(NotificationDelivery::STATUS_SENT, $delivery->status);
        $this->assertSame(1, $delivery->attempts);
        $this->assertNotNull($delivery->sent_at);
    }

    public function test_a_failed_try_is_retried_later_and_the_last_failure_is_audited(): void
    {
        Mail::shouldReceive('to')->andThrow(new RuntimeException('Connection refused'));
        $delivery = NotificationDelivery::factory()->create(['user_id' => $this->resident->id]);

        $first = (new SendAlertEmail($delivery->id))->withFakeQueueInteractions();
        $first->handle(app(MailSettings::class), app(AuditLogger::class));
        $first->assertReleased(SendAlertEmail::BACKOFF[0]);
        $this->assertSame(NotificationDelivery::STATUS_RETRYING, $delivery->refresh()->status);
        $this->assertSame('Connection refused', $delivery->last_error);

        $delivery->forceFill(['attempts' => SendAlertEmail::TRIES - 1])->save();
        $last = (new SendAlertEmail($delivery->id))->withFakeQueueInteractions();
        $last->handle(app(MailSettings::class), app(AuditLogger::class));
        $last->assertNotReleased();

        $this->assertSame(NotificationDelivery::STATUS_FAILED, $delivery->refresh()->status);
        $this->assertSame(SendAlertEmail::TRIES, $delivery->attempts);
        $audit = AuditLog::query()->where('action', 'notification.email_failed')->sole();
        $this->assertSame($this->resident->id, $audit->target_user_id);
    }

    public function test_an_email_for_a_suspended_account_is_skipped(): void
    {
        Mail::fake();
        $this->resident->forceFill(['status' => UserStatus::Suspended])->save();
        $delivery = NotificationDelivery::factory()->create(['user_id' => $this->resident->id]);

        (new SendAlertEmail($delivery->id))->handle(app(MailSettings::class), app(AuditLogger::class));

        Mail::assertNothingSent();
        $this->assertSame(NotificationDelivery::STATUS_SKIPPED, $delivery->refresh()->status);
    }
}
