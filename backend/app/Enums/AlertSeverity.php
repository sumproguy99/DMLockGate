<?php

namespace App\Enums;

/**
 * How serious a security alert or incident is (project.md section 18).
 */
enum AlertSeverity: string
{
    case Info = 'info';
    case Low = 'low';
    case Medium = 'medium';
    case High = 'high';
    case Critical = 'critical';

    public function rank(): int
    {
        return match ($this) {
            self::Info => 0,
            self::Low => 1,
            self::Medium => 2,
            self::High => 3,
            self::Critical => 4,
        };
    }

    public function atLeast(self $other): bool
    {
        return $this->rank() >= $other->rank();
    }

    public static function max(self $a, self $b): self
    {
        return $a->rank() >= $b->rank() ? $a : $b;
    }

    /**
     * Severities at or above this one, for "at least" filters.
     *
     * @return list<string>
     */
    public function andAbove(): array
    {
        return array_values(array_map(
            fn (self $severity): string => $severity->value,
            array_filter(self::cases(), fn (self $severity): bool => $severity->atLeast($this)),
        ));
    }
}
