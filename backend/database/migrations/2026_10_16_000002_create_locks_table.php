<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * The last_* columns cache the most recent OBSERVATION reported by the lock, never an inference
     * from a command. The full history is in lock_state_events.
     */
    public function up(): void
    {
        Schema::create('locks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained()->restrictOnDelete();
            $table->string('name', 120);
            $table->string('vendor', 32)->default('eufy');
            $table->string('model', 64)->nullable();
            $table->string('external_id', 128)->nullable();
            $table->string('firmware_version', 64)->nullable();
            $table->string('registration_status', 16)->default('active')->index();
            $table->boolean('commands_enabled')->default(false);
            $table->string('connection_status', 16)->default('unknown');
            $table->string('last_reported_state', 16)->default('unknown');
            $table->timestamp('last_state_observed_at', 3)->nullable();
            $table->string('last_state_source', 16)->nullable();
            $table->unsignedTinyInteger('battery_level')->nullable();
            $table->timestamp('battery_observed_at', 3)->nullable();
            $table->timestamp('last_communication_at', 3)->nullable();
            $table->string('last_error', 255)->nullable();
            $table->timestamp('last_error_at', 3)->nullable();
            $table->timestamps();

            $table->unique(['vendor', 'external_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('locks');
    }
};
