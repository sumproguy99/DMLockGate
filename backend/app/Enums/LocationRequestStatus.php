<?php

namespace App\Enums;

/**
 * An administrator's request for a user's location.
 *
 * PENDING → FULFILLED (the phone sent a location) | UNAVAILABLE (the phone answered without one,
 * for example permission denied) | EXPIRED (no answer in time, usually because LockGuard was not open).
 */
enum LocationRequestStatus: string
{
    case Pending = 'pending';
    case Fulfilled = 'fulfilled';
    case Unavailable = 'unavailable';
    case Expired = 'expired';
}
