<?php

namespace Database\Factories;

use App\Enums\AlertSeverity;
use App\Enums\IncidentStatus;
use App\Models\SecurityIncident;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<SecurityIncident>
 */
class SecurityIncidentFactory extends Factory
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
            'title' => 'Repeated failed sign-ins',
            'severity' => AlertSeverity::High,
            'status' => IncidentStatus::New,
            'opened_at' => now(),
        ];
    }
}
