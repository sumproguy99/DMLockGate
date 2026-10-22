<?php

namespace Database\Factories;

use App\Enums\AlertRule;
use App\Enums\AlertSeverity;
use App\Enums\AlertStatus;
use App\Models\SecurityAlert;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<SecurityAlert>
 */
class SecurityAlertFactory extends Factory
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
            'rule' => AlertRule::DeniedLockRequests,
            'fingerprint' => 'denied_lock_requests:user:'.fake()->unique()->numberBetween(1000, 999999),
            'severity' => AlertSeverity::Medium,
            'status' => AlertStatus::Open,
            'title' => 'Repeated denied lock requests',
            'description' => 'Several lock requests were refused in a short time.',
            'occurrences' => 3,
            'first_seen_at' => now()->subMinutes(5),
            'last_seen_at' => now(),
        ];
    }
}
