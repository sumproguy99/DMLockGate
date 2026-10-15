<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username', 64)->nullable()->unique()->after('name');
            $table->string('status', 16)->default('active')->index()->after('password');
            $table->timestamp('status_changed_at')->nullable()->after('status');
            $table->timestamp('account_expires_at')->nullable()->after('status_changed_at');
            $table->text('mfa_secret')->nullable()->after('account_expires_at');
            $table->text('mfa_recovery_codes')->nullable()->after('mfa_secret');
            $table->timestamp('mfa_confirmed_at')->nullable()->after('mfa_recovery_codes');
            $table->timestamp('last_login_at')->nullable()->after('mfa_confirmed_at');
            $table->timestamp('last_access_event_at')->nullable()->after('last_login_at');
            $table->text('admin_notes')->nullable()->after('last_access_event_at');
        });
    }

    /**
     * Reverse the migrations.
     *
     * Destructive: drops identity, status and MFA data for every user.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['username']);
            $table->dropIndex(['status']);
            $table->dropColumn([
                'username', 'status', 'status_changed_at', 'account_expires_at',
                'mfa_secret', 'mfa_recovery_codes', 'mfa_confirmed_at',
                'last_login_at', 'last_access_event_at', 'admin_notes',
            ]);
        });
    }
};
