<?php

namespace App\Services\Locks\Integration;

use App\Enums\ReportedLockState;
use Carbon\CarbonImmutable;

/**
 * One state observation from a lock, as reported by the integration.
 */
final readonly class ReportedState
{
    /**
     * @param  array<string, mixed>  $raw  Vendor payload kept for diagnosis. Must not contain credentials.
     */
    public function __construct(
        public ReportedLockState $state,
        public CarbonImmutable $observedAt,
        public ?int $batteryLevel = null,
        public ?string $externalEventId = null,
        public ?string $externalActor = null,
        public array $raw = [],
    ) {}
}
