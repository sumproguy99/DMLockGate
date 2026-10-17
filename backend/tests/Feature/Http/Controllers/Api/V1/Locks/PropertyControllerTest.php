<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Locks;

use App\Enums\RoleTemplate;
use App\Models\Lock;
use App\Models\Property;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Listing properties is a read for integration administrators and needs no fresh identity check;
 * creating one still does.
 */
class PropertyControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
    }

    private function userWithRole(RoleTemplate $template): User
    {
        $user = User::factory()->create();
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));

        return $user;
    }

    public function test_integration_administrators_list_properties_with_lock_counts(): void
    {
        $home = Property::factory()->create(['name' => 'Home']);
        Lock::factory()->count(2)->for($home)->create();

        $this->actingAs($this->userWithRole(RoleTemplate::SuperAdministrator))
            ->getJson(route('api.v1.properties.index'))
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Home')
            ->assertJsonPath('data.0.locks_count', 2);
    }

    public function test_other_users_cannot_list_properties(): void
    {
        $this->actingAs($this->userWithRole(RoleTemplate::PropertyManager))
            ->getJson(route('api.v1.properties.index'))
            ->assertForbidden();
    }

    public function test_creating_a_property_still_requires_step_up(): void
    {
        $this->actingAs($this->userWithRole(RoleTemplate::SuperAdministrator))
            ->postJson(route('api.v1.properties.store'), ['name' => 'Cabin'])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'step_up_required');
    }
}
