<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Device binding: an account that is bound to a device can only be used on the one browser or
     * phone it registered with a one-time code from an administrator. Only the code's SHA-256 hash
     * is stored. registered_at marks the devices that were registered that way.
     */
    public function up(): void
    {
        Schema::create('device_registration_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->char('code_hash', 64)->unique();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('expires_at', 3);
            $table->timestamp('used_at', 3)->nullable();
            $table->foreignId('user_device_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('cancelled_at', 3)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'used_at']);
        });

        Schema::table('user_devices', function (Blueprint $table) {
            $table->timestamp('registered_at', 3)->nullable()->after('last_seen_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('user_devices', function (Blueprint $table) {
            $table->dropColumn('registered_at');
        });
        Schema::dropIfExists('device_registration_codes');
    }
};
