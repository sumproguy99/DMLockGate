<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Auth;

use App\Models\User;
use App\Services\Auth\RecoveryCodes;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

/**
 * Covers authenticator enrollment, the MFA sign-in step, recovery codes and step-up confirmation.
 */
class MfaControllerTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct-horse-42-battery';

    private const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

    protected function setUp(): void
    {
        parent::setUp();

        $this->withHeader('Origin', 'http://localhost');
    }

    private function currentCode(string $secret = self::SECRET): string
    {
        return (new Google2FA)->getCurrentOtp($secret);
    }

    private function mfaUser(): User
    {
        $user = User::factory()->create(['password' => self::PASSWORD]);
        $user->forceFill(['mfa_secret' => self::SECRET, 'mfa_confirmed_at' => now()])->save();

        return $user;
    }

    private function startLogin(User $user): void
    {
        $this->postJson(route('api.v1.auth.login'), ['email' => $user->email, 'password' => self::PASSWORD])
            ->assertJsonPath('data.status', 'mfa_required');
    }

    public function test_enrollment_returns_secret_then_confirms_and_issues_recovery_codes(): void
    {
        $user = User::factory()->create(['password' => self::PASSWORD]);
        $this->postJson(route('api.v1.auth.login'), ['email' => $user->email, 'password' => self::PASSWORD])->assertOk();

        $secret = $this->postJson(route('api.v1.auth.mfa.store'))
            ->assertCreated()
            ->assertJsonPath('data.otpauth_uri', fn (string $uri) => str_starts_with($uri, 'otpauth://totp/'))
            ->json('data.secret');

        $this->assertNull($user->fresh()->mfa_confirmed_at);

        $codes = $this->postJson(route('api.v1.auth.mfa.confirm'), ['code' => $this->currentCode($secret)])
            ->assertOk()
            ->assertJsonPath('data.mfa_enabled', true)
            ->json('data.recovery_codes');

        $this->assertCount(8, $codes);
        $this->assertNotNull($user->fresh()->mfa_confirmed_at);
        $this->assertNotContains($codes[0], $user->fresh()->mfa_recovery_codes);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.mfa_enabled', 'actor_user_id' => $user->id]);
    }

    public function test_enrollment_rejects_a_wrong_code(): void
    {
        $user = User::factory()->create(['password' => self::PASSWORD]);
        $this->postJson(route('api.v1.auth.login'), ['email' => $user->email, 'password' => self::PASSWORD])->assertOk();
        $this->postJson(route('api.v1.auth.mfa.store'))->assertCreated();

        $this->postJson(route('api.v1.auth.mfa.confirm'), ['code' => '000000'])->assertStatus(422);

        $this->assertNull($user->fresh()->mfa_confirmed_at);
    }

    public function test_enrollment_requires_recent_confirmation(): void
    {
        $user = User::factory()->create(['password' => self::PASSWORD]);
        $this->postJson(route('api.v1.auth.login'), ['email' => $user->email, 'password' => self::PASSWORD])->assertOk();

        $this->travel(11)->minutes();

        $this->postJson(route('api.v1.auth.mfa.store'))
            ->assertForbidden()
            ->assertJsonPath('error.code', 'step_up_required');
    }

    public function test_valid_code_completes_sign_in(): void
    {
        $user = $this->mfaUser();
        $this->startLogin($user);

        $this->postJson(route('api.v1.auth.mfa.verify'), ['code' => $this->currentCode()])
            ->assertOk()
            ->assertJsonPath('data.status', 'authenticated');

        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.login', 'outcome' => 'success', 'actor_user_id' => $user->id]);
    }

    public function test_a_code_cannot_be_replayed(): void
    {
        $user = $this->mfaUser();
        $code = $this->currentCode();

        $this->startLogin($user);
        $this->postJson(route('api.v1.auth.mfa.verify'), ['code' => $code])->assertOk();
        $this->postJson(route('api.v1.auth.logout'))->assertNoContent();

        $this->startLogin($user);
        $this->postJson(route('api.v1.auth.mfa.verify'), ['code' => $code])->assertStatus(422);
        $this->assertGuest('web');
    }

    public function test_recovery_code_works_exactly_once(): void
    {
        $user = $this->mfaUser();
        $codes = app(RecoveryCodes::class)->regenerate($user);

        $this->startLogin($user);
        $this->postJson(route('api.v1.auth.mfa.verify'), ['recovery_code' => strtolower($codes[3])])->assertOk();
        $this->postJson(route('api.v1.auth.logout'))->assertNoContent();

        $this->startLogin($user);
        $this->postJson(route('api.v1.auth.mfa.verify'), ['recovery_code' => $codes[3]])->assertStatus(422);
        $this->assertCount(7, $user->fresh()->mfa_recovery_codes);
    }

    public function test_five_wrong_codes_lock_the_attempt_with_429(): void
    {
        $user = $this->mfaUser();
        $this->startLogin($user);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson(route('api.v1.auth.mfa.verify'), ['code' => '00000'.$i])->assertStatus(422);
        }

        $this->postJson(route('api.v1.auth.mfa.verify'), ['code' => $this->currentCode()])
            ->assertStatus(429);
        $this->assertGuest('web');
    }

    public function test_verify_without_a_pending_sign_in_returns_401(): void
    {
        $this->postJson(route('api.v1.auth.mfa.verify'), ['code' => '123456'])
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'mfa_session_expired');
    }

    public function test_pending_sign_in_expires_after_five_minutes(): void
    {
        $user = $this->mfaUser();
        $this->startLogin($user);

        $this->travel(6)->minutes();

        $this->postJson(route('api.v1.auth.mfa.verify'), ['code' => $this->currentCode()])
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'mfa_session_expired');
    }

    public function test_step_up_requires_password_and_code_for_mfa_users(): void
    {
        $user = $this->mfaUser();
        $this->startLogin($user);
        $this->postJson(route('api.v1.auth.mfa.verify'), ['recovery_code' => app(RecoveryCodes::class)->regenerate($user)[0]])->assertOk();
        $this->travel(11)->minutes();

        $this->postJson(route('api.v1.auth.confirm'), ['password' => self::PASSWORD])
            ->assertStatus(422)
            ->assertJsonValidationErrorFor('code', 'error.fields');
        $this->postJson(route('api.v1.auth.confirm'), ['password' => 'wrong-password', 'code' => $this->currentCode()])
            ->assertStatus(422)
            ->assertJsonValidationErrorFor('password', 'error.fields');

        $this->postJson(route('api.v1.auth.confirm'), ['password' => self::PASSWORD, 'code' => $this->currentCode()])
            ->assertOk();
        $this->deleteJson(route('api.v1.auth.mfa.destroy'))->assertNoContent();

        $this->assertNull($user->fresh()->mfa_confirmed_at);
        $this->assertNull($user->fresh()->mfa_secret);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.mfa_disabled', 'actor_user_id' => $user->id]);
    }
}
