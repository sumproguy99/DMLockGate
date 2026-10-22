<?php

namespace App\Enums;

/**
 * OPEN → ACKNOWLEDGED (someone is aware) → RESOLVED (by a person, or automatically when the
 * condition clears or a burst goes quiet). A resolved alert that recurs soon after is reopened.
 */
enum AlertStatus: string
{
    case Open = 'open';
    case Acknowledged = 'acknowledged';
    case Resolved = 'resolved';

    /**
     * @return list<self>
     */
    public static function active(): array
    {
        return [self::Open, self::Acknowledged];
    }
}
