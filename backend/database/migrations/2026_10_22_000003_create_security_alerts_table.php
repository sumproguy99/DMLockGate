<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Alerts raised by the alert engine. Repeats of the same problem (same fingerprint) update the
     * open alert instead of adding rows, so a burst of failures is one alert with a count.
     */
    public function up(): void
    {
        Schema::create('security_alerts', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->string('rule', 48)->index();
            $table->string('fingerprint', 128)->index();
            $table->string('severity', 16)->index();
            $table->string('status', 16)->index();
            $table->string('title', 160);
            $table->text('description');
            $table->foreignId('subject_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('subject_lock_id')->nullable()->constrained('locks')->nullOnDelete();
            $table->string('subject_ip', 45)->nullable();
            $table->foreignId('security_incident_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('occurrences')->default(1);
            $table->uuid('last_event_id')->nullable();
            $table->json('context')->nullable();
            $table->timestamp('first_seen_at', 3);
            $table->timestamp('last_seen_at', 3)->index();
            $table->timestamp('notified_at', 3)->nullable();
            $table->foreignId('acknowledged_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('acknowledged_at', 3)->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at', 3)->nullable();
            $table->string('resolution', 16)->nullable();
            $table->text('resolution_note')->nullable();
            $table->timestamps();

            $table->index(['fingerprint', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('security_alerts');
    }
};
