<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Auth\DeviceRegistry;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('lockguard:device-code {email : The person\'s sign-in email address}')]
#[Description('Create a one-time code that registers the one device a person\'s account works on')]
class DeviceCodeCommand extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(DeviceRegistry $devices): int
    {
        $user = User::query()->with('roles')->where('email', $this->argument('email'))->first();
        if ($user === null) {
            $this->components->error('No account has that email address.');

            return self::FAILURE;
        }
        if (! $devices->isBound($user)) {
            $this->components->warn("{$user->email} is not bound to one device (device binding is off, or they hold an exempt role), so no code is needed.");

            return self::FAILURE;
        }

        $issued = $devices->issueCode($user, null, 'console');

        $this->components->info("Registration code for {$user->email}: {$issued['code']}");
        $this->components->bulletList([
            'Valid until '.$issued['expires_at']->toDayDateTimeString().' (server time), once.',
            'They enter it on the sign-in screen of the device they will use. Any earlier device stops working.',
            'Any earlier unused code for them no longer works.',
        ]);

        return self::SUCCESS;
    }
}
