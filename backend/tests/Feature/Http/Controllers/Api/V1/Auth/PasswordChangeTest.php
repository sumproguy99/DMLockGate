<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Auth;

use App\Actions\Auth\CompleteLogin;
use App\Enums\RoleTemplate;
use App\Jobs\SendPasswordChangedEmail;
use App\Mail\PasswordChangedMail;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Mail\MailSettings;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Changing your own password while signed in, and the forced change for an account whose password
 * an administrator chose.
 */
class PasswordChangeTest extends TestCase
{
    use RefreshDatabase;

    private const CHOSEN = 'admin-chosen-pass-123';

    private const OWN = 'my-own-secret-pass-456';

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
    }

    private function change(string $current, string $new = self::OWN, ?string $confirmation = null): TestResponse
    {
        return $this->putJson(route('api.v1.auth.password.update'), [
            'current_password' => $current,
            'password' => $new,
            'password_confirmation' => $confirmation ?? $new,
        ]);
    }

    private function signIn(User $user, string $password = self::CHOSEN): TestResponse
    {
        return $this->postJson(route('api.v1.auth.login'), ['email' => $user->email, 'password' => $password])->assertOk();
    }

    public function test_an_account_an_administrator_created_must_choose_its_own_password_first(): void
    {
        Queue::fake([SendPasswordChangedEmail::class]);
        $admin = User::factory()->create();
        $admin->roles()->attach(Role::query()->where('key', RoleTemplate::SuperAdministrator->value)->value('id'));

        $this->actingAs($admin)
            ->withSession([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()])
            ->postJson(route('api.v1.users.store'), ['name' => 'New Person', 'email' => 'new@example.test', 'password' => self::CHOSEN, 'password_confirmation' => self::CHOSEN])
            ->assertCreated()
            ->assertJsonPath('data.password_change_required', true);
        $this->flushSession();
        app('auth')->forgetGuards();
        $person = User::query()->where('email', 'new@example.test')->sole();

        $this->signIn($person)->assertJsonPath('data.user.password_change_required', true);
        $this->assertTrue(AuditLog::query()->where('action', 'auth.login')->latest('id')->first()->metadata['change_required_by_admin']);

        $this->getJson(route('api.v1.locks.index'))->assertForbidden()->assertJsonPath('error.code', 'password_change_required');
        // Not even step-up or two-step setup: the password comes first.
        $this->postJson(route('api.v1.auth.confirm'), ['password' => self::CHOSEN])->assertJsonPath('error.code', 'password_change_required');
        $this->getJson(route('api.v1.auth.me'))->assertOk()->assertJsonPath('data.password_change_required', true);

        $this->change(self::CHOSEN)->assertOk()->assertJsonPath('data.status', 'changed');

        // The same session carries on with the new password.
        $this->getJson(route('api.v1.auth.me'))->assertOk()->assertJsonPath('data.password_change_required', false);
        $this->getJson(route('api.v1.locks.index'))->assertOk();
        $person->refresh();
        $this->assertFalse($person->password_change_required);
        $this->assertTrue(Hash::check(self::OWN, $person->password));
        $audit = AuditLog::query()->where('action', 'auth.password_changed')->sole();
        $this->assertTrue($audit->metadata['was_required']);
        Queue::assertPushed(SendPasswordChangedEmail::class, fn (SendPasswordChangedEmail $job): bool => $job->userId === $person->id && $job->how === SendPasswordChangedEmail::CHANGED);
    }

    public function test_a_required_administrator_changes_the_password_before_setting_up_two_step_sign_in(): void
    {
        config(['lockguard.auth.mfa_required_roles' => ['super_administrator']]);
        $admin = User::factory()->create(['password' => self::CHOSEN]);
        $admin->forceFill(['password_change_required' => true])->save();
        $admin->roles()->attach(Role::query()->where('key', RoleTemplate::SuperAdministrator->value)->value('id'));

        $this->signIn($admin);
        $this->getJson(route('api.v1.users.index'))->assertJsonPath('error.code', 'password_change_required');
        $this->change(self::CHOSEN)->assertOk();
        $this->getJson(route('api.v1.users.index'))->assertJsonPath('error.code', 'mfa_setup_required');
    }

    public function test_changing_the_password_needs_the_current_one_and_a_new_strong_one(): void
    {
        $user = User::factory()->create(['password' => self::CHOSEN]);
        $this->signIn($user);

        $this->change('wrong-password-000')->assertUnprocessable()->assertJsonValidationErrors('current_password', 'error.fields');
        $this->assertSame('Invalid current password.', AuditLog::query()->where('action', 'auth.password_changed')->sole()->reason);
        $this->change(self::CHOSEN, 'short1')->assertJsonValidationErrors('password', 'error.fields');
        $this->change(self::CHOSEN, self::OWN, 'something-else-789')->assertJsonValidationErrors('password', 'error.fields');
        $this->change(self::CHOSEN, self::CHOSEN)->assertJsonValidationErrors('password', 'error.fields');

        $this->assertTrue(Hash::check(self::CHOSEN, $user->fresh()->password));
    }

    public function test_repeated_wrong_current_passwords_are_throttled(): void
    {
        $user = User::factory()->create(['password' => self::CHOSEN]);
        $this->signIn($user);

        for ($i = 0; $i < 5; $i++) {
            $this->change('wrong-password-000')->assertUnprocessable();
        }
        $this->change(self::CHOSEN)->assertStatus(429);
    }

    public function test_a_password_reset_by_email_also_clears_the_requirement(): void
    {
        Queue::fake();
        $user = User::factory()->create(['password' => self::CHOSEN]);
        $user->forceFill(['password_change_required' => true])->save();
        $token = Password::broker()->getRepository()->create($user);

        $this->postJson(route('api.v1.auth.password.reset'), ['email' => $user->email, 'token' => $token, 'password' => self::OWN, 'password_confirmation' => self::OWN])->assertOk();

        $this->assertFalse($user->fresh()->password_change_required);
    }

    public function test_the_email_says_the_password_was_changed_while_signed_in(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        (new SendPasswordChangedEmail($user->id, SendPasswordChangedEmail::CHANGED))->handle(app(MailSettings::class), app(AuditLogger::class));

        Mail::assertSent(PasswordChangedMail::class, fn (PasswordChangedMail $mail): bool => $mail->changedWhileSignedIn
            && str_contains($mail->render(), 'changed while signed in'));
    }
}
