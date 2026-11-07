<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Users;

use App\Actions\Auth\CompleteLogin;
use App\Enums\AlertRule;
use App\Enums\DeviceStatus;
use App\Enums\RoleTemplate;
use App\Models\Role;
use App\Models\SecurityAlert;
use App\Models\User;
use App\Models\UserDevice;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Administrators managing other people's devices: listing, trusting, renaming, revoking and
 * reporting lost, under the same rules about the owner as other user management.
 */
class UserDeviceTest extends TestCase
{
    use RefreshDatabase;

    private User $security;

    private User $resident;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
        $this->security = $this->userWithRole(RoleTemplate::SecurityAdministrator);
        $this->resident = $this->userWithRole(RoleTemplate::Resident, ['name' => 'Riley Resident']);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function userWithRole(RoleTemplate $template, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    public function test_lists_everyones_devices_with_their_owner_and_filters(): void
    {
        UserDevice::factory()->create(['user_id' => $this->resident->id, 'name' => 'Pixel']);
        UserDevice::factory()->revoked()->create(['user_id' => $this->resident->id, 'name' => 'Old iPhone']);
        UserDevice::factory()->create(['name' => 'Someone else']);

        // The fourth is the administrator's own browser, recognized by this request.
        $this->actingAs($this->security)->getJson(route('api.v1.devices.index'))
            ->assertOk()
            ->assertJsonCount(4, 'data');

        $this->actingAs($this->security)->getJson(route('api.v1.devices.index', ['status' => 'revoked']))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Old iPhone')
            ->assertJsonPath('data.0.user.name', 'Riley Resident');

        $this->actingAs($this->security)->getJson(route('api.v1.devices.index', ['search' => 'Riley']))
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->actingAs($this->security)->getJson(route('api.v1.users.devices.index', $this->resident))
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Pixel');
    }

    public function test_revoking_a_device_needs_a_reason_and_is_audited(): void
    {
        $device = UserDevice::factory()->create(['user_id' => $this->resident->id]);

        $this->actingAs($this->security)->postJson(route('api.v1.devices.revoke', $device))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reason', 'error.fields');

        $this->actingAs($this->security)->postJson(route('api.v1.devices.revoke', $device), ['reason' => 'Phone replaced'])
            ->assertOk()
            ->assertJsonPath('data.status', 'revoked')
            ->assertJsonPath('data.revoked_by.id', $this->security->id)
            ->assertJsonPath('meta.signed_out', null);

        $this->assertDatabaseHas('audit_logs', ['action' => 'device.revoked', 'actor_user_id' => $this->security->id, 'target_device_id' => $device->id, 'reason' => 'Phone replaced']);
        $this->assertSame(0, SecurityAlert::query()->count());
    }

    public function test_reporting_a_device_lost_signs_the_owner_out_everywhere_and_opens_an_incident(): void
    {
        $device = UserDevice::factory()->create(['user_id' => $this->resident->id, 'name' => 'Pixel']);
        $this->resident->createToken('phone app');

        $this->actingAs($this->security)->postJson(route('api.v1.devices.revoke', $device), ['reason' => 'Left on the bus', 'lost' => true])
            ->assertOk()
            ->assertJsonPath('data.reported_lost', true)
            ->assertJsonPath('meta.signed_out.api_clients', 1);

        $this->assertSame(0, $this->resident->tokens()->count());
        $alert = SecurityAlert::query()->sole();
        $this->assertSame(AlertRule::DeviceLost, $alert->rule);
        $this->assertSame('Riley Resident has a device reported lost: Pixel', $alert->title);
        $this->assertNotNull($alert->security_incident_id);
        $this->assertSame('Device reported lost: Pixel', $this->resident->notifications()->sole()->data['title']);
    }

    public function test_trusting_needs_devices_enroll_and_a_revoked_device_cannot_be_trusted(): void
    {
        $super = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $device = UserDevice::factory()->create(['user_id' => $this->resident->id]);
        $revoked = UserDevice::factory()->revoked()->create(['user_id' => $this->resident->id]);
        $confirmed = [CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()];

        $this->actingAs($this->security)->withSession($confirmed)->postJson(route('api.v1.devices.trust', $device))->assertForbidden();

        $this->actingAs($super)->withSession($confirmed)->postJson(route('api.v1.devices.trust', $device))
            ->assertOk()
            ->assertJsonPath('data.status', 'trusted')
            ->assertJsonPath('data.trusted_by.id', $super->id);
        $this->actingAs($super)->withSession($confirmed)->postJson(route('api.v1.devices.trust', $revoked))
            ->assertConflict()
            ->assertJsonPath('error.code', 'device_revoked');
    }

    public function test_administrators_cannot_manage_their_own_devices_or_those_of_someone_who_outranks_them(): void
    {
        $own = UserDevice::factory()->create(['user_id' => $this->security->id]);
        $super = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $supers = UserDevice::factory()->create(['user_id' => $super->id]);

        $this->actingAs($this->security)->postJson(route('api.v1.devices.revoke', $own), ['reason' => 'Testing'])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'self_modification_forbidden');
        $this->actingAs($this->security)->postJson(route('api.v1.devices.revoke', $supers), ['reason' => 'Testing'])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'target_outranks_actor');

        $this->assertSame(DeviceStatus::Recognized, $own->fresh()->status);
        $this->assertSame(DeviceStatus::Recognized, $supers->fresh()->status);
    }
}
