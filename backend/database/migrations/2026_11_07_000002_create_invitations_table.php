<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Invitations: an administrator invites someone by email. The link's token and the device
     * registration code the invitation holds are stored only as SHA-256 hashes. The person creates
     * their account, completes the training and its quiz, and only then registers their device with
     * the held code. device_registration_codes.invitation_id marks codes that came from one.
     */
    public function up(): void
    {
        Schema::create('invitations', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->char('token_hash', 64)->unique();
            $table->string('email');
            $table->string('name')->nullable();
            $table->json('roles');
            $table->text('message')->nullable();
            $table->foreignId('invited_by')->nullable()->constrained('users')->nullOnDelete();
            $table->char('code_hash', 64);
            $table->timestamp('expires_at', 3);
            $table->timestamp('sent_at', 3)->nullable();
            $table->unsignedInteger('send_count')->default(0);
            $table->string('last_send_error', 500)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('accepted_at', 3)->nullable();
            $table->json('lessons_completed')->nullable();
            $table->json('quiz_question_ids')->nullable();
            $table->unsignedInteger('quiz_attempts')->default(0);
            $table->timestamp('training_completed_at', 3)->nullable();
            $table->timestamp('device_registered_at', 3)->nullable();
            $table->timestamp('cancelled_at', 3)->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('email');
        });

        Schema::table('device_registration_codes', function (Blueprint $table) {
            $table->foreignId('invitation_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('device_registration_codes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('invitation_id');
        });

        Schema::dropIfExists('invitations');
    }
};
