<?php

namespace App\Enums;

enum LockAction: string
{
    case Lock = 'lock';
    case Unlock = 'unlock';

    /**
     * The state the lock must report for the command to count as confirmed.
     */
    public function expectedState(): ReportedLockState
    {
        return match ($this) {
            self::Lock => ReportedLockState::Locked,
            self::Unlock => ReportedLockState::Unlocked,
        };
    }

    public function label(): string
    {
        return match ($this) {
            self::Lock => 'Lock',
            self::Unlock => 'Unlock',
        };
    }
}
