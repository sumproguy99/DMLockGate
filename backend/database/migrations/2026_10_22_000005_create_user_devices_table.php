<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * The browsers and phones each user signs in from. A browser is recognized by a random token in
     * a long-lived cookie; only its SHA-256 hash is stored. One browser shared by two people is two
     * devices, one per account. Access requests record the device they came from.
     */
    public function up(): void
    {
        Schema::create('user_devices', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->char('token_hash', 64);
            $table->string('name', 80);
            $table->string('status', 16)->index();
            $table->string('user_agent', 255)->nullable();
            $table->string('last_ip_address', 45)->nullable();
            $table->timestamp('first_seen_at', 3);
            $table->timestamp('last_seen_at', 3);
            $table->timestamp('trusted_at', 3)->nullable();
            $table->foreignId('trusted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('revoked_at', 3)->nullable();
            $table->foreignId('revoked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('reported_lost')->default(false);
            $table->string('revoke_reason', 255)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'token_hash']);
        });

        Schema::table('access_requests', function (Blueprint $table) {
            $table->foreignId('user_device_id')->nullable()->after('lock_id')->constrained()->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('access_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_device_id');
        });
        Schema::dropIfExists('user_devices');
    }
};
