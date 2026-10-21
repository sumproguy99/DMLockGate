<?php

namespace Database\Factories;

use App\Models\LocationReport;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<LocationReport>
 */
class LocationReportFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'purpose' => LocationReport::PURPOSE_LOCK_REQUEST,
            'latitude' => fake()->latitude(),
            'longitude' => fake()->longitude(),
            'accuracy_meters' => fake()->numberBetween(5, 60),
            'source' => LocationReport::SOURCE_BROWSER,
            'captured_at' => now(),
            'received_at' => now(),
        ];
    }
}
