<?php

namespace App\Enums;

/**
 * A device's standing on its account. Every browser that signs in is recognized; the user (or an
 * administrator) may then trust it. A revoked device can no longer sign in or make lock requests.
 */
enum DeviceStatus: string
{
    case Recognized = 'recognized';
    case Trusted = 'trusted';
    case Revoked = 'revoked';

    public function label(): string
    {
        return match ($this) {
            self::Recognized => 'Not trusted',
            self::Trusted => 'Trusted',
            self::Revoked => 'Revoked',
        };
    }
}
