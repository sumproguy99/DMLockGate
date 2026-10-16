<?php

namespace Database\Factories;

use App\Enums\LockConnectionStatus;
use App\Enums\ReportedLockState;
use App\Models\Lock;
use App\Models\Property;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Lock>
 */
class LockFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'property_id' => Property::factory(),
            'name' => fake()->randomElement(['Front Door', 'Back Door', 'Side Gate']),
            'vendor' => 'eufy',
            'model' => 'T85D0',
            'external_id' => 'T85D0'.fake()->unique()->numerify('##########'),
            'registration_status' => Lock::REGISTRATION_ACTIVE,
            'commands_enabled' => true,
        ];
    }

    /**
     * A lock that recently reported the given state.
     */
    public function reporting(ReportedLockState $state): static
    {
        return $this->state(fn (array $attributes) => [
            'connection_status' => LockConnectionStatus::Connected,
            'last_reported_state' => $state,
            'last_state_observed_at' => now(),
            'last_state_source' => 'poll',
            'last_communication_at' => now(),
        ]);
    }
}
