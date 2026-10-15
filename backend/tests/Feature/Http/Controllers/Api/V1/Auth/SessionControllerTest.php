<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Auth;

use App\Enums\RoleTemplate;
use App\Enums\UserStatus;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class SessionControllerTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct-horse-42-battery';

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
    }

    private function resident(array $attributes = []): User
    {
        $user = User::factory()->create(['password' => self::PASSWORD, ...$attributes]);
        $user->roles()->attach(Role::query()->where('key', RoleTemplate::Resident->value)->value('id'));

        return $user;
    }

    private function login(User $user, string $password = self::PASSWORD): TestResponse
    {
        return $this->postJson(route('api.v1.auth.login'), ['email' => $user->email, 'password' => $password]);
    }

    public function test_valid_credentials_sign_in_and_return_effective_permissions(): void
    {
        $user = $this->resident();

        $this->login($user)
            ->assertOk()
            ->assertJsonPath('data.status', 'authenticated')
            ->assertJsonPath('data.user.email', $user->email)
            ->assertJsonPath('data.user.roles.0.key', 'resident')
            ->assertJsonPath('data.user.permissions', array_map(fn ($key) => $key->value, RoleTemplate::Resident->permissions()));

        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->fresh()->last_login_at);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.login', 'outcome' => 'success', 'actor_user_id' => $user->id]);
    }

    public function test_wrong_password_returns_422_and_is_audited_without_the_password(): void
    {
        $user = $this->resident();

        $this->login($user, 'not-the-password')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.fields.email.0', 'These credentials do not match our records.');

        $this->assertGuest();
        $audit = AuditLog::query()->where('action', 'auth.login')->sole();
        $this->assertSame('failure', $audit->outcome->value);
        $this->assertSame($user->id, $audit->target_user_id);
        $this->assertStringNotContainsString('not-the-password', json_encode($audit->getAttributes()));
    }

    public function test_unknown_email_returns_the_same_422_message(): void
    {
        $this->postJson(route('api.v1.auth.login'), ['email' => 'nobody@example.com', 'password' => self::PASSWORD])
            ->assertStatus(422)
            ->assertJsonPath('error.fields.email.0', 'These credentials do not match our records.');
    }

    public function test_returns_429_after_five_failures_even_with_the_correct_password(): void
    {
        $user = $this->resident();

        for ($i = 0; $i < 5; $i++) {
            $this->login($user, 'wrong-'.$i)->assertStatus(422);
        }

        $this->login($user)->assertStatus(429)->assertJsonPath('error.code', 'too_many_requests');
        $this->assertGuest();
    }

    public function test_suspended_account_with_correct_password_returns_403(): void
    {
        $user = $this->resident(['status' => UserStatus::Suspended]);

        $this->login($user)->assertForbidden()->assertJsonPath('error.code', 'account_inactive');

        $this->assertGuest();
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.login', 'outcome' => 'denied', 'target_user_id' => $user->id]);
    }

    public function test_expired_account_with_correct_password_returns_403(): void
    {
        $user = $this->resident(['account_expires_at' => now()->subMinute()]);

        $this->login($user)->assertForbidden()->assertJsonPath('error.code', 'account_inactive');
    }

    public function test_mfa_account_is_not_signed_in_until_code_is_verified(): void
    {
        $user = $this->resident();
        $user->forceFill(['mfa_secret' => 'JBSWY3DPEHPK3PXP', 'mfa_confirmed_at' => now()])->save();

        $this->login($user)->assertOk()->assertJsonPath('data.status', 'mfa_required');

        $this->assertGuest();
        $this->getJson(route('api.v1.auth.me'))->assertUnauthorized();
    }

    public function test_logout_ends_the_session(): void
    {
        $user = $this->resident();
        $this->login($user)->assertOk();

        $this->postJson(route('api.v1.auth.logout'))->assertNoContent();

        $this->assertGuest('web');
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.logout', 'actor_user_id' => $user->id]);
    }

    public function test_me_returns_401_envelope_when_signed_out(): void
    {
        $this->getJson(route('api.v1.auth.me'))
            ->assertUnauthorized()
            ->assertExactJson(['error' => ['code' => 'unauthenticated', 'message' => 'Sign in to continue.']]);
    }

    public function test_suspending_a_signed_in_user_blocks_their_next_request(): void
    {
        $user = $this->resident();
        $this->login($user)->assertOk();
        $this->getJson(route('api.v1.auth.me'))->assertOk();

        $user->forceFill(['status' => UserStatus::Suspended])->save();

        $this->getJson(route('api.v1.auth.me'))->assertForbidden()->assertJsonPath('error.code', 'account_inactive');
        $this->assertGuest('web');
    }

    public function test_login_without_an_allowed_origin_returns_400(): void
    {
        $user = $this->resident();

        $this->withHeaders(['Origin' => 'https://evil.example'])
            ->postJson(route('api.v1.auth.login'), ['email' => $user->email, 'password' => self::PASSWORD])
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'stateful_client_required');
    }
}
