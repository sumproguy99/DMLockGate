<?php

namespace App\Http\Requests\Location;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * A position from the browser's Geolocation API. Client-reported, so it is only checked for sense:
 * coordinates on the globe, a plausible accuracy, and a capture time close to now (project.md 11).
 */
abstract class LocationFixRequest extends FormRequest
{
    /** Accuracy worse than this (in meters) is not a position anyone could use. */
    public const MAX_ACCURACY_METERS = 10000;

    /**
     * @return array<string, array<int, string>>
     */
    protected function fixRules(string $presence = 'required'): array
    {
        return [
            'latitude' => [$presence, 'numeric', 'between:-90,90'],
            'longitude' => [$presence, 'numeric', 'between:-180,180'],
            'accuracy' => [$presence, 'numeric', 'gt:0', 'max:'.self::MAX_ACCURACY_METERS],
            'captured_at' => [$presence, 'date'],
        ];
    }

    /**
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $capturedAt = $this->input('captured_at');
                if ($validator->errors()->has('captured_at') || ! is_string($capturedAt)) {
                    return;
                }

                $maxAge = (int) config('lockguard.location.max_fix_age_seconds');
                $at = CarbonImmutable::parse($capturedAt);
                if ($at->lt(now()->subSeconds($maxAge)) || $at->gt(now()->addSeconds(30))) {
                    $validator->errors()->add('captured_at', 'The position is too old or its time is wrong.');
                }
            },
        ];
    }

    /**
     * @return array{latitude: float, longitude: float, accuracy: float, captured_at: CarbonImmutable}
     */
    public function fix(): array
    {
        return [
            'latitude' => (float) $this->validated('latitude'),
            'longitude' => (float) $this->validated('longitude'),
            'accuracy' => (float) $this->validated('accuracy'),
            'captured_at' => CarbonImmutable::parse($this->validated('captured_at'))->utc(),
        ];
    }
}
