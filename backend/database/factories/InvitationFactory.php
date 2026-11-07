<?php

namespace Database\Factories;

use App\Models\Invitation;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Invitation>
 */
class InvitationFactory extends Factory
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
            'token_hash' => hash('sha256', Str::random(64)),
            'email' => fake()->unique()->safeEmail(),
            'name' => fake()->name(),
            'roles' => ['resident'],
            'code_hash' => hash('sha256', Str::upper(Str::random(8))),
            'expires_at' => now()->addDays(7),
        ];
    }
}
