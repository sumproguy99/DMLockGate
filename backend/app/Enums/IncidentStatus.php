<?php

namespace App\Enums;

/**
 * The incident lifecycle (project.md section 18). Any status may follow any other except that a
 * closed incident is final; a new problem after closing opens a new incident.
 */
enum IncidentStatus: string
{
    case New = 'new';
    case Acknowledged = 'acknowledged';
    case Investigating = 'investigating';
    case Contained = 'contained';
    case Resolved = 'resolved';
    case Closed = 'closed';

    /**
     * Statuses in which new related alerts join the incident.
     *
     * @return list<self>
     */
    public static function active(): array
    {
        return [self::New, self::Acknowledged, self::Investigating, self::Contained];
    }

    public function isActive(): bool
    {
        return in_array($this, self::active(), true);
    }
}
