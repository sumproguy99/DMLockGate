<?php

namespace App\Http\Requests\Location;

use App\Exceptions\ApiException;
use App\Models\LocationRequest;
use Illuminate\Validation\Rule;

/**
 * The phone's answer to a location request: its position, or why it has none.
 */
class RespondLocationRequestRequest extends LocationFixRequest
{
    /** Why a phone could not give its position, from the Geolocation API's errors. */
    public const UNAVAILABLE_REASONS = ['permission_denied', 'position_unavailable', 'timeout', 'unsupported'];

    /**
     * Only the person whose location was requested may answer, checked before validation.
     */
    public function authorize(): bool
    {
        $locationRequest = $this->route('locationRequest');
        if (! $locationRequest instanceof LocationRequest || $locationRequest->target_user_id !== $this->user()?->id) {
            throw new ApiException(403, 'forbidden', 'This location request is not addressed to you.');
        }

        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'unavailable' => ['sometimes', Rule::in(self::UNAVAILABLE_REASONS)],
            ...$this->fixRules('required_without:unavailable'),
        ];
    }

    public function isUnavailable(): bool
    {
        return $this->validated('unavailable') !== null;
    }
}
