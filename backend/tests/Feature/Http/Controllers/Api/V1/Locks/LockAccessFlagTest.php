<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Locks;

use App\Enums\RoleTemplate;
use App\Models\Lock;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * LockResource.your_access: whether the signed-in user's own grant lets them command the lock now.
 */
class LockAccessFlagTest extends TestCase
{
    use RefreshDatabase;

    private Lock $lock;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
        $this->lock = Lock::factory()->create(['name' => 'Front Door']);
    }

    private function userWithRole(RoleTemplate $template): User
    {
        $user = User::factory()->create();
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    public function test_a_resident_with_a_current_grant_has_access(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $resident->locks()->attach($this->lock->id);

        $this->actingAs($resident)->getJson(route('api.v1.locks.index'))
            ->assertOk()
            ->assertJsonPath('data.0.your_access', ['granted' => true, 'reason' => null]);
    }

    public function test_a_resident_gets_the_real_lock_ids_when_grant_ids_differ(): void
    {
        $backDoor = Lock::factory()->create(['name' => 'Back Door']);
        $other = $this->userWithRole(RoleTemplate::Resident);
        $other->locks()->attach([$this->lock->id, $backDoor->id]);
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $resident->locks()->attach([$this->lock->id, $backDoor->id]);

        $locks = $this->actingAs($resident)->getJson(route('api.v1.locks.index'))->assertOk()->json('data');

        $this->assertSame([$backDoor->id, $this->lock->id], array_column($locks, 'id'));
        $this->assertSame([true, true], array_column(array_column($locks, 'your_access'), 'granted'));
    }

    public function test_an_administrator_who_sees_every_lock_but_has_no_grant_is_told_why(): void
    {
        $this->actingAs($this->userWithRole(RoleTemplate::SuperAdministrator))->getJson(route('api.v1.locks.index'))
            ->assertOk()
            ->assertJsonPath('data.0.your_access.granted', false)
            ->assertJsonPath('data.0.your_access.reason', 'You have not been given access to this lock.');
    }

    public function test_a_grant_outside_its_window_is_not_access(): void
    {
        $resident = $this->userWithRole(RoleTemplate::Resident);
        $resident->locks()->attach($this->lock->id, ['valid_until' => now()->subDay()]);

        $this->actingAs($resident)->getJson(route('api.v1.locks.show', $this->lock))
            ->assertOk()
            ->assertJsonPath('data.your_access.granted', false)
            ->assertJsonPath('data.your_access.reason', 'Your access to this lock has ended.');
    }
}
