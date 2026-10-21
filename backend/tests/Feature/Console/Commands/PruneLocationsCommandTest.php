<?php

namespace Tests\Feature\Console\Commands;

use App\Models\AuditLog;
use App\Models\LocationReport;
use App\Models\LocationRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PruneLocationsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_deletes_location_records_older_than_the_retention_period(): void
    {
        config(['lockguard.location.retention_days' => 30]);
        $kept = LocationReport::factory()->create(['received_at' => now()->subDays(29)]);
        LocationReport::factory()->create(['received_at' => now()->subDays(31)]);
        $recentRequest = LocationRequest::factory()->create(['requested_at' => now()->subDays(29)]);
        LocationRequest::factory()->create(['requested_at' => now()->subDays(31)]);

        $this->artisan('lockguard:prune-locations')->assertSuccessful();

        $this->assertSame([$kept->id], LocationReport::query()->pluck('id')->all());
        $this->assertSame([$recentRequest->id], LocationRequest::query()->pluck('id')->all());
        $this->assertSame(['reports' => 1, 'requests' => 1], AuditLog::query()->where('action', 'location.pruned')->sole()->metadata);
    }

    public function test_records_nothing_when_there_is_nothing_to_delete(): void
    {
        $this->artisan('lockguard:prune-locations')->assertSuccessful();

        $this->assertDatabaseCount('audit_logs', 0);
    }
}
