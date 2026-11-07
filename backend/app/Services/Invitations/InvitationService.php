<?php

namespace App\Services\Invitations;

use App\Actions\Auth\CompleteLogin;
use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Enums\UserStatus;
use App\Exceptions\ApiException;
use App\Mail\InvitationMail;
use App\Models\DeviceRegistrationCode;
use App\Models\Invitation;
use App\Models\Role;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Auth\DeviceRegistry;
use App\Services\Authorization\UserManagementGuard;
use App\Services\Mail\MailSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Invitations from start to finish: an administrator invites someone by email, which also creates
 * the device registration code the invitation holds. The person accepts, creates their account
 * (the held code then belongs to it), completes every training lesson and the quiz, and only then
 * registers their device with the held code, which signs them in.
 */
class InvitationService
{
    private const DEVICE_MAX_ATTEMPTS = 5;

    private const DEVICE_DECAY_SECONDS = 900;

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly UserManagementGuard $guard,
        private readonly DeviceRegistry $devices,
        private readonly CompleteLogin $completeLogin,
        private readonly MailSettings $mail,
        private readonly TrainingCatalog $training,
    ) {}

    /**
     * Invite someone: checks the inviter may create accounts and give these roles, creates the
     * invitation with its held registration code, and emails the link.
     *
     * @param  array{email: string, name?: string|null, roles?: list<string>, message?: string|null}  $data
     * @return array{invitation: Invitation, code: string, email: array{sent: bool, error: string|null}}
     */
    public function invite(User $actor, array $data): array
    {
        $this->guard->requirePermission($actor, PermissionKey::UsersCreate, 'invitation.created');

        $roles = Role::query()->with('permissions')->whereIn('key', $data['roles'] ?? [])->get();
        if ($roles->isNotEmpty()) {
            $this->guard->requirePermission($actor, PermissionKey::UsersAssignRoles, 'invitation.created');
            $this->guard->authorizeGrant($actor, null, $roles, [], [], 'invitation.created');
        }

        $token = Str::random(64);
        $code = DeviceRegistry::generateCode();

        $invitation = DB::transaction(function () use ($actor, $data, $roles, $token, $code): Invitation {
            $invitation = Invitation::query()->create([
                'public_id' => (string) Str::uuid(),
                'token_hash' => hash('sha256', $token),
                'email' => strtolower(trim($data['email'])),
                'name' => ($data['name'] ?? null) ?: null,
                'roles' => $roles->pluck('key')->values()->all(),
                'message' => ($data['message'] ?? null) ?: null,
                'invited_by' => $actor->id,
                'code_hash' => hash('sha256', $code),
                'expires_at' => now()->addDays((int) config('lockguard.invitations.days')),
                'send_count' => 0,
                'quiz_attempts' => 0,
            ]);

            $this->audit->record('invitation.created', AuditOutcome::Success, actor: $actor, metadata: [
                'invitation' => $invitation->public_id,
                'email' => $invitation->email,
                'roles' => $invitation->roles,
                'expires_at' => $invitation->expires_at->toIso8601ZuluString(),
            ]);
            $this->audit->record('device.registration_code_created', AuditOutcome::Success, actor: $actor, metadata: [
                'invitation' => $invitation->public_id,
                'expires_at' => $invitation->expires_at->toIso8601ZuluString(),
                'channel' => 'invitation',
                'held_until' => 'account_created',
            ]);

            return $invitation;
        });

        return [
            'invitation' => $invitation,
            'code' => DeviceRegistry::formatCode($code),
            'email' => $this->send($invitation, $token, $actor),
        ];
    }

    /**
     * Send the invitation again with a new link (the old link stops working) and a fresh expiry.
     * The held registration code keeps working until the new expiry too.
     *
     * @return array{sent: bool, error: string|null}
     */
    public function resend(Invitation $invitation, User $actor): array
    {
        $this->guard->requirePermission($actor, PermissionKey::UsersCreate, 'invitation.resent');
        if (in_array($invitation->status(), ['completed', 'cancelled'], true)) {
            throw ApiException::invitationClosed($invitation->status());
        }

        $token = Str::random(64);
        $expiresAt = now()->addDays((int) config('lockguard.invitations.days'));

        DB::transaction(function () use ($invitation, $actor, $token, $expiresAt): void {
            $invitation->forceFill(['token_hash' => hash('sha256', $token), 'expires_at' => $expiresAt])->save();
            DeviceRegistrationCode::query()->where('invitation_id', $invitation->id)->whereNull('used_at')->whereNull('cancelled_at')->update(['expires_at' => $expiresAt]);

            $this->audit->record('invitation.resent', AuditOutcome::Success, actor: $actor, targets: ['user' => $invitation->user_id], metadata: [
                'invitation' => $invitation->public_id,
                'email' => $invitation->email,
                'expires_at' => $expiresAt->toIso8601ZuluString(),
            ]);
        });

        return $this->send($invitation->refresh(), $token, $actor);
    }

    /**
     * Cancel an invitation: the link and the held registration code stop working. An account
     * already created stays, without a registered device; manage it on the user's page.
     */
    public function cancel(Invitation $invitation, User $actor): void
    {
        $this->guard->requirePermission($actor, PermissionKey::UsersCreate, 'invitation.cancelled');
        if (in_array($invitation->status(), ['completed', 'cancelled'], true)) {
            throw ApiException::invitationClosed($invitation->status());
        }

        DB::transaction(function () use ($invitation, $actor): void {
            $invitation->forceFill(['cancelled_at' => now(), 'cancelled_by' => $actor->id])->save();
            DeviceRegistrationCode::query()->where('invitation_id', $invitation->id)->usable()->update(['cancelled_at' => now()]);

            $this->audit->record('invitation.cancelled', AuditOutcome::Success, actor: $actor, targets: ['user' => $invitation->user_id], metadata: [
                'invitation' => $invitation->public_id,
                'email' => $invitation->email,
            ]);
        });
    }

    /**
     * The invitation a link's token belongs to.
     */
    public function findByToken(string $token): Invitation
    {
        return Invitation::query()->with('inviter:id,name', 'user:id,name,email', 'registrationCode')->where('token_hash', hash('sha256', $token))->first()
            ?? throw ApiException::invitationNotFound();
    }

    /**
     * Step 1: create the account. The email is the invited one and cannot be changed; the roles
     * are the ones the administrator chose. The held registration code now belongs to the account.
     *
     * @param  array{name: string, username?: string|null, password: string}  $data
     */
    public function createAccount(Invitation $invitation, array $data): User
    {
        $this->requireStatus($invitation, 'pending');
        if (User::query()->where('email', $invitation->email)->exists()) {
            throw ValidationException::withMessages(['email' => 'An account with this email already exists. Sign in instead, or ask your administrator.']);
        }

        return DB::transaction(function () use ($invitation, $data): User {
            $user = User::query()->create([
                'name' => $data['name'],
                'username' => ($data['username'] ?? null) ?: null,
                'email' => $invitation->email,
                'password' => $data['password'],
            ]);
            $user->forceFill(['status' => UserStatus::Active, 'status_changed_at' => now(), 'email_verified_at' => now()])->save();

            $roleIds = Role::query()->whereIn('key', $invitation->roles ?? [])->pluck('id');
            $user->roles()->attach($roleIds->mapWithKeys(fn (int $id): array => [$id => ['assigned_by' => $invitation->invited_by]])->all());

            DeviceRegistrationCode::query()->create([
                'user_id' => $user->id,
                'invitation_id' => $invitation->id,
                'code_hash' => $invitation->code_hash,
                'created_by' => $invitation->invited_by,
                // The code is held until the device is registered; give at least a day after the account exists.
                'expires_at' => $invitation->expires_at->max(now()->addHours((int) config('lockguard.devices.registration_code_hours'))),
            ]);

            $invitation->forceFill(['user_id' => $user->id, 'accepted_at' => now(), 'lessons_completed' => []])->save();

            $this->audit->record('user.created', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id], metadata: [
                'invitation' => $invitation->public_id,
                'email' => $user->email,
                'username' => $user->username,
                'roles' => $invitation->roles,
                'channel' => 'invitation',
                'invited_by' => $invitation->invited_by,
            ]);
            $this->audit->record('invitation.accepted', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id], metadata: ['invitation' => $invitation->public_id]);

            return $user;
        });
    }

    /**
     * Step 2: a training lesson is finished. Lessons are taken in order.
     */
    public function completeLesson(Invitation $invitation, string $lesson): void
    {
        $this->requireStatus($invitation, 'training');

        $index = array_search($lesson, TrainingCatalog::LESSONS, true);
        if ($index === false) {
            throw ApiException::invitationNotFound();
        }
        $done = $invitation->completedLessons();
        $missing = array_diff(array_slice(TrainingCatalog::LESSONS, 0, $index), $done);
        if ($missing !== []) {
            throw new ApiException(409, 'lesson_out_of_order', 'Finish the earlier lessons first.');
        }
        if (in_array($lesson, $done, true)) {
            return;
        }

        $invitation->forceFill(['lessons_completed' => [...$done, $lesson]])->save();
    }

    /**
     * Step 3: the quiz questions, chosen once when the person first opens the quiz.
     *
     * @return list<array{id: string, question: string, choices: list<array{id: string, text: string}>}>
     */
    public function quiz(Invitation $invitation): array
    {
        $this->requireQuizOpen($invitation);

        if (($invitation->quiz_question_ids ?? []) === []) {
            $invitation->forceFill(['quiz_question_ids' => $this->training->pickQuestions((int) config('lockguard.invitations.quiz_questions'))])->save();
        }

        return $this->training->present($invitation->quiz_question_ids);
    }

    /**
     * Mark the quiz. Every question must be right; the wrong ones get a hint and can be tried again.
     *
     * @param  array<string, mixed>  $answers
     * @return array{passed: bool, results: list<array{id: string, correct: bool, hint: string|null}>}
     */
    public function answerQuiz(Invitation $invitation, array $answers): array
    {
        $this->requireQuizOpen($invitation);
        $ids = $invitation->quiz_question_ids ?? [];
        if ($ids === []) {
            throw ApiException::invitationClosed('wrong_step');
        }

        $results = $this->training->mark($ids, $answers);
        $passed = collect($results)->every(fn (array $result): bool => $result['correct']);
        $attempts = $invitation->quiz_attempts + 1;

        $invitation->forceFill(['quiz_attempts' => $attempts, 'training_completed_at' => $passed ? now() : null])->save();
        if ($passed) {
            $this->audit->record('invitation.training_completed', AuditOutcome::Success, actor: $invitation->user, targets: ['user' => $invitation->user_id], metadata: [
                'invitation' => $invitation->public_id,
                'quiz_attempts' => $attempts,
                'questions' => $ids,
            ]);
        }

        return ['passed' => $passed, 'results' => $results];
    }

    /**
     * Step 4: register this browser as the person's device with the held code, and sign them in.
     * Their password is asked again, so the link alone cannot register a device.
     */
    public function registerDevice(Request $request, Invitation $invitation, string $password): JsonResponse
    {
        $this->requireStatus($invitation, 'device');
        if (! $request->hasSession()) {
            throw new ApiException(400, 'stateful_client_required', 'Register your device in the LockGuard web or mobile app.');
        }

        $user = User::query()->with('roles')->find($invitation->user_id) ?? throw ApiException::invitationNotFound();

        $throttleKey = 'invitation-device:'.$invitation->id;
        if (RateLimiter::tooManyAttempts($throttleKey, self::DEVICE_MAX_ATTEMPTS)) {
            throw new ApiException(429, 'too_many_requests', 'Too many wrong passwords. Try again in '.ceil(RateLimiter::availableIn($throttleKey) / 60).' minute(s).');
        }
        if (! Hash::check($password, (string) $user->password)) {
            RateLimiter::hit($throttleKey, self::DEVICE_DECAY_SECONDS);
            $this->audit->record('invitation.device_password_rejected', AuditOutcome::Failure, targets: ['user' => $user->id], reason: 'Wrong password at device registration.', metadata: ['invitation' => $invitation->public_id]);

            throw ValidationException::withMessages(['password' => 'That is not the password you chose for this account.']);
        }
        RateLimiter::clear($throttleKey);

        if (! $user->isActive()) {
            throw ApiException::accountInactive();
        }
        if ($this->devices->find($request, $user)?->isRevoked()) {
            throw ApiException::deviceRevoked();
        }

        $code = DeviceRegistrationCode::query()->where('invitation_id', $invitation->id)->where('user_id', $user->id)->usable()->latest('id')->first()
            ?? throw new ApiException(409, 'device_code_expired', 'The registration code held for you expired or was cancelled. Ask your administrator to send the invitation again.');

        $this->devices->checkInvitationDevice($request, $user, $code);
        $response = $this->completeLogin->handle($request, $user, 'invitation');

        DB::transaction(function () use ($request, $invitation, $user, $code): void {
            $deviceId = $request->session()->get(DeviceRegistry::SESSION_KEY);
            // A bound account's code was redeemed by register(); an exempt one's is used up here.
            DeviceRegistrationCode::query()->whereKey($code->id)->whereNull('used_at')->update(['used_at' => now(), 'user_device_id' => $deviceId]);
            if ($deviceId !== null && ! $this->devices->isBound($user)) {
                $user->devices()->whereKey($deviceId)->whereNull('registered_at')->update(['registered_at' => now()]);
            }

            $invitation->forceFill(['device_registered_at' => now()])->save();
            $this->audit->record('invitation.completed', AuditOutcome::Success, actor: $user, targets: ['user' => $user->id, 'device' => $deviceId], metadata: ['invitation' => $invitation->public_id]);
        });

        return $response;
    }

    /**
     * Whether this person still owes the training from their invitation, so may not sign in yet.
     */
    public function owesTraining(User $user): bool
    {
        return Invitation::query()
            ->where('user_id', $user->id)
            ->whereNull('cancelled_at')
            ->whereNull('training_completed_at')
            ->exists();
    }

    /**
     * What the invitation page shows: never the token or the code.
     *
     * @return array<string, mixed>
     */
    public function describeForInvitee(Invitation $invitation): array
    {
        return [
            'status' => $invitation->status(),
            'email' => $invitation->email,
            'name' => $invitation->user?->name ?? $invitation->name,
            'invited_by' => $invitation->inviter?->name,
            'message' => $invitation->message,
            'roles' => $this->roleLabels($invitation),
            'expires_at' => ($invitation->accepted_at !== null ? $invitation->registrationCode?->expires_at : null)?->toIso8601ZuluString('millisecond')
                ?? $invitation->expires_at->toIso8601ZuluString('millisecond'),
            'account_created' => $invitation->accepted_at !== null,
            'lessons' => TrainingCatalog::LESSONS,
            'lessons_completed' => $invitation->completedLessons(),
            'training_completed' => $invitation->training_completed_at !== null,
            'quiz_questions' => (int) config('lockguard.invitations.quiz_questions'),
            'device_bound' => $invitation->user !== null ? $this->devices->isBound($invitation->user->load('roles')) : $this->wouldBeBound($invitation),
        ];
    }

    /**
     * @return list<string>
     */
    public function roleLabels(Invitation $invitation): array
    {
        return Role::query()->whereIn('key', $invitation->roles ?? [])->orderBy('name')->pluck('name')->all();
    }

    /**
     * Email the link. A failure is recorded on the invitation and returned, never thrown: the
     * invitation exists either way and can be sent again once email works.
     *
     * @return array{sent: bool, error: string|null}
     */
    private function send(Invitation $invitation, string $token, User $actor): array
    {
        $url = config('lockguard.invitations.public_url').'/invite/'.$token;

        try {
            $this->mail->apply();
            Mail::to($invitation->email, $invitation->name)->send(new InvitationMail(
                inviteeName: $invitation->name,
                inviterName: $actor->name,
                acceptUrl: $url,
                expiresAt: $invitation->expires_at,
                roleLabels: $this->roleLabels($invitation),
                personalMessage: $invitation->message,
            ));
        } catch (Throwable $exception) {
            Log::warning('Invitation email could not be sent.', ['invitation' => $invitation->id, 'error' => $exception->getMessage()]);
            $error = Str::limit('The email could not be sent: '.$exception->getMessage(), 480);
            $invitation->forceFill(['last_send_error' => $error])->save();
            $this->audit->record('invitation.email_failed', AuditOutcome::Failure, actor: $actor, reason: Str::limit($exception->getMessage(), 250), metadata: ['invitation' => $invitation->public_id]);

            return ['sent' => false, 'error' => $error];
        }

        $invitation->forceFill(['sent_at' => now(), 'send_count' => $invitation->send_count + 1, 'last_send_error' => null])->save();

        return ['sent' => true, 'error' => null];
    }

    private function requireStatus(Invitation $invitation, string $status): void
    {
        $current = $invitation->status();
        if ($current === $status) {
            return;
        }

        throw ApiException::invitationClosed(in_array($current, ['completed', 'cancelled', 'expired'], true) ? $current : 'wrong_step');
    }

    private function requireQuizOpen(Invitation $invitation): void
    {
        $this->requireStatus($invitation, 'training');
        if (array_diff(TrainingCatalog::LESSONS, $invitation->completedLessons()) !== []) {
            throw new ApiException(409, 'lessons_incomplete', 'Finish every lesson before the quiz.');
        }
    }

    /**
     * Whether the account will be bound to one device, from the invited roles.
     */
    private function wouldBeBound(Invitation $invitation): bool
    {
        if (! config('lockguard.devices.binding') || array_key_exists(strtolower($invitation->email), (array) config('lockguard.devices.address_accounts'))) {
            return false;
        }

        return array_intersect($invitation->roles ?? [], (array) config('lockguard.devices.exempt_roles')) === [];
    }
}
