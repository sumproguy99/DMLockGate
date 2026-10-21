<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * A location a user's browser reported, kept apart from the operational records (project.md
     * section 20) and deleted after the retention period. `purpose` says why it was collected: with
     * a lock request (access_request_id) or in answer to an administrator (location_request_id).
     */
    public function up(): void
    {
        Schema::create('location_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('purpose', 24);
            $table->foreignId('access_request_id')->nullable()->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('location_request_id')->nullable()->unique()->constrained()->cascadeOnDelete();
            $table->decimal('latitude', 9, 6);
            $table->decimal('longitude', 9, 6);
            $table->float('accuracy_meters');
            $table->string('source', 16);
            $table->timestamp('captured_at', 3);
            $table->timestamp('received_at', 3)->index();
            $table->timestamps();

            $table->index(['user_id', 'received_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('location_reports');
    }
};
