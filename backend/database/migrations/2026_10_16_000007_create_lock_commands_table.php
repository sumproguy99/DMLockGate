<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * The command sent to the integration for an authorized request: its submission, the integration's
     * response (a delivery acknowledgement only, never proof of movement) and the confirmation taken
     * from the lock's own reported state.
     */
    public function up(): void
    {
        Schema::create('lock_commands', function (Blueprint $table) {
            $table->id();
            $table->foreignId('access_request_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('lock_id')->constrained()->restrictOnDelete();
            $table->string('action', 16);
            $table->timestamp('queued_at', 3);
            $table->timestamp('submitted_at', 3)->nullable();
            $table->string('integration_result', 16)->nullable();
            $table->timestamp('integration_responded_at', 3)->nullable();
            $table->unsignedInteger('integration_latency_ms')->nullable();
            $table->string('integration_error', 255)->nullable();
            $table->string('confirmation', 16)->nullable();
            $table->string('confirmation_source', 16)->nullable();
            $table->timestamp('confirmed_at', 3)->nullable();
            $table->foreignId('confirming_state_event_id')->nullable()->constrained('lock_state_events')->nullOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('lock_commands');
    }
};
