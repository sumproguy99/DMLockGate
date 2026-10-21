<?php

namespace App\Http\Requests\Location;

use App\Exceptions\ApiException;
use App\Models\AccessRequest;

/**
 * The phone's position when its user pressed Lock or Unlock, attached to that request.
 */
class StoreLockRequestLocationRequest extends LocationFixRequest
{
    /**
     * Only the person who made the request may attach a location to it, checked before validation.
     */
    public function authorize(): bool
    {
        $accessRequest = $this->route('accessRequest');
        if (! $accessRequest instanceof AccessRequest || $accessRequest->user_id !== $this->user()?->id) {
            throw new ApiException(403, 'forbidden', 'Only the person who made this request can add its location.');
        }

        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return $this->fixRules();
    }
}
