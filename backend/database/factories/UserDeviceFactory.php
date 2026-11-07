<?php

namespace Database\Factories;

use App\Enums\DeviceStatus;
use App\Models\User;
use App\Models\UserDevice;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<UserDevice>
 */
class UserDeviceFactory extends Factory
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
            'user_id' => User::factory(),
            'token_hash' => hash('sha256', Str::random(40)),
            'name' => 'Chrome on Android',
            'status' => DeviceStatus::Recognized,
            'user_agent' => 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
            'first_seen_at' => now(),
            'last_seen_at' => now(),
        ];
    }

    /**
     * A device recognized by the given cookie token.
     */
    public function withToken(string $token): static
    {
        return $this->state(['token_hash' => hash('sha256', $token)]);
    }

    public function trusted(): static
    {
        return $this->state(['status' => DeviceStatus::Trusted, 'trusted_at' => now()]);
    }

    public function revoked(): static
    {
        return $this->state(['status' => DeviceStatus::Revoked, 'revoked_at' => now(), 'revoke_reason' => 'No longer used.']);
    }
}
