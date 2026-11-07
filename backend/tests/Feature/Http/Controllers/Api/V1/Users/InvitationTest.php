<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Users;

use App\Actions\Auth\CompleteLogin;
use App\Enums\RoleTemplate;
use App\Mail\InvitationMail;
use App\Models\AuditLog;
use App\Models\DeviceRegistrationCode;
use App\Models\Invitation;
use App\Models\Role;
use App\Models\User;
use App\Services\Invitations\TrainingCatalog;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use ReflectionClassConstant;
use Symfony\Component\Mailer\Exception\TransportException;
use Tests\TestCase;

/**
 * Invitations: an administrator emails a link and a held registration code is created. The person
 * creates their account, finishes every lesson and the quiz, and only then registers their device.
 */
class InvitationTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'CorrectHorse123';

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        config(['lockguard.devices.binding' => true, 'lockguard.invitations.public_url' => 'https://lockguard.example.test']);
        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
        Mail::fake();

        $this->admin = $this->userWithRole(RoleTemplate::SuperAdministrator);
    }

    private function userWithRole(RoleTemplate $template): User
    {
        $user = User::factory()->create(['name' => 'Dana Admin']);
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    private function asAdmin(?User $admin = null): static
    {
        return $this->actingAs($admin ?? $this->admin)->withSession([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()]);
    }

    /**
     * Invite someone and return the link's token from the email.
     */
    private function invite(string $email = 'riley@example.test', array $roles = ['resident']): string
    {
        $this->asAdmin()->postJson(route('api.v1.invitations.store'), ['email' => $email, 'name' => 'Riley', 'roles' => $roles])->assertCreated();
        $this->flushSession();
        app('auth')->forgetGuards();

        $token = null;
        Mail::assertSent(InvitationMail::class, function (InvitationMail $mail) use ($email, &$token): bool {
            if (! $mail->hasTo($email)) {
                return false;
            }
            $token = substr($mail->acceptUrl, strlen('https://lockguard.example.test/invite/'));

            return true;
        });

        return (string) $token;
    }

    private function accept(string $token, string $step = '', string $method = 'GET', array $body = []): TestResponse
    {
        $url = '/api/v1/invitations/accept/'.$token.($step === '' ? '' : '/'.$step);

        return $this->json($method, $url, $body);
    }

    private function createAccount(string $token): TestResponse
    {
        return $this->accept($token, 'account', 'POST', ['name' => 'Riley Resident', 'password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD]);
    }

    private function finishLessons(string $token): void
    {
        foreach (TrainingCatalog::LESSONS as $lesson) {
            $this->accept($token, 'lessons/'.$lesson, 'POST')->assertOk();
        }
    }

    /**
     * @return array<string, string>
     */
    private function rightAnswers(string $token): array
    {
        $bank = (new ReflectionClassConstant(TrainingCatalog::class, 'QUESTIONS'))->getValue();

        return collect($this->accept($token, 'quiz')->assertOk()->json('data.questions'))
            ->mapWithKeys(fn (array $question): array => [$question['id'] => $bank[$question['id']]['answer']])
            ->all();
    }

    public function test_an_invitation_emails_a_link_and_holds_a_registration_code(): void
    {
        $response = $this->asAdmin()->postJson(route('api.v1.invitations.store'), [
            'email' => 'Riley@Example.test',
            'name' => 'Riley',
            'roles' => ['resident'],
            'message' => 'Welcome to the building!',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.email_sent', true)
            ->assertJsonPath('data.invitation.status', 'pending')
            ->assertJsonPath('data.invitation.email', 'riley@example.test')
            ->assertJsonPath('data.invitation.roles', ['resident']);
        $this->assertMatchesRegularExpression('/^[A-Z2-9]{4}-[A-Z2-9]{4}$/', $response->json('data.registration_code'));

        Mail::assertSent(InvitationMail::class, fn (InvitationMail $mail): bool => $mail->hasTo('riley@example.test')
            && str_starts_with($mail->acceptUrl, 'https://lockguard.example.test/invite/')
            && $mail->personalMessage === 'Welcome to the building!'
            && $mail->inviterName === 'Dana Admin');

        $invitation = Invitation::query()->sole();
        $code = str_replace('-', '', $response->json('data.registration_code'));
        $this->assertSame(hash('sha256', $code), $invitation->code_hash);
        $this->assertNotNull($invitation->sent_at);
        // Held until the account exists: no code belongs to anyone yet.
        $this->assertSame(0, DeviceRegistrationCode::query()->count());
        $this->assertTrue(AuditLog::query()->where('action', 'invitation.created')->exists());
    }

    public function test_the_whole_journey_creates_the_account_trains_and_registers_the_device(): void
    {
        $token = $this->invite();

        $this->accept($token)->assertOk()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.email', 'riley@example.test')
            ->assertJsonPath('data.invited_by', 'Dana Admin')
            ->assertJsonPath('data.roles', ['Resident'])
            ->assertJsonPath('data.device_bound', true);

        $this->createAccount($token)->assertCreated()->assertJsonPath('data.status', 'training');
        $user = User::query()->where('email', 'riley@example.test')->sole();
        $this->assertSame(['resident'], $user->roles->pluck('key')->all());
        $this->assertTrue($user->isActive());
        $code = DeviceRegistrationCode::query()->sole();
        $this->assertSame($user->id, $code->user_id);
        $this->assertSame(Invitation::query()->value('code_hash'), $code->code_hash);

        // The device cannot be registered, nor the quiz opened, before the training.
        $this->accept($token, 'device', 'POST', ['password' => self::PASSWORD])->assertStatus(409);
        $this->accept($token, 'quiz')->assertStatus(409)->assertJsonPath('error.code', 'lessons_incomplete');
        $this->accept($token, 'lessons/lock-unlock', 'POST')->assertStatus(409)->assertJsonPath('error.code', 'lesson_out_of_order');

        $this->finishLessons($token);
        $questions = $this->accept($token, 'quiz')->assertOk()->json('data.questions');
        $this->assertCount(5, $questions);
        $this->assertArrayNotHasKey('answer', $questions[0]);
        $this->assertCount(4, $questions[0]['choices']);
        // The same questions when the quiz is opened again.
        $this->assertSame(array_column($questions, 'id'), array_column($this->accept($token, 'quiz')->json('data.questions'), 'id'));

        $answers = $this->rightAnswers($token);
        $wrong = $answers;
        $first = array_key_first($wrong);
        $wrong[$first] = $wrong[$first] === 'a' ? 'b' : 'a';
        $marked = $this->accept($token, 'quiz', 'POST', ['answers' => $wrong])->assertOk()->assertJsonPath('data.passed', false)->json('data.results');
        $this->assertSame([false], array_values(array_map(fn (array $r): bool => $r['correct'], array_filter($marked, fn (array $r): bool => $r['id'] === $first))));
        $this->assertNotNull(collect($marked)->firstWhere('id', $first)['hint']);
        $this->accept($token, 'device', 'POST', ['password' => self::PASSWORD])->assertStatus(409);

        $this->accept($token, 'quiz', 'POST', ['answers' => $answers])->assertOk()->assertJsonPath('data.passed', true);
        $this->accept($token)->assertJsonPath('data.status', 'device')->assertJsonPath('data.training_completed', true);

        $this->accept($token, 'device', 'POST', ['password' => 'not-the-password'])->assertUnprocessable()->assertJsonValidationErrors('password', 'error.fields');

        $this->accept($token, 'device', 'POST', ['password' => self::PASSWORD])->assertOk()
            ->assertJsonPath('data.status', 'authenticated')
            ->assertJsonPath('data.user.email', 'riley@example.test');

        $this->assertAuthenticatedAs($user);
        $device = $user->devices()->sole();
        $this->assertNotNull($device->registered_at);
        $this->assertNotNull($code->refresh()->used_at);
        $this->assertSame($device->id, $code->user_device_id);
        $this->assertSame('completed', Invitation::query()->sole()->status());
        $this->assertSame(2, Invitation::query()->sole()->quiz_attempts);
        $this->getJson(route('api.v1.auth.me'))->assertOk();

        // The link is used up.
        $this->accept($token, 'device', 'POST', ['password' => self::PASSWORD])->assertStatus(410)->assertJsonPath('error.code', 'invitation_completed');
        $this->accept($token)->assertOk()->assertJsonPath('data.status', 'completed');
    }

    public function test_an_invited_person_cannot_sign_in_until_the_training_is_done(): void
    {
        $token = $this->invite('admin2@example.test', ['security_administrator']);
        $this->createAccount($token)->assertCreated();

        $this->postJson(route('api.v1.auth.login'), ['email' => 'admin2@example.test', 'password' => self::PASSWORD])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'training_required');
        $this->assertGuest();
    }

    public function test_an_exempt_account_still_trains_and_its_device_is_recorded_as_registered(): void
    {
        $token = $this->invite('admin2@example.test', ['security_administrator']);
        $this->accept($token)->assertJsonPath('data.device_bound', false);
        $this->createAccount($token)->assertCreated();
        $this->finishLessons($token);
        $this->accept($token, 'quiz', 'POST', ['answers' => $this->rightAnswers($token)])->assertJsonPath('data.passed', true);

        $this->accept($token, 'device', 'POST', ['password' => self::PASSWORD])->assertOk()->assertJsonPath('data.status', 'authenticated');

        $user = User::query()->where('email', 'admin2@example.test')->sole();
        $this->assertNotNull($user->devices()->sole()->registered_at);
        $this->assertNotNull(DeviceRegistrationCode::query()->sole()->used_at);
    }

    public function test_inviting_with_roles_follows_the_anti_escalation_rules(): void
    {
        // Device binding is covered elsewhere; here only the permission decision matters.
        config(['lockguard.devices.binding' => false]);
        $manager = $this->userWithRole(RoleTemplate::PropertyManager);

        // A property manager may invite, but cannot give roles (no users.assign_roles).
        $this->asAdmin($manager)->postJson(route('api.v1.invitations.store'), ['email' => 'new@example.test', 'roles' => ['super_administrator']])->assertForbidden()->assertJsonPath('error.code', 'forbidden');
        $this->asAdmin($manager)->postJson(route('api.v1.invitations.store'), ['email' => 'new@example.test'])->assertCreated();
        $this->assertSame(1, Invitation::query()->count());
    }

    public function test_an_email_that_has_an_account_or_a_waiting_invitation_is_refused(): void
    {
        User::factory()->create(['email' => 'taken@example.test']);
        $this->asAdmin()->postJson(route('api.v1.invitations.store'), ['email' => 'taken@example.test'])
            ->assertUnprocessable()->assertJsonValidationErrors('email', 'error.fields');

        $this->invite('riley@example.test');
        $this->asAdmin()->postJson(route('api.v1.invitations.store'), ['email' => 'RILEY@example.test'])
            ->assertUnprocessable()->assertJsonValidationErrors('email', 'error.fields');
    }

    public function test_resending_replaces_the_link_and_cancelling_closes_it(): void
    {
        $old = $this->invite();
        $invitation = Invitation::query()->sole();
        Mail::fake();

        $this->asAdmin()->postJson(route('api.v1.invitations.resend', $invitation))->assertOk()->assertJsonPath('data.email_sent', true);
        $this->flushSession();
        app('auth')->forgetGuards();
        $this->accept($old)->assertNotFound()->assertJsonPath('error.code', 'invitation_not_found');
        $new = '';
        Mail::assertSent(InvitationMail::class, function (InvitationMail $mail) use (&$new): bool {
            $new = substr($mail->acceptUrl, strlen('https://lockguard.example.test/invite/'));

            return true;
        });
        $this->accept($new)->assertOk();

        $this->createAccount($new)->assertCreated();
        $this->asAdmin()->postJson(route('api.v1.invitations.cancel', $invitation))->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->flushSession();
        app('auth')->forgetGuards();

        $this->accept($new, 'lessons/welcome', 'POST')->assertStatus(410)->assertJsonPath('error.code', 'invitation_cancelled');
        $this->assertNotNull(DeviceRegistrationCode::query()->sole()->cancelled_at);
    }

    public function test_an_expired_invitation_cannot_be_accepted(): void
    {
        $token = $this->invite();
        $this->travel(8)->days();

        $this->accept($token)->assertOk()->assertJsonPath('data.status', 'expired');
        $this->createAccount($token)->assertStatus(410)->assertJsonPath('error.code', 'invitation_expired');
        $this->assertSame(1, User::query()->count());
    }

    public function test_a_failed_email_keeps_the_invitation_and_reports_why(): void
    {
        Mail::shouldReceive('to')->andThrow(new TransportException('Connection could not be established with host "smtp.example.test"'));

        $response = $this->asAdmin()->postJson(route('api.v1.invitations.store'), ['email' => 'riley@example.test'])->assertCreated();

        $response->assertJsonPath('data.email_sent', false);
        $this->assertStringStartsWith('The email could not be sent', $response->json('data.email_error'));
        $this->assertNull(Invitation::query()->sole()->sent_at);
        $this->assertTrue(AuditLog::query()->where('action', 'invitation.email_failed')->exists());
    }

    public function test_administrators_see_where_each_invitation_stands(): void
    {
        $token = $this->invite();
        $this->createAccount($token);
        $this->accept($token, 'lessons/welcome', 'POST');

        $this->asAdmin()->getJson(route('api.v1.invitations.index'))->assertOk()
            ->assertJsonPath('data.0.status', 'training')
            ->assertJsonPath('data.0.lessons_completed', 1)
            ->assertJsonPath('data.0.lessons_total', count(TrainingCatalog::LESSONS))
            ->assertJsonPath('data.0.user.name', 'Riley Resident')
            ->assertJsonMissingPath('data.0.token_hash')
            ->assertJsonMissingPath('data.0.code_hash');
    }
}
