<?php

namespace App\Console\Commands;

use App\Enums\AuditOutcome;
use App\Enums\RoleTemplate;
use App\Models\Role;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

use function Laravel\Prompts\password;
use function Laravel\Prompts\text;

#[Signature('lockguard:create-admin {--name= : Display name} {--email= : Sign-in email address}')]
#[Description('Create a Super Administrator account (the password is always entered interactively)')]
class CreateAdminCommand extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(AuditLogger $audit): int
    {
        $role = Role::query()->where('key', RoleTemplate::SuperAdministrator->value)->first();
        if ($role === null) {
            $this->components->error('The Super Administrator role is missing. Run `php artisan db:seed` first.');

            return self::FAILURE;
        }

        $input = [
            'name' => $this->option('name') ?: text('Display name', required: true),
            'email' => $this->option('email') ?: text('Email address', required: true),
            'password' => password('Password (at least 12 characters)', required: true),
            'password_confirmation' => password('Repeat password', required: true),
        ];

        $validator = Validator::make($input, [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(12)->letters()->numbers()],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->components->error($message);
            }

            return self::FAILURE;
        }

        $user = DB::transaction(function () use ($input, $role, $audit): User {
            $user = User::query()->create([
                'name' => $input['name'],
                'email' => $input['email'],
                'password' => $input['password'],
            ]);
            $user->roles()->attach($role);

            $audit->record(
                action: 'user.created',
                outcome: AuditOutcome::Success,
                targets: ['user' => $user->id],
                reason: 'Super Administrator created from the command line.',
                metadata: ['roles' => [$role->key], 'channel' => 'console'],
            );

            return $user;
        });

        $this->components->info("Super Administrator {$user->email} created (user #{$user->id}). Set up MFA at first sign-in.");

        return self::SUCCESS;
    }
}
