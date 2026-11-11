<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Each person's notification preferences (per category: in the app, by email), and a record of
     * every alert email: who it went to, whether it was sent, how many tries it took and why it failed.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('notification_preferences')->nullable()->after('mfa_confirmed_at');
        });

        Schema::create('notification_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('security_alert_id')->nullable()->constrained()->nullOnDelete();
            $table->uuid('notification_id')->nullable()->index();
            $table->string('channel', 16);
            $table->string('recipient');
            $table->string('severity', 16);
            $table->string('title', 160);
            $table->text('description');
            $table->string('link', 500);
            $table->boolean('mandatory')->default(false);
            $table->string('status', 16)->index();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->string('mailer', 32)->nullable();
            $table->string('last_error', 500)->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->index(['created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('notification_deliveries');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('notification_preferences');
        });
    }
};
