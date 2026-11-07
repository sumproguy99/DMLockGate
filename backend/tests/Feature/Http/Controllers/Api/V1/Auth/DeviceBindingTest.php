<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Auth;

use App\Actions\Auth\CompleteLogin;
use App\Enums\DeviceStatus;
use App\Enums\RoleTemplate;
use App\Models\DeviceRegistrationCode;
use App\Models\Role;
use App\Models\User;
use App\Models\UserDevice;
use App\Services\Auth\DeviceRegistry;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Device binding: an account without an exempt role works only on the one device it registered
 * with a one-time code from an administrator, and that device works with no other account.
 */
class DeviceBindingTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct-horse-battery';

    private const COOKIE = 'lockguard_device';

    protected function setUp(): void
    {
        parent::setUp();

        config(['lockguard.devices.binding' => true]);
        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
    }

    private function userWithRole(RoleTemplate $template): User
    {
        $user = User::factory()->create(['password' => self::PASSWORD]);
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    private function login(User $user, ?string $token = null, ?string $code = null): TestResponse
    {
        $this->flushSession();
        app('auth')->forgetGuards();
        $request = $token === null ? $this : $this->withCredentials()->withCookie(self::COOKIE, $token);

        return $request->postJson(route('api.v1.auth.login'), array_filter([
            'email' => $user->email,
            'password' => self::PASSWORD,
            'device_code' => $code,
        ]));
    }

    private function code(User $user): string
    {
        return app(DeviceRegistry::class)->issueCode($user, null)['code'];
    }

    public function test_a_bound_account_cannot_sign_in_on_an_unregistered_device(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);

        $this->login($user)->assertForbidden()->assertJsonPath('error.code', 'device_registration_required');

        $this->assertGuest('web');
        $this->assertSame(0, $user->devices()->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'device.registration_required', 'outcome' => 'denied', 'target_user_id' => $user->id]);
    }

    public function test_a_code_registers_the_device_and_it_then_signs_in_without_one(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);
        $code = $this->code($user);

        $response = $this->login($user, code: strtolower(str_replace('-', ' ', $code)))->assertOk();

        $token = (string) $response->getCookie(self::COOKIE)?->getValue();
        $device = $user->devices()->sole();
        $this->assertNotNull($device->registered_at);
        $this->assertSame(hash('sha256', $token), $device->token_hash);
        $this->assertNotNull(DeviceRegistrationCode::query()->sole()->used_at);
        $this->assertDatabaseHas('audit_logs', ['action' => 'device.registered', 'target_device_id' => $device->id]);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'device.new_sign_in']);

        $this->login($user, $token)->assertOk();
        $this->getJson(route('api.v1.auth.me'))->assertOk();
    }

    public function test_a_code_works_once(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);
        $code = $this->code($user);
        $this->login($user, code: $code)->assertOk();

        $this->login($user, code: $code)->assertUnprocessable()->assertJsonValidationErrors('device_code', 'error.fields');
    }

    public function test_an_expired_or_replaced_code_is_refused(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);
        $old = $this->code($user);
        $expired = $this->code($user);
        DeviceRegistrationCode::query()->whereNull('cancelled_at')->update(['expires_at' => now()->subMinute()]);

        $this->login($user, code: $old)->assertUnprocessable();
        $this->login($user, code: $expired)->assertUnprocessable();
        $this->assertGuest('web');
        $this->assertDatabaseHas('audit_logs', ['action' => 'device.registration_code_rejected', 'outcome' => 'failure']);
    }

    public function test_wrong_codes_are_rate_limited(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);
        $this->code($user);

        for ($i = 0; $i < 5; $i++) {
            $this->login($user, code: 'AAAA-AAAA')->assertUnprocessable();
        }

        $this->login($user, code: 'AAAA-AAAA')->assertStatus(429);
    }

    public function test_registering_a_new_device_revokes_the_old_one_and_ends_its_session(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);
        $oldToken = Str::random(64);
        $old = UserDevice::factory()->withToken($oldToken)->create(['user_id' => $user->id, 'registered_at' => now()]);

        $this->login($user, code: $this->code($user))->assertOk();

        $this->assertSame(DeviceStatus::Revoked, $old->fresh()->status);
        $this->assertSame(1, $user->devices()->where('status', '!=', DeviceStatus::Revoked->value)->count());

        $this->login($user, $oldToken)->assertForbidden()->assertJsonPath('error.code', 'device_revoked');

        $this->flushSession();
        $this->actingAs($user)->withSession([DeviceRegistry::SESSION_KEY => $old->id])
            ->getJson(route('api.v1.auth.me'))->assertForbidden()->assertJsonPath('error.code', 'device_revoked');
    }

    public function test_a_registered_device_does_not_work_with_any_other_account(): void
    {
        $owner = $this->userWithRole(RoleTemplate::Resident);
        $token = Str::random(64);
        $device = UserDevice::factory()->withToken($token)->create(['user_id' => $owner->id, 'registered_at' => now()]);
        $other = $this->userWithRole(RoleTemplate::Resident);
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);

        $this->login($other, $token, $this->code($other))->assertForbidden()->assertJsonPath('error.code', 'device_belongs_to_other');
        $this->login($admin, $token)->assertForbidden()->assertJsonPath('error.code', 'device_belongs_to_other');

        $this->assertSame(0, $other->devices()->count());
        $this->assertNull(DeviceRegistrationCode::query()->where('user_id', $other->id)->value('used_at'));
        $this->assertDatabaseHas('audit_logs', ['action' => 'device.other_account_refused', 'target_device_id' => $device->id]);
    }

    public function test_administrators_are_not_bound(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SecurityAdministrator);

        $this->login($admin)->assertOk();

        $this->getJson(route('api.v1.auth.me'))->assertOk();
        $this->assertNull($admin->devices()->sole()->registered_at);
    }

    public function test_an_address_locked_account_signs_in_without_a_code_from_its_address(): void
    {
        $kiosk = User::factory()->create(['password' => self::PASSWORD]);
        config(['lockguard.devices.address_accounts' => [strtolower($kiosk->email) => ['127.0.0.1']]]);

        $this->login($kiosk)->assertOk();

        $this->getJson(route('api.v1.auth.me'))->assertOk();
        $this->assertFalse(app(DeviceRegistry::class)->isBound($kiosk));
    }

    public function test_an_address_locked_account_is_refused_from_any_other_address(): void
    {
        $kiosk = User::factory()->create(['password' => self::PASSWORD]);
        config(['lockguard.devices.address_accounts' => [strtolower($kiosk->email) => ['192.168.1.50']]]);

        $this->login($kiosk)->assertForbidden()->assertJsonPath('error.code', 'address_not_allowed');

        $this->assertGuest('web');
        $this->assertDatabaseHas('audit_logs', ['action' => 'device.address_refused', 'outcome' => 'denied', 'target_user_id' => $kiosk->id]);
    }

    public function test_an_address_locked_api_token_works_only_from_its_address(): void
    {
        $kiosk = User::factory()->create(['password' => self::PASSWORD]);
        $token = $kiosk->createToken('kiosk')->plainTextToken;

        config(['lockguard.devices.address_accounts' => [strtolower($kiosk->email) => ['10.0.0.0/8', '127.0.0.1']]]);
        $this->withToken($token)->getJson(route('api.v1.auth.me'))->assertOk();

        app('auth')->forgetGuards();
        config(['lockguard.devices.address_accounts' => [strtolower($kiosk->email) => ['10.0.0.0/8']]]);
        $this->withToken($token)->getJson(route('api.v1.auth.me'))
            ->assertForbidden()
            ->assertJsonPath('error.code', 'address_not_allowed');
    }

    public function test_an_address_locked_account_uses_the_real_address_behind_a_local_proxy(): void
    {
        $kiosk = User::factory()->create(['password' => self::PASSWORD]);
        $token = $kiosk->createToken('kiosk')->plainTextToken;
        config(['lockguard.devices.address_accounts' => [strtolower($kiosk->email) => ['127.0.0.1']]]);
        $me = fn (array $headers, string $from = '127.0.0.1'): TestResponse => $this->withServerVariables(['REMOTE_ADDR' => $from])
            ->withHeaders($headers)->withToken($token)->getJson(route('api.v1.auth.me'));

        // Direct from this machine: allowed.
        $me([])->assertOk();

        // Through the local dev server for a visitor on the network: their address counts.
        app('auth')->forgetGuards();
        $me(['X-Forwarded-For' => '192.168.1.50'])->assertForbidden()->assertJsonPath('error.code', 'address_not_allowed');

        // A visitor faking "127.0.0.1" through the proxy: the proxy appends their real address.
        app('auth')->forgetGuards();
        $me(['X-Forwarded-For' => '127.0.0.1, 192.168.1.50'])->assertForbidden();

        // The header is ignored from anyone who is not a trusted proxy.
        app('auth')->forgetGuards();
        $me(['X-Forwarded-For' => '127.0.0.1'], '192.168.1.50')->assertForbidden();

        $this->assertDatabaseHas('audit_logs', ['action' => 'device.address_refused', 'ip_address' => '192.168.1.50']);
    }

    public function test_an_existing_session_on_an_unregistered_device_is_signed_out(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);
        $device = UserDevice::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user)->withSession([DeviceRegistry::SESSION_KEY => $device->id])
            ->getJson(route('api.v1.auth.me'))
            ->assertForbidden()
            ->assertJsonPath('error.code', 'device_registration_required');

        $this->assertGuest('web');
    }

    public function test_the_code_is_held_through_the_mfa_step(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);
        $user->forceFill(['mfa_secret' => 'JBSWY3DPEHPK3PXP', 'mfa_confirmed_at' => now()])->save();

        $this->login($user, code: $this->code($user))->assertOk()->assertJsonPath('data.status', 'mfa_required');

        $this->assertSame(DeviceRegistrationCode::query()->value('id'), session(DeviceRegistry::CODE_SESSION_KEY));
        $this->assertNull(DeviceRegistrationCode::query()->value('used_at'));
    }

    public function test_an_administrator_with_devices_enroll_creates_a_code_after_step_up(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $response = $this->actingAs($admin)
            ->withSession([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()])
            ->postJson(route('api.v1.users.device-codes.store', $resident))
            ->assertCreated();

        $this->assertMatchesRegularExpression('/^[A-Z2-9]{4}-[A-Z2-9]{4}$/', $response->json('data.code'));
        $this->assertDatabaseHas('device_registration_codes', ['user_id' => $resident->id, 'created_by' => $admin->id]);
        $this->assertDatabaseMissing('device_registration_codes', ['code_hash' => $response->json('data.code')]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'device.registration_code_created', 'target_user_id' => $resident->id]);

        $this->getJson(route('api.v1.users.devices.index', $resident))
            ->assertOk()
            ->assertJsonPath('meta.bound', true)
            ->assertJsonPath('meta.registration_code_expires_at', fn ($value): bool => is_string($value));
    }

    public function test_no_code_is_created_for_someone_who_is_not_bound_or_without_permission(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $security = $this->userWithRole(RoleTemplate::SecurityAdministrator);
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $session = [CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()];

        $this->actingAs($admin)->withSession($session)
            ->postJson(route('api.v1.users.device-codes.store', $security))
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'device_binding_not_required');
        $this->flushSession();
        app('auth')->forgetGuards();

        $this->actingAs($security)->withSession($session)
            ->postJson(route('api.v1.users.device-codes.store', $resident))
            ->assertForbidden();

        $this->assertSame(0, DeviceRegistrationCode::query()->count());
    }

    public function test_the_console_command_creates_a_code(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);

        $this->artisan('lockguard:device-code', ['email' => $resident->email])->assertSuccessful();
        $this->artisan('lockguard:device-code', ['email' => $admin->email])->assertFailed();

        $this->assertSame(1, DeviceRegistrationCode::query()->where('user_id', $resident->id)->count());
    }
}
