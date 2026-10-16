<?php

use App\Http\Controllers\Api\V1\Auth\ConfirmIdentityController;
use App\Http\Controllers\Api\V1\Auth\CurrentUserController;
use App\Http\Controllers\Api\V1\Auth\MfaChallengeController;
use App\Http\Controllers\Api\V1\Auth\MfaController;
use App\Http\Controllers\Api\V1\Auth\SessionController;
use App\Http\Controllers\Api\V1\Users\PermissionPreviewController;
use App\Http\Controllers\Api\V1\Users\RoleController;
use App\Http\Controllers\Api\V1\Users\UserController;
use App\Http\Controllers\Api\V1\Users\UserPermissionController;
use App\Http\Controllers\Api\V1\Users\UserRoleController;
use App\Http\Controllers\Api\V1\Users\UserSecurityHistoryController;
use App\Http\Controllers\Api\V1\Users\UserStatusController;
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

        // User management. Permission and anti-escalation checks happen in UserManagementGuard.
        Route::get('users', [UserController::class, 'index'])->name('users.index');
        Route::get('users/{user}', [UserController::class, 'show'])->name('users.show');
        Route::get('users/{user}/security-history', UserSecurityHistoryController::class)->name('users.security-history');
        Route::get('roles', [RoleController::class, 'index'])->name('roles.index');
        Route::get('permissions', [RoleController::class, 'permissions'])->name('permissions.index');
        Route::post('permission-preview', PermissionPreviewController::class)->name('permission-preview');

        // Suspension is deliberately not behind step-up so an administrator can cut off access at once.
        Route::post('users/{user}/suspend', [UserStatusController::class, 'suspend'])->name('users.suspend');

        Route::middleware('step-up')->group(function (): void {
            Route::post('users', [UserController::class, 'store'])->name('users.store');
            Route::patch('users/{user}', [UserController::class, 'update'])->name('users.update');
            Route::post('users/{user}/reactivate', [UserStatusController::class, 'reactivate'])->name('users.reactivate');
            Route::post('users/{user}/revoke', [UserStatusController::class, 'revoke'])->name('users.revoke');
            Route::put('users/{user}/roles', [UserRoleController::class, 'update'])->name('users.roles.update');
            Route::put('users/{user}/permissions', [UserPermissionController::class, 'update'])->name('users.permissions.update');
        });
    });
});
