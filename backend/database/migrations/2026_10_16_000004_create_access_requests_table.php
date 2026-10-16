<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * One row per lock/unlock request. `status` is the request lifecycle. The authorization decision,
     * command submission, integration response and confirmation are kept in their own tables/columns.
     */
    public function up(): void
    {
        Schema::create('access_requests', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('lock_id')->constrained()->restrictOnDelete();
            $table->string('action', 16);
            $table->string('channel', 16);
            $table->string('idempotency_key', 64);
            $table->string('status', 24)->index();
            $table->timestamp('requested_at', 3);
            $table->timestamp('expires_at', 3);
            $table->timestamp('completed_at', 3)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'idempotency_key']);
            $table->index(['lock_id', 'requested_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('access_requests');
    }
};
