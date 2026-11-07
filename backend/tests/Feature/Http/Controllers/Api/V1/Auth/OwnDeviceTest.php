<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Auth;

use App\Actions\Auth\CompleteLogin;
use App\Enums\AlertRule;
use App\Enums\DeviceStatus;
use App\Models\SecurityAlert;
use App\Models\User;
use App\Models\UserDevice;
use App\Services\Auth\DeviceRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * /api/v1/auth/devices: listing, trusting, renaming and revoking the user's own devices.
 */
class OwnDeviceTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private UserDevice $current;

    protected function setUp(): void
    {
        parent::setUp();

        config(['session.driver' => 'database']);
        $this->withHeader('Origin', 'http://localhost');
        $this->user = User::factory()->create();
        $this->current = UserDevice::factory()->create(['user_id' => $this->user->id, 'name' => 'Chrome on Android']);
    }

    /**
     * @param  array<string, mixed>  $session
     */
    private function onCurrentDevice(array $session = []): static
    {
        return $this->actingAs($this->user)->withSession([DeviceRegistry::SESSION_KEY => $this->current->id, ...$session]);
    }

    public function test_lists_only_the_users_own_devices_marking_this_one_and_hiding_tokens(): void
    {
        $laptop = UserDevice::factory()->create(['user_id' => $this->user->id, 'name' => 'Edge on Windows', 'last_seen_at' => now()->subHour()]);
        UserDevice::factory()->revoked()->create(['user_id' => $this->user->id, 'name' => 'Old phone']);
        UserDevice::factory()->create(['name' => 'Someone else']);

        $response = $this->onCurrentDevice()->getJson(route('api.v1.auth.devices.index'))->assertOk();

        $response->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.id', $this->current->public_id)
            ->assertJsonPath('data.0.current', true)
            ->assertJsonPath('data.1.id', $laptop->public_id)
            ->assertJsonPath('data.1.current', false)
            ->assertJsonPath('data.2.status', 'revoked')
            ->assertJsonPath('meta.unlock_requires_trusted', false);
        $this->assertStringNotContainsString($this->current->token_hash, $response->getContent());
    }

    public function test_trusting_this_device_needs_a_recent_identity_check(): void
    {
        $this->onCurrentDevice()->postJson(route('api.v1.auth.devices.trust-current'))->assertForbidden();

        $this->assertSame(DeviceStatus::Recognized, $this->current->fresh()->status);
    }

    public function test_trusting_this_device_after_an_identity_check_is_audited(): void
    {
        $this->onCurrentDevice([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()])
            ->postJson(route('api.v1.auth.devices.trust-current'))
            ->assertOk()
            ->assertJsonPath('data.status', 'trusted')
            ->assertJsonPath('data.trusted_by.id', $this->user->id);

        $this->assertDatabaseHas('audit_logs', ['action' => 'device.trusted', 'actor_user_id' => $this->user->id, 'target_device_id' => $this->current->id]);
        $this->onCurrentDevice([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()])
            ->postJson(route('api.v1.auth.devices.trust-current'))
            ->assertConflict()
            ->assertJsonPath('error.code', 'device_already_trusted');
    }

    public function test_renaming_works_on_own_devices_and_others_look_missing(): void
    {
        $this->onCurrentDevice()
            ->patchJson(route('api.v1.auth.devices.update', $this->current), ['name' => '  Kitchen tablet '])
            ->assertOk()
            ->assertJsonPath('data.name', 'Kitchen tablet');
        $this->assertDatabaseHas('audit_logs', ['action' => 'device.renamed', 'target_device_id' => $this->current->id]);

        $theirs = UserDevice::factory()->create(['name' => 'Their phone']);
        $this->onCurrentDevice()
            ->patchJson(route('api.v1.auth.devices.update', $theirs), ['name' => 'Mine now'])
            ->assertNotFound();
        $this->onCurrentDevice()->postJson(route('api.v1.auth.devices.revoke', $theirs))->assertNotFound();
        $this->assertSame('Their phone', $theirs->fresh()->name);
        $this->assertSame(DeviceStatus::Recognized, $theirs->fresh()->status);
    }

    public function test_revoking_another_own_device_needs_no_identity_check_and_cannot_target_this_one(): void
    {
        $laptop = UserDevice::factory()->create(['user_id' => $this->user->id]);

        $this->onCurrentDevice()
            ->postJson(route('api.v1.auth.devices.revoke', $laptop))
            ->assertOk()
            ->assertJsonPath('data.status', 'revoked')
            ->assertJsonPath('data.revoke_reason', 'Removed by its owner.')
            ->assertJsonPath('meta.signed_out', null);
        $this->assertDatabaseHas('audit_logs', ['action' => 'device.revoked', 'target_device_id' => $laptop->id]);

        $this->onCurrentDevice()
            ->postJson(route('api.v1.auth.devices.revoke', $this->current))
            ->assertConflict()
            ->assertJsonPath('error.code', 'device_is_current');
        $this->onCurrentDevice()
            ->postJson(route('api.v1.auth.devices.revoke', $laptop))
            ->assertConflict()
            ->assertJsonPath('error.code', 'device_already_revoked');
    }

    public function test_reporting_a_device_lost_signs_out_everywhere_else_and_raises_an_alert(): void
    {
        $phone = UserDevice::factory()->create(['user_id' => $this->user->id, 'name' => 'Pixel']);
        DB::table('sessions')->insert(['id' => Str::random(40), 'user_id' => $this->user->id, 'payload' => '', 'last_activity' => now()->getTimestamp()]);
        $this->user->createToken('phone app');

        $this->onCurrentDevice()
            ->postJson(route('api.v1.auth.devices.revoke', $phone), ['lost' => true])
            ->assertOk()
            ->assertJsonPath('data.reported_lost', true)
            ->assertJsonPath('meta.signed_out.browser_logins', 1)
            ->assertJsonPath('meta.signed_out.api_clients', 1);

        $this->assertAuthenticatedAs($this->user);
        $this->assertSame(0, $this->user->tokens()->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'device.reported_lost', 'target_device_id' => $phone->id]);
        $this->assertSame(AlertRule::DeviceLost, SecurityAlert::query()->sole()->rule);
    }
}
