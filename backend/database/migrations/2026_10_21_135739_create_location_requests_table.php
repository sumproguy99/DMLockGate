<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * An administrator asking for a user's current location. The user's phone answers it only while
     * LockGuard is open there; otherwise the request expires. The location itself is a location_reports row.
     */
    public function up(): void
    {
        Schema::create('location_requests', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('target_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('status', 16)->index();
            $table->string('failure_reason', 32)->nullable();
            $table->timestamp('requested_at', 3);
            $table->timestamp('expires_at', 3);
            $table->timestamp('completed_at', 3)->nullable();
            $table->timestamps();

            $table->index(['target_user_id', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('location_requests');
    }
};
