<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Append-only observations of a lock's physical state as reported by the integration.
     */
    public function up(): void
    {
        Schema::create('lock_state_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lock_id')->constrained()->cascadeOnDelete();
            $table->string('state', 16);
            $table->string('source', 16);
            $table->timestamp('observed_at', 3);
            $table->timestamp('received_at', 3);
            $table->unsignedTinyInteger('battery_level')->nullable();
            $table->string('external_event_id', 128)->nullable();
            $table->string('external_actor', 120)->nullable();
            $table->json('raw')->nullable();

            $table->index(['lock_id', 'observed_at']);
            $table->unique(['lock_id', 'external_event_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('lock_state_events');
    }
};
