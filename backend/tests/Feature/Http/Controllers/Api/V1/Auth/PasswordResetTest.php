<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Auth;

use App\Enums\UserStatus;
use App\Http\Controllers\Api\V1\Auth\PasswordResetController;
use App\Jobs\SendPasswordChangedEmail;
use App\Jobs\SendPasswordResetEmail;
use App\Mail\PasswordChangedMail;
use App\Mail\PasswordResetMail;
use App\Models\Invitation;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Mail\MailSettings;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    private const OLD_PASSWORD = 'correct-horse-42-battery';

    private const NEW_PASSWORD = 'brand-new-staple-77-lamp';

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
    }

    private function forgot(string $email): TestResponse
    {
        return $this->postJson(route('api.v1.auth.password.forgot'), ['email' => $email]);
    }

    private function reset(string $email, string $token, string $password = self::NEW_PASSWORD, ?string $confirmation = null): TestResponse
    {
        return $this->postJson(route('api.v1.auth.password.reset'), [
            'email' => $email,
            'token' => $token,
            'password' => $password,
            'password_confirmation' => $confirmation ?? $password,
        ]);
    }

    /**
     * Ask for a link and return the token the queued email would carry.
     */
    private function tokenFor(User $user): string
    {
        Queue::fake([SendPasswordResetEmail::class]);
        $this->forgot($user->email)->assertAccepted();

        $token = null;
        Queue::assertPushed(SendPasswordResetEmail::class, function (SendPasswordResetEmail $job) use ($user, &$token): bool {
            $token = $job->token;

            return $job->userId === $user->id;
        });

        return $token;
    }

    public function test_an_active_account_is_emailed_a_one_time_link(): void
    {
        Mail::fake();
        $user = User::factory()->create(['email' => 'pat@example.com']);

        $this->forgot('Pat@Example.com ')
            ->assertAccepted()
            ->assertJsonPath('data.message', PasswordResetController::REQUESTED_MESSAGE);

        $token = null;
        Mail::assertSent(PasswordResetMail::class, function (PasswordResetMail $mail) use ($user, &$token): bool {
            // The token is after the "#", so browsers never send it to a server or a proxy log.
            [$base, $fragment] = explode('#', $mail->resetUrl, 2);
            parse_str($fragment, $parts);
            $token = $parts['token'];

            return $mail->hasTo($user->email)
                && $base === config('lockguard.invitations.public_url').'/reset-password'
                && $parts['email'] === $user->email
                && strlen($parts['token']) >= 40
                && $mail->expiresInMinutes === 60;
        });
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.password_reset_requested', 'outcome' => 'success', 'target_user_id' => $user->id]);
        $this->assertNotSame($token, DB::table('password_reset_tokens')->value('token'), 'Only a hash of the token is stored.');
    }

    public function test_the_queued_email_is_encrypted_because_it_carries_the_token(): void
    {
        $this->assertContains(ShouldBeEncrypted::class, class_implements(SendPasswordResetEmail::class));
    }

    public function test_the_answer_never_reveals_whether_an_account_can_reset(): void
    {
        Queue::fake();
        config(['lockguard.devices.address_accounts' => ['kiosk@example.com' => ['127.0.0.1']]]);
        $suspended = User::factory()->suspended()->create();
        $inTraining = User::factory()->create();
        Invitation::factory()->create(['user_id' => $inTraining->id, 'email' => $inTraining->email, 'invited_by' => $suspended->id]);
        $kiosk = User::factory()->create(['email' => 'kiosk@example.com']);

        foreach (['nobody@example.com', $suspended->email, $inTraining->email, $kiosk->email] as $email) {
            $this->forgot($email)
                ->assertAccepted()
                ->assertExactJson(['data' => ['status' => 'requested', 'message' => PasswordResetController::REQUESTED_MESSAGE]]);
        }

        Queue::assertNothingPushed();
        $this->assertSame(0, DB::table('password_reset_tokens')->count());
        $this->assertSame(4, DB::table('audit_logs')->where('action', 'auth.password_reset_requested')->where('outcome', 'denied')->count());
    }

    public function test_asking_again_within_a_minute_does_not_send_another_email(): void
    {
        Queue::fake();
        $user = User::factory()->create();

        $this->forgot($user->email)->assertAccepted();
        $this->forgot($user->email)->assertAccepted();
        Queue::assertPushed(SendPasswordResetEmail::class, 1);

        $this->travel(61)->seconds();
        $this->forgot($user->email)->assertAccepted();
        Queue::assertPushed(SendPasswordResetEmail::class, 2);
    }

    public function test_requests_are_rate_limited_per_address(): void
    {
        Queue::fake();

        foreach (range(1, 5) as $i) {
            $this->forgot("someone{$i}@example.com")->assertAccepted();
        }
        $this->forgot('someone6@example.com')->assertTooManyRequests();
    }

    public function test_a_valid_link_sets_the_password_ends_every_session_and_sends_a_notice(): void
    {
        config(['session.driver' => 'database']);
        $user = User::factory()->create(['password' => self::OLD_PASSWORD]);
        $user->createToken('kiosk');
        DB::table('sessions')->insert(['id' => 'old-session', 'user_id' => $user->id, 'payload' => '', 'last_activity' => now()->getTimestamp()]);
        $token = $this->tokenFor($user);
        Queue::fake([SendPasswordChangedEmail::class]);

        $this->reset($user->email, $token)
            ->assertOk()
            ->assertJsonPath('data.status', 'reset')
            ->assertJsonPath('data.signed_out', ['browser_logins' => 1, 'api_clients' => 1]);

        $this->assertTrue(password_verify(self::NEW_PASSWORD, $user->fresh()->password));
        $this->assertSame(0, $user->tokens()->count());
        $this->assertDatabaseMissing('sessions', ['id' => 'old-session']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.password_reset', 'outcome' => 'success', 'target_user_id' => $user->id]);
        Queue::assertPushed(SendPasswordChangedEmail::class, fn (SendPasswordChangedEmail $job): bool => $job->userId === $user->id);
        $this->assertGuest('web');

        // The link works once.
        $this->reset($user->email, $token, 'another-fresh-one-99-x')->assertUnprocessable()->assertJsonValidationErrors('token', 'error.fields');
    }

    public function test_the_new_password_signs_in_and_the_old_one_does_not(): void
    {
        $user = User::factory()->create(['password' => self::OLD_PASSWORD]);
        $this->reset($user->email, $this->tokenFor($user))->assertOk();

        $this->postJson(route('api.v1.auth.login'), ['email' => $user->email, 'password' => self::OLD_PASSWORD])->assertUnprocessable();
        $this->postJson(route('api.v1.auth.login'), ['email' => $user->email, 'password' => self::NEW_PASSWORD])
            ->assertOk()
            ->assertJsonPath('data.status', 'authenticated');
    }

    public function test_two_step_verification_is_still_required_after_a_reset(): void
    {
        $user = User::factory()->create(['password' => self::OLD_PASSWORD, 'mfa_secret' => 'JBSWY3DPEHPK3PXP', 'mfa_confirmed_at' => now()]);
        $this->reset($user->email, $this->tokenFor($user))->assertOk();

        $this->postJson(route('api.v1.auth.login'), ['email' => $user->email, 'password' => self::NEW_PASSWORD])
            ->assertOk()
            ->assertJsonPath('data.status', 'mfa_required');
    }

    public function test_an_expired_wrong_or_foreign_link_is_refused(): void
    {
        $user = User::factory()->create(['password' => self::OLD_PASSWORD]);
        $other = User::factory()->create();
        $token = $this->tokenFor($user);

        $this->reset($user->email, 'not-the-token')->assertUnprocessable()->assertJsonValidationErrors('token', 'error.fields');
        $this->reset($other->email, $token)->assertUnprocessable()->assertJsonValidationErrors('token', 'error.fields');
        $this->reset('nobody@example.com', $token)->assertUnprocessable()->assertJsonValidationErrors('token', 'error.fields');

        $this->travel(61)->minutes();
        $this->reset($user->email, $token)->assertUnprocessable()->assertJsonValidationErrors('token', 'error.fields');

        $this->assertTrue(password_verify(self::OLD_PASSWORD, $user->fresh()->password));
        $this->assertSame(4, DB::table('audit_logs')->where('action', 'auth.password_reset')->where('outcome', 'failure')->count());
    }

    public function test_the_new_password_must_be_strong_confirmed_and_different(): void
    {
        $user = User::factory()->create(['password' => self::OLD_PASSWORD]);
        $token = $this->tokenFor($user);

        $this->reset($user->email, $token, 'short1')->assertJsonValidationErrors('password', 'error.fields');
        $this->reset($user->email, $token, self::NEW_PASSWORD, 'something-else-12')->assertJsonValidationErrors('password', 'error.fields');
        $this->reset($user->email, $token, self::OLD_PASSWORD)->assertJsonValidationErrors('password', 'error.fields');

        // None of those used up the link.
        $this->reset($user->email, $token)->assertOk();
    }

    public function test_an_account_suspended_after_asking_cannot_use_its_link(): void
    {
        $user = User::factory()->create(['password' => self::OLD_PASSWORD]);
        $token = $this->tokenFor($user);
        $user->forceFill(['status' => UserStatus::Suspended, 'status_changed_at' => now()])->save();

        $this->reset($user->email, $token)->assertUnprocessable()->assertJsonValidationErrors('token', 'error.fields');

        $this->assertTrue(password_verify(self::OLD_PASSWORD, $user->fresh()->password));
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.password_reset', 'outcome' => 'denied']);
    }

    public function test_the_changed_notice_names_the_sign_in_page(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        (new SendPasswordChangedEmail($user->id))->handle(app(MailSettings::class), app(AuditLogger::class));

        Mail::assertSent(PasswordChangedMail::class, fn (PasswordChangedMail $mail): bool => $mail->hasTo($user->email)
            && $mail->signInUrl === config('lockguard.invitations.public_url').'/login');
    }
}
