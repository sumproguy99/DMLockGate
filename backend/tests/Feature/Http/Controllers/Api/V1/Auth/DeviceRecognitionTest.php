<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Auth;

use App\Enums\AlertRule;
use App\Enums\AlertSeverity;
use App\Enums\DeviceStatus;
use App\Enums\RoleTemplate;
use App\Models\Role;
use App\Models\SecurityAlert;
use App\Models\User;
use App\Models\UserDevice;
use App\Services\Auth\DeviceRegistry;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Recognizing the browser behind a sign-in, telling the owner about new ones, and shutting out
 * revoked devices at sign-in and on every later request.
 */
class DeviceRecognitionTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct-horse-battery';

    private const COOKIE = 'lockguard_device';

    private const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36';

    private const EDGE_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0';

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
    }

    private function userWithRole(RoleTemplate $template): User
    {
        $user = User::factory()->create(['password' => self::PASSWORD]);
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    private function login(User $user, ?string $token = null, string $userAgent = self::CHROME_ANDROID): TestResponse
    {
        $request = $this->withHeader('User-Agent', $userAgent);
        if ($token !== null) {
            $request = $request->withCredentials()->withCookie(self::COOKIE, $token);
        }

        return $request->postJson(route('api.v1.auth.login'), ['email' => $user->email, 'password' => self::PASSWORD]);
    }

    public function test_the_first_sign_in_records_the_device_and_sets_its_cookie_without_an_alert(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);

        $response = $this->login($user)->assertOk();

        $token = $response->getCookie(self::COOKIE)?->getValue();
        $this->assertMatchesRegularExpression('/^[A-Za-z0-9]{64}$/', (string) $token);
        $this->assertTrue($response->getCookie(self::COOKIE)->isHttpOnly());
        $device = $user->devices()->sole();
        $this->assertSame('Chrome on Android', $device->name);
        $this->assertSame(DeviceStatus::Recognized, $device->status);
        $this->assertSame(hash('sha256', $token), $device->token_hash);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.login', 'outcome' => 'success', 'target_device_id' => $device->id]);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'device.new_sign_in']);
        $this->assertSame(0, SecurityAlert::query()->count());
    }

    public function test_signing_in_again_on_the_same_browser_reuses_its_device(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);
        $token = Str::random(64);
        $device = UserDevice::factory()->withToken($token)->create(['user_id' => $user->id, 'last_seen_at' => now()->subDay()]);

        $this->login($user, $token)->assertOk();

        $this->assertSame(1, $user->devices()->count());
        $this->assertTrue($device->fresh()->last_seen_at->isToday());
        $this->assertSame($device->id, session(DeviceRegistry::SESSION_KEY));
        $this->assertDatabaseMissing('audit_logs', ['action' => 'device.new_sign_in']);
    }

    public function test_a_new_device_on_an_account_that_has_one_tells_only_its_owner(): void
    {
        $handler = $this->userWithRole(RoleTemplate::SecurityAdministrator);
        $user = $this->userWithRole(RoleTemplate::Resident);
        UserDevice::factory()->create(['user_id' => $user->id]);

        $this->login($user, userAgent: self::EDGE_WINDOWS)->assertOk();

        $device = $user->devices()->where('name', 'Edge on Windows')->sole();
        $this->assertDatabaseHas('audit_logs', ['action' => 'device.new_sign_in', 'target_device_id' => $device->id]);
        $alert = SecurityAlert::query()->sole();
        $this->assertSame(AlertRule::NewDeviceSignIn, $alert->rule);
        $this->assertSame(AlertSeverity::Low, $alert->severity);
        $this->assertNull($alert->security_incident_id);
        $this->assertSame('New sign-in on your account: Edge on Windows', $user->notifications()->sole()->data['title']);
        $this->assertSame(0, $handler->notifications()->count());
    }

    public function test_a_revoked_device_cannot_sign_in_even_with_the_right_password(): void
    {
        $handler = $this->userWithRole(RoleTemplate::SecurityAdministrator);
        $user = $this->userWithRole(RoleTemplate::Resident);
        $token = Str::random(64);
        $device = UserDevice::factory()->withToken($token)->revoked()->create(['user_id' => $user->id]);

        $this->login($user, $token)->assertForbidden()->assertJsonPath('error.code', 'device_revoked');

        $this->assertGuest();
        $this->assertDatabaseHas('audit_logs', ['action' => 'device.revoked_access_attempt', 'outcome' => 'denied', 'target_device_id' => $device->id]);
        $alert = SecurityAlert::query()->where('rule', AlertRule::RevokedDeviceAccess)->sole();
        $this->assertSame(AlertSeverity::High, $alert->severity);
        $this->assertNotNull($alert->security_incident_id);
        $this->assertSame(1, $handler->notifications()->count());
        $this->assertSame(1, $user->notifications()->count());
    }

    public function test_a_browser_shared_by_two_people_is_a_separate_device_for_each(): void
    {
        $first = $this->userWithRole(RoleTemplate::Resident);
        $second = $this->userWithRole(RoleTemplate::Resident);
        $token = Str::random(64);
        $firstDevice = UserDevice::factory()->withToken($token)->revoked()->create(['user_id' => $first->id]);

        $this->login($second, $token)->assertOk();

        $this->assertSame(hash('sha256', $token), $second->devices()->sole()->token_hash);
        $this->assertSame(DeviceStatus::Revoked, $firstDevice->fresh()->status);
    }

    public function test_a_session_on_a_revoked_device_ends_on_its_next_request(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);
        $device = UserDevice::factory()->revoked()->create(['user_id' => $user->id]);

        $this->actingAs($user)
            ->withSession([DeviceRegistry::SESSION_KEY => $device->id])
            ->getJson(route('api.v1.auth.me'))
            ->assertForbidden()
            ->assertJsonPath('error.code', 'device_revoked');

        $this->assertGuest('web');
        $this->assertDatabaseHas('audit_logs', ['action' => 'device.revoked_access_attempt', 'target_device_id' => $device->id]);
    }

    public function test_a_session_from_before_devices_were_recorded_gets_its_device_on_the_next_request(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);

        $this->actingAs($user)->withHeader('User-Agent', self::EDGE_WINDOWS)->getJson(route('api.v1.auth.me'))->assertOk();

        $device = $user->devices()->sole();
        $this->assertSame('Edge on Windows', $device->name);
        $this->assertSame($device->id, session(DeviceRegistry::SESSION_KEY));
        $this->assertDatabaseMissing('audit_logs', ['action' => 'device.new_sign_in']);
    }
}
