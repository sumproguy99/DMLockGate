<?php

namespace Database\Factories;

use App\Enums\LocationRequestStatus;
use App\Models\LocationRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<LocationRequest>
 */
class LocationRequestFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'public_id' => (string) Str::uuid(),
            'requested_by' => User::factory(),
            'target_user_id' => User::factory(),
            'status' => LocationRequestStatus::Pending,
            'requested_at' => now(),
            'expires_at' => now()->addMinutes(2),
        ];
    }
}
