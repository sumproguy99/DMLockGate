<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * `checks` holds every policy check evaluated, in order, with its result, so any decision can be explained.
     */
    public function up(): void
    {
        Schema::create('authorization_decisions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('access_request_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('decision', 8);
            $table->string('reason_code', 64);
            $table->string('reason', 255);
            $table->json('checks');
            $table->timestamp('decided_at', 3);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('authorization_decisions');
    }
};
