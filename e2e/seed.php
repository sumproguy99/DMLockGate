<?php

// Seeds the throwaway end-to-end database: users for each role, a property and two fake locks.
// Run from the backend directory with the E2E environment variables set: php <this file>

use App\Enums\RoleTemplate;
use App\Enums\UserStatus;
use App\Models\Lock;
use App\Models\Property;
use App\Models\Role;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Hash;

require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (! str_ends_with((string) config('database.connections.sqlite.database'), 'e2e.sqlite') || config('database.default') !== 'sqlite') {
    fwrite(STDERR, "Refusing to seed: not the E2E database.\n");
    exit(1);
}

$property = Property::query()->forceCreate(['name' => 'E2E Home', 'address' => null, 'timezone' => 'America/New_York']);
$front = Lock::query()->forceCreate(['property_id' => $property->id, 'name' => 'Front Door', 'vendor' => 'eufy', 'model' => 'T85D0', 'external_id' => 'FAKE0001', 'registration_status' => 'active', 'commands_enabled' => true]);
$back = Lock::query()->forceCreate(['property_id' => $property->id, 'name' => 'Back Door', 'vendor' => 'eufy', 'model' => 'T85D0', 'external_id' => 'FAKE0002', 'registration_status' => 'active', 'commands_enabled' => true]);

$users = [
    ['admin@e2e.test', 'Ada Admin', RoleTemplate::SuperAdministrator, []],
    ['resident@e2e.test', 'Riley Resident', RoleTemplate::Resident, [$front->id, $back->id]],
    ['guest@e2e.test', 'Gale Guest', RoleTemplate::TemporaryGuest, [$front->id]],
    ['auditor@e2e.test', 'Avery Auditor', RoleTemplate::ReadOnlyAuditor, []],
];
foreach ($users as [$email, $name, $role, $lockIds]) {
    $user = User::query()->forceCreate([
        'name' => $name,
        'email' => $email,
        'password' => Hash::make('e2e-password-123'),
        'status' => UserStatus::Active,
    ]);
    $user->roles()->attach(Role::query()->where('key', $role->value)->value('id'));
    $user->locks()->attach($lockIds);
}

echo "Seeded ".count($users)." users and 2 locks.\n";
