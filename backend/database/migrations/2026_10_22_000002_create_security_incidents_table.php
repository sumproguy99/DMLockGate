<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Security incidents and the history of their status changes. An incident groups related alerts
     * (security_alerts.incident_id); opened_by is null when the alert engine opened it.
     */
    public function up(): void
    {
        Schema::create('security_incidents', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->string('title', 160);
            $table->text('description')->nullable();
            $table->string('severity', 16)->index();
            $table->string('status', 16)->index();
            $table->string('subject_key', 64)->nullable()->index();
            $table->foreignId('opened_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('opened_at', 3);
            $table->timestamp('resolved_at', 3)->nullable();
            $table->timestamp('closed_at', 3)->nullable();
            $table->timestamps();
        });

        Schema::create('security_incident_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('security_incident_id')->constrained()->cascadeOnDelete();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('from_status', 16)->nullable();
            $table->string('to_status', 16)->nullable();
            $table->text('note')->nullable();
            $table->timestamp('occurred_at', 3);

            $table->index(['security_incident_id', 'occurred_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('security_incident_events');
        Schema::dropIfExists('security_incidents');
    }
};
