<?php

use App\Http\Controllers\Api\V1\Auth\ConfirmIdentityController;
use App\Http\Controllers\Api\V1\Auth\CurrentUserController;
use App\Http\Controllers\Api\V1\Auth\MfaChallengeController;
use App\Http\Controllers\Api\V1\Auth\MfaController;
use App\Http\Controllers\Api\V1\Auth\SessionController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->name('api.v1.')->group(function (): void {
    Route::post('auth/login', [SessionController::class, 'store'])->name('auth.login');
    Route::post('auth/mfa/verify', MfaChallengeController::class)->name('auth.mfa.verify');

    Route::middleware(['auth:sanctum', 'active'])->group(function (): void {
        Route::post('auth/logout', [SessionController::class, 'destroy'])->name('auth.logout');
        Route::get('auth/me', CurrentUserController::class)->name('auth.me');
        Route::post('auth/confirm', ConfirmIdentityController::class)->name('auth.confirm');

        Route::middleware('step-up')->group(function (): void {
            Route::post('auth/mfa', [MfaController::class, 'store'])->name('auth.mfa.store');
            Route::post('auth/mfa/confirm', [MfaController::class, 'confirm'])->name('auth.mfa.confirm');
            Route::delete('auth/mfa', [MfaController::class, 'destroy'])->name('auth.mfa.destroy');
        });
    });
});
