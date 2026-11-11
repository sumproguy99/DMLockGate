<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Auth;

use App\Actions\Auth\CompleteLogin;
use App\Enums\RoleTemplate;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

/**
 * Two-step sign-in required by role (the security policy): an account that must use it but has no
 * authenticator can only set one up, and administrators choose the roles under Settings >
 * Security policy.
 */
class MfaPolicyTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct-horse-42-battery';

    private const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
        config(['lockguard.auth.mfa_required_roles' => ['super_administrator', 'security_administrator']]);
    }

    private function userWithRole(RoleTemplate $template, bool $mfa = false): User
    {
        $user = User::factory()->create(['password' => self::PASSWORD]);
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));
        if ($mfa) {
            $user->forceFill(['mfa_secret' => self::SECRET, 'mfa_confirmed_at' => now()])->save();
        }

        return $user;
    }

    /**
     * Acts as the user from a fresh session, so one test can switch between people.
     */
    private function signedInAs(User $user): static
    {
        $this->flushSession();
        app('auth')->forgetGuards();

        return $this->actingAs($user->fresh());
    }

    private function confirmed(User $user): static
    {
        return $this->signedInAs($user)->withSession([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()]);
    }

    public function test_an_administrator_without_an_authenticator_can_only_set_one_up(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);

        $this->postJson(route('api.v1.auth.login'), ['email' => $admin->email, 'password' => self::PASSWORD])
            ->assertOk()
            ->assertJsonPath('data.status', 'authenticated')
            ->assertJsonPath('data.user.mfa_required', true)
            ->assertJsonPath('data.user.mfa_setup_required', true);
        $this->assertTrue(AuditLog::query()->where('action', 'auth.login')->latest('id')->first()->metadata['mfa_setup_required']);

        $this->getJson(route('api.v1.users.index'))
            ->assertForbidden()
            ->assertJsonPath('error.code', 'mfa_setup_required');
        $this->getJson(route('api.v1.locks.index'))->assertJsonPath('error.code', 'mfa_setup_required');
        $this->getJson(route('api.v1.auth.me'))->assertOk()->assertJsonPath('data.mfa_setup_required', true);

        // Setting up: the identity check (password only so far), then the authenticator.
        $this->postJson(route('api.v1.auth.confirm'), ['password' => self::PASSWORD])->assertSuccessful();
        $secret = $this->postJson(route('api.v1.auth.mfa.store'))->assertCreated()->json('data.secret');
        $this->postJson(route('api.v1.auth.mfa.confirm'), ['code' => (new Google2FA)->getCurrentOtp($secret)])->assertOk();

        $this->getJson(route('api.v1.auth.me'))->assertOk()->assertJsonPath('data.mfa_setup_required', false);
        $this->getJson(route('api.v1.users.index'))->assertOk();
    }

    public function test_signing_out_still_works_while_setup_is_owed(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SecurityAdministrator);

        $this->actingAs($admin)->postJson(route('api.v1.auth.logout'))->assertNoContent();
    }

    public function test_roles_outside_the_policy_are_not_affected(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);

        $this->signedInAs($resident)->getJson(route('api.v1.auth.me'))
            ->assertJsonPath('data.mfa_required', false)
            ->assertJsonPath('data.mfa_setup_required', false);
        $this->signedInAs($resident)->getJson(route('api.v1.locks.index'))->assertOk();
    }

    public function test_an_administrator_with_an_authenticator_works_normally(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator, mfa: true);

        $this->actingAs($admin)->getJson(route('api.v1.users.index'))->assertOk();
    }

    public function test_a_new_administrative_role_takes_effect_on_the_next_request(): void
    {
        $user = $this->userWithRole(RoleTemplate::Resident);
        $this->actingAs($user)->getJson(route('api.v1.locks.index'))->assertOk();

        $user->roles()->attach(Role::query()->where('key', RoleTemplate::SecurityAdministrator->value)->value('id'));

        $this->signedInAs($user)->getJson(route('api.v1.locks.index'))->assertJsonPath('error.code', 'mfa_setup_required');
    }

    public function test_an_api_token_of_an_account_that_owes_setup_is_refused(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
        $token = $admin->createToken('script')->plainTextToken;

        $this->withToken($token)->getJson(route('api.v1.locks.index'))
            ->assertForbidden()
            ->assertJsonPath('error.code', 'mfa_setup_required');
    }

    public function test_removing_the_authenticator_of_a_required_role_leads_straight_to_setting_up_a_new_one(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator, mfa: true);

        $this->confirmed($admin)->deleteJson(route('api.v1.auth.mfa.destroy'))->assertNoContent();
        $this->assertNull($admin->fresh()->mfa_confirmed_at);
        $this->assertTrue(AuditLog::query()->where('action', 'auth.mfa_disabled')->sole()->metadata['mfa_setup_required']);

        // Same session: only setting up a new authenticator works now.
        $this->getJson(route('api.v1.users.index'))->assertJsonPath('error.code', 'mfa_setup_required');
        $this->postJson(route('api.v1.auth.mfa.store'))->assertCreated();
    }

    public function test_the_saved_policy_replaces_the_configured_default(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator, mfa: true);
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);
        $this->signedInAs($manager)->getJson(route('api.v1.locks.index'))->assertOk();

        $this->confirmed($admin)->getJson(route('api.v1.settings.security.show'))
            ->assertOk()
            ->assertJsonPath('data.mfa_required_roles', ['super_administrator', 'security_administrator'])
            ->assertJsonPath('data.updated_at', null);

        $this->confirmed($admin)->putJson(route('api.v1.settings.security.update'), ['mfa_required_roles' => ['super_administrator', 'property_manager']])
            ->assertOk()
            ->assertJsonPath('data.mfa_required_roles', ['super_administrator', 'property_manager'])
            ->assertJsonPath('data.roles.2.key', 'property_manager')
            ->assertJsonPath('data.roles.2.mfa_required', true)
            ->assertJsonPath('data.roles.2.members_without_mfa', 1);

        $audit = AuditLog::query()->where('action', 'settings.security_updated')->sole();
        $this->assertSame(['property_manager'], $audit->metadata['mfa_required_roles_added']);
        $this->assertSame(['security_administrator'], $audit->metadata['mfa_required_roles_removed']);

        $this->signedInAs($manager)->getJson(route('api.v1.locks.index'))->assertJsonPath('error.code', 'mfa_setup_required');

        // An empty list turns the requirement off for everyone, whatever the configured default.
        $this->confirmed($admin)->putJson(route('api.v1.settings.security.update'), ['mfa_required_roles' => []])
            ->assertOk()
            ->assertJsonPath('data.mfa_required_roles', []);
        $this->signedInAs($manager)->getJson(route('api.v1.locks.index'))->assertOk();
    }

    public function test_saving_the_policy_needs_the_permission_a_recent_identity_check_and_real_roles(): void
    {
        $admin = $this->userWithRole(RoleTemplate::SuperAdministrator, mfa: true);
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);

        $this->confirmed($manager)->getJson(route('api.v1.settings.security.show'))->assertForbidden();
        $this->confirmed($manager)->putJson(route('api.v1.settings.security.update'), ['mfa_required_roles' => []])->assertForbidden();

        $this->signedInAs($admin)->putJson(route('api.v1.settings.security.update'), ['mfa_required_roles' => []])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'step_up_required');

        $this->confirmed($admin)->putJson(route('api.v1.settings.security.update'), ['mfa_required_roles' => ['no_such_role']])
            ->assertUnprocessable();
        $this->confirmed($admin)->putJson(route('api.v1.settings.security.update'), [])
            ->assertUnprocessable();

        $this->assertDatabaseMissing('audit_logs', ['action' => 'settings.security_updated', 'outcome' => 'success']);
    }
}
