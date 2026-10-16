<?php

namespace App\Enums;

/**
 * How a request reached LockGuard. Until location-aware access exists, every app request is
 * treated as remote, because a missing location report is never evidence of being at the door.
 */
enum AccessChannel: string
{
    case Remote = 'remote';
    case Proximity = 'proximity';
}
