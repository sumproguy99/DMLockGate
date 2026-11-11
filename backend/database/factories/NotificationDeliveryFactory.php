<?php

namespace Database\Factories;

use App\Models\NotificationDelivery;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<NotificationDelivery>
 */
class NotificationDeliveryFactory extends Factory
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
            'channel' => NotificationDelivery::CHANNEL_EMAIL,
            'recipient' => fake()->safeEmail(),
            'severity' => 'medium',
            'title' => 'Front Door: battery 20%',
            'description' => 'Replace or charge the lock battery soon.',
            'link' => 'https://lockguard.example.test/notifications',
            'mandatory' => false,
            'status' => NotificationDelivery::STATUS_QUEUED,
            'attempts' => 0,
        ];
    }
}
