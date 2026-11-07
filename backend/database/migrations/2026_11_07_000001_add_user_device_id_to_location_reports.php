<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * The device a location came from, for the device locations page. Earlier lock-request
     * locations take the device their lock request was sent from; earlier shared locations stay
     * without one.
     */
    public function up(): void
    {
        Schema::table('location_reports', function (Blueprint $table) {
            $table->foreignId('user_device_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
        });

        DB::table('location_reports')
            ->whereNull('user_device_id')
            ->whereNotNull('access_request_id')
            ->update([
                'user_device_id' => DB::table('access_requests')
                    ->select('user_device_id')
                    ->whereColumn('access_requests.id', 'location_reports.access_request_id')
                    ->limit(1),
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('location_reports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_device_id');
        });
    }
};
