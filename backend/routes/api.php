<?php

use App\Http\Controllers\Api\Internal\EufyEventController;
use App\Http\Controllers\Api\V1\Audit\AuditLogController;
use App\Http\Controllers\Api\V1\Auth\AcceptInvitationController;
use App\Http\Controllers\Api\V1\Auth\ConfirmIdentityController;
use App\Http\Controllers\Api\V1\Auth\CurrentUserController;
use App\Http\Controllers\Api\V1\Auth\MfaChallengeController;
use App\Http\Controllers\Api\V1\Auth\MfaController;
use App\Http\Controllers\Api\V1\Auth\OwnDeviceController;
use App\Http\Controllers\Api\V1\Auth\OwnSessionController;
use App\Http\Controllers\Api\V1\Auth\PasswordController;
use App\Http\Controllers\Api\V1\Auth\PasswordResetController;
use App\Http\Controllers\Api\V1\Auth\SessionController;
use App\Http\Controllers\Api\V1\Location\LocationMapController;
use App\Http\Controllers\Api\V1\Location\LocationRequestController;
use App\Http\Controllers\Api\V1\Location\LockRequestLocationController;
use App\Http\Controllers\Api\V1\Location\OwnLocationController;
use App\Http\Controllers\Api\V1\Locks\ActivityController;
use App\Http\Controllers\Api\V1\Locks\LockAccessController;
use App\Http\Controllers\Api\V1\Locks\LockCommandController;
use App\Http\Controllers\Api\V1\Locks\LockController;
use App\Http\Controllers\Api\V1\Locks\PropertyController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\NotificationPreferenceController;
use App\Http\Controllers\Api\V1\Security\SecurityAlertController;
use App\Http\Controllers\Api\V1\Security\SecurityIncidentController;
use App\Http\Controllers\Api\V1\System\DashboardController;
use App\Http\Controllers\Api\V1\System\EmailSettingsController;
use App\Http\Controllers\Api\V1\System\NotificationSettingsController;
use App\Http\Controllers\Api\V1\System\SecurityPolicyController;
use App\Http\Controllers\Api\V1\System\SystemHealthController;
use App\Http\Controllers\Api\V1\Users\InvitationController;
use App\Http\Controllers\Api\V1\Users\PermissionPreviewController;
use App\Http\Controllers\Api\V1\Users\RoleController;
use App\Http\Controllers\Api\V1\Users\UserController;
use App\Http\Controllers\Api\V1\Users\UserDeviceController;
use App\Http\Controllers\Api\V1\Users\UserMfaController;
use App\Http\Controllers\Api\V1\Users\UserPermissionController;
use App\Http\Controllers\Api\V1\Users\UserRoleController;
use App\Http\Controllers\Api\V1\Users\UserSecurityHistoryController;
use App\Http\Controllers\Api\V1\Users\UserStatusController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->name('api.v1.')->group(function (): void {
    Route::post('auth/login', [SessionController::class, 'store'])->name('auth.login');
    Route::post('auth/mfa/verify', MfaChallengeController::class)->name('auth.mfa.verify');

    // Forgotten password, signed out: an emailed one-time link, then a new password.
    Route::post('auth/password/forgot', [PasswordResetController::class, 'request'])->middleware('throttle:password-reset-request')->name('auth.password.forgot');
    Route::post('auth/password/reset', [PasswordResetController::class, 'reset'])->middleware('throttle:10,1')->name('auth.password.reset');

    // Accepting an invitation, signed out: the link's token is the credential. Creating the account,
    // the training lessons, the quiz, then registering the device (which needs the password and signs in).
    Route::prefix('invitations/accept/{token}')->where(['token' => '[A-Za-z0-9]{64}'])->name('invitations.accept.')->middleware('throttle:60,1')->group(function (): void {
        Route::get('/', [AcceptInvitationController::class, 'show'])->name('show');
        Route::post('account', [AcceptInvitationController::class, 'account'])->name('account');
        Route::post('lessons/{lesson}', [AcceptInvitationController::class, 'lesson'])->where('lesson', '[a-z-]{1,32}')->name('lesson');
        Route::get('quiz', [AcceptInvitationController::class, 'quiz'])->name('quiz');
        Route::post('quiz', [AcceptInvitationController::class, 'answer'])->name('quiz.answer');
        Route::post('device', [AcceptInvitationController::class, 'device'])->name('device');
    });

    Route::middleware(['auth:sanctum', 'active', 'device', 'password-changed', 'mfa-enrolled'])->group(function (): void {
        Route::post('auth/logout', [SessionController::class, 'destroy'])->name('auth.logout');
        Route::get('auth/me', CurrentUserController::class)->name('auth.me');
        Route::post('auth/confirm', ConfirmIdentityController::class)->name('auth.confirm');
        // Change your own password with the current one (also how an administrator-chosen one is replaced).
        Route::put('auth/password', [PasswordController::class, 'update'])->middleware('throttle:10,1')->name('auth.password.update');

        // The user's own sign-ins. Signing out the others protects the account, so it needs no step-up.
        Route::get('auth/sessions', [OwnSessionController::class, 'index'])->name('auth.sessions.index');
        Route::delete('auth/sessions/others', [OwnSessionController::class, 'destroyOthers'])->middleware('throttle:6,1')->name('auth.sessions.destroy-others');

        // The user's own devices. Renaming and revoking protect the account and need no step-up;
        // trusting the device in hand raises its standing, so it does.
        Route::get('auth/devices', [OwnDeviceController::class, 'index'])->name('auth.devices.index');
        Route::post('auth/devices/current/trust', [OwnDeviceController::class, 'trustCurrent'])->middleware('step-up')->name('auth.devices.trust-current');
        Route::patch('auth/devices/{device}', [OwnDeviceController::class, 'update'])->whereUuid('device')->name('auth.devices.update');
        Route::post('auth/devices/{device}/revoke', [OwnDeviceController::class, 'revoke'])->whereUuid('device')->middleware('throttle:12,1')->name('auth.devices.revoke');

        // Dashboard and health. Read-only; each section is filtered by the caller's permissions.
        Route::get('dashboard', DashboardController::class)->name('dashboard');
        Route::get('system/health', SystemHealthController::class)->name('system.health');

        // Audit trail: read-only, for security administrators and auditors. Exporting is audited.
        Route::get('audit-logs', [AuditLogController::class, 'index'])->name('audit-logs.index');
        Route::get('audit-logs/export', [AuditLogController::class, 'export'])->middleware('throttle:6,1')->name('audit-logs.export');
        Route::get('audit-logs/{eventId}', [AuditLogController::class, 'show'])->whereUuid('eventId')->name('audit-logs.show');

        // The caller's own in-app notifications.
        Route::get('notifications', [NotificationController::class, 'index'])->name('notifications.index');
        Route::get('notifications/summary', [NotificationController::class, 'summary'])->name('notifications.summary');
        Route::post('notifications/read-all', [NotificationController::class, 'markAllRead'])->name('notifications.read-all');
        // The caller's own notification preferences, within the administrator's limits.
        Route::get('notifications/preferences', [NotificationPreferenceController::class, 'show'])->name('notifications.preferences.show');
        Route::put('notifications/preferences', [NotificationPreferenceController::class, 'update'])->name('notifications.preferences.update');
        Route::post('notifications/{notification}/read', [NotificationController::class, 'markRead'])->whereUuid('notification')->name('notifications.read');

        // Security Center: alerts and incidents. Viewing needs admin.incidents_view; acting needs
        // admin.incidents_manage. No step-up, so an administrator can respond at once.
        Route::get('security/alerts', [SecurityAlertController::class, 'index'])->name('security.alerts.index');
        Route::get('security/alerts/{alert}', [SecurityAlertController::class, 'show'])->whereUuid('alert')->name('security.alerts.show');
        Route::post('security/alerts/{alert}/acknowledge', [SecurityAlertController::class, 'acknowledge'])->whereUuid('alert')->name('security.alerts.acknowledge');
        Route::post('security/alerts/{alert}/resolve', [SecurityAlertController::class, 'resolve'])->whereUuid('alert')->name('security.alerts.resolve');
        Route::get('security/incidents', [SecurityIncidentController::class, 'index'])->name('security.incidents.index');
        Route::post('security/incidents', [SecurityIncidentController::class, 'store'])->name('security.incidents.store');
        Route::get('security/incidents/{incident}', [SecurityIncidentController::class, 'show'])->whereUuid('incident')->name('security.incidents.show');
        Route::post('security/incidents/{incident}/status', [SecurityIncidentController::class, 'updateStatus'])->whereUuid('incident')->name('security.incidents.status');

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

        // Everyone's devices. Revoking is not behind step-up, like suspension, so a lost phone can be cut off at once.
        Route::get('devices', [UserDeviceController::class, 'index'])->name('devices.index');
        Route::get('users/{user}/devices', [UserDeviceController::class, 'forUser'])->name('users.devices.index');
        Route::patch('devices/{device}', [UserDeviceController::class, 'update'])->whereUuid('device')->name('devices.update');
        Route::post('devices/{device}/revoke', [UserDeviceController::class, 'revoke'])->whereUuid('device')->name('devices.revoke');
        Route::post('devices/{device}/trust', [UserDeviceController::class, 'trust'])->whereUuid('device')->middleware('step-up')->name('devices.trust');
        // A one-time code that registers the one device a bound account works on.
        Route::post('users/{user}/device-codes', [UserDeviceController::class, 'createRegistrationCode'])->middleware(['step-up', 'throttle:12,1'])->name('users.device-codes.store');

        // Invitations: an email with a link to create an account, take the training and register a device.
        Route::get('invitations', [InvitationController::class, 'index'])->name('invitations.index');
        Route::middleware(['step-up', 'throttle:20,1'])->group(function (): void {
            Route::post('invitations', [InvitationController::class, 'store'])->name('invitations.store');
            Route::post('invitations/{invitation}/resend', [InvitationController::class, 'resend'])->whereUuid('invitation')->name('invitations.resend');
        });
        Route::post('invitations/{invitation}/cancel', [InvitationController::class, 'cancel'])->whereUuid('invitation')->name('invitations.cancel');

        // Email settings: how LockGuard sends invitations. Saving needs step-up (it holds a password).
        Route::get('settings/email', [EmailSettingsController::class, 'show'])->name('settings.email.show');
        Route::put('settings/email', [EmailSettingsController::class, 'update'])->middleware('step-up')->name('settings.email.update');
        // Notification settings: the limits for everyone's preferences, and recent alert email deliveries.
        Route::get('settings/notifications', [NotificationSettingsController::class, 'show'])->name('settings.notifications.show');
        Route::put('settings/notifications', [NotificationSettingsController::class, 'update'])->middleware('step-up')->name('settings.notifications.update');
        // Security policy: which roles must use two-step sign-in (admin.security_policies).
        Route::get('settings/security', [SecurityPolicyController::class, 'show'])->name('settings.security.show');
        Route::put('settings/security', [SecurityPolicyController::class, 'update'])->middleware('step-up')->name('settings.security.update');
        Route::post('settings/email/test', [EmailSettingsController::class, 'test'])->middleware('throttle:6,1')->name('settings.email.test');

        // Suspension is deliberately not behind step-up so an administrator can cut off access at once.
        Route::post('users/{user}/suspend', [UserStatusController::class, 'suspend'])->name('users.suspend');

        Route::middleware('step-up')->group(function (): void {
            Route::post('users', [UserController::class, 'store'])->name('users.store');
            Route::patch('users/{user}', [UserController::class, 'update'])->name('users.update');
            Route::post('users/{user}/reactivate', [UserStatusController::class, 'reactivate'])->name('users.reactivate');
            Route::post('users/{user}/revoke', [UserStatusController::class, 'revoke'])->name('users.revoke');
            Route::post('users/{user}/sessions/revoke', [UserStatusController::class, 'revokeSessions'])->name('users.sessions.revoke');
            // For someone who lost their phone and recovery codes (admin.security_policies).
            Route::post('users/{user}/mfa/reset', [UserMfaController::class, 'reset'])->name('users.mfa.reset');
            Route::put('users/{user}/roles', [UserRoleController::class, 'update'])->name('users.roles.update');
            Route::put('users/{user}/permissions', [UserPermissionController::class, 'update'])->name('users.permissions.update');
        });

        // Locks. Every lock/unlock goes through LockCommandService; step-up for unlock is a policy check there.
        Route::get('locks', [LockController::class, 'index'])->name('locks.index');
        Route::get('locks/{lock}', [LockController::class, 'show'])->name('locks.show');
        Route::get('locks/{lock}/history', [LockController::class, 'history'])->name('locks.history');
        Route::get('activity', ActivityController::class)->name('activity');
        Route::post('locks/{lock}/commands', [LockCommandController::class, 'store'])->middleware('throttle:lock-commands')->name('locks.commands.store');
        Route::get('lock-requests/{accessRequest}', [LockCommandController::class, 'show'])->name('lock-requests.show');
        Route::get('properties', [PropertyController::class, 'index'])->name('properties.index');

        // Location. Users agree at sign-in; phones send their position with lock requests and answer
        // administrators' location requests while LockGuard is open. Map and requests need location.view_history.
        Route::post('lock-requests/{accessRequest}/location', [LockRequestLocationController::class, 'store'])->middleware('throttle:30,1')->name('lock-requests.location.store');
        Route::get('location/mine', OwnLocationController::class)->name('location.mine');
        Route::get('location/map', LocationMapController::class)->name('location.map');
        Route::get('location/requests/pending', [LocationRequestController::class, 'pending'])->name('location.requests.pending');
        Route::get('location/requests/{locationRequest}', [LocationRequestController::class, 'show'])->whereUuid('locationRequest')->name('location.requests.show');
        Route::post('location/requests/{locationRequest}/respond', [LocationRequestController::class, 'respond'])->whereUuid('locationRequest')->middleware('throttle:30,1')->name('location.requests.respond');
        Route::post('location/requests', [LocationRequestController::class, 'store'])->middleware(['step-up', 'throttle:20,1'])->name('location.requests.store');

        Route::middleware('step-up')->group(function (): void {
            Route::post('properties', [PropertyController::class, 'store'])->name('properties.store');
            Route::post('locks', [LockController::class, 'store'])->name('locks.store');
            Route::patch('locks/{lock}', [LockController::class, 'update'])->name('locks.update');
            Route::put('locks/{lock}/access/{user}', [LockAccessController::class, 'update'])->name('locks.access.update');
            Route::delete('locks/{lock}/access/{user}', [LockAccessController::class, 'destroy'])->name('locks.access.destroy');
        });
    });
});

// Internal: lock events pushed by the Eufy bridge. Signed with the shared secret, no user session.
Route::post('internal/eufy/events', EufyEventController::class)
    ->middleware(['bridge.signature', 'throttle:240,1'])
    ->name('api.internal.eufy.events');
