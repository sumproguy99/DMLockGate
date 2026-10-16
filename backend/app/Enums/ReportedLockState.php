<?php

namespace App\Enums;

/**
 * A physical state as reported by the lock itself. Never derived from the last command sent.
 */
enum ReportedLockState: string
{
    case Locked = 'locked';
    case Unlocked = 'unlocked';
    case Jammed = 'jammed';
    case Unknown = 'unknown';
}
