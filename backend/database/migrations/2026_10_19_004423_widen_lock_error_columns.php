<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * The bridge's reason for a failed command (for "not sent", every broker instance's answer) is
     * longer than 255 characters, and cutting it hid which instances refused.
     */
    public function up(): void
    {
        Schema::table('lock_commands', function (Blueprint $table) {
            $table->text('integration_error')->nullable()->change();
        });
        Schema::table('locks', function (Blueprint $table) {
            $table->text('last_error')->nullable()->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('lock_commands', function (Blueprint $table) {
            $table->string('integration_error', 255)->nullable()->change();
        });
        Schema::table('locks', function (Blueprint $table) {
            $table->string('last_error', 255)->nullable()->change();
        });
    }
};
