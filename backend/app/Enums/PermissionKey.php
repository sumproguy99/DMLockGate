<?php

namespace App\Enums;

/**
 * The complete permission catalog. This enum is the single source of truth: the permissions
 * table is synchronized from it, and any key not listed here is denied.
 */
enum PermissionKey: string
{
    // Lock control
    case LockViewStatus = 'lock.view_status';
    case LockLock = 'lock.lock';
    case LockUnlock = 'lock.unlock';
    case LockRemoteUnlock = 'lock.remote_unlock';
    case LockProximityUnlock = 'lock.proximity_unlock';
    case LockViewHistory = 'lock.view_history';

    // User management
    case UsersCreate = 'users.create';
    case UsersEdit = 'users.edit';
    case UsersSuspend = 'users.suspend';
    case UsersReactivate = 'users.reactivate';
    case UsersRevoke = 'users.revoke';
    case UsersAssignRoles = 'users.assign_roles';
    case UsersModifyPermissions = 'users.modify_permissions';

    // Access management
    case AccessGrantsCreate = 'access.grants_create';
    case AccessGrantsRevoke = 'access.grants_revoke';
    case AccessSchedulesManage = 'access.schedules_manage';
    case AccessCodesManage = 'access.codes_manage';
    case AccessCodesSync = 'access.codes_sync';

    // Device management
    case DevicesView = 'devices.view';
    case DevicesEnroll = 'devices.enroll';
    case DevicesRename = 'devices.rename';
    case DevicesRevoke = 'devices.revoke';
    case DevicesRevokeSessions = 'devices.revoke_sessions';

    // Location and privacy
    case LocationUse = 'location.use';
    case LocationViewReports = 'location.view_reports';
    case LocationViewHistory = 'location.view_history';
    case LocationManagePolicies = 'location.manage_policies';
    case LocationReviewAudit = 'location.review_audit';

    // Administration
    case AdminIntegrationSettings = 'admin.integration_settings';
    case AdminSecurityPolicies = 'admin.security_policies';
    case AdminNotifications = 'admin.notifications';
    case AdminIncidentsView = 'admin.incidents_view';
    case AdminReportsExport = 'admin.reports_export';
    case AdminAuditRetention = 'admin.audit_retention';

    public function group(): string
    {
        return strstr($this->value, '.', true);
    }

    public function label(): string
    {
        return match ($this) {
            self::LockViewStatus => 'View lock status',
            self::LockLock => 'Request locking',
            self::LockUnlock => 'Request unlocking',
            self::LockRemoteUnlock => 'Request remote unlocking',
            self::LockProximityUnlock => 'Use proximity unlocking',
            self::LockViewHistory => 'View access history',
            self::UsersCreate => 'Create users',
            self::UsersEdit => 'Edit users',
            self::UsersSuspend => 'Suspend users',
            self::UsersReactivate => 'Reactivate users',
            self::UsersRevoke => 'Revoke users',
            self::UsersAssignRoles => 'Assign roles',
            self::UsersModifyPermissions => 'Modify individual permissions',
            self::AccessGrantsCreate => 'Create temporary access grants',
            self::AccessGrantsRevoke => 'Revoke access grants',
            self::AccessSchedulesManage => 'Manage access schedules',
            self::AccessCodesManage => 'Manage access-code metadata',
            self::AccessCodesSync => 'Synchronize physical access codes',
            self::DevicesView => 'View enrolled devices',
            self::DevicesEnroll => 'Enroll devices',
            self::DevicesRename => 'Rename devices',
            self::DevicesRevoke => 'Revoke trusted devices',
            self::DevicesRevokeSessions => 'Revoke user sessions',
            self::LocationUse => 'Use location-dependent access',
            self::LocationViewReports => 'View permitted location reports',
            self::LocationViewHistory => 'View location history',
            self::LocationManagePolicies => 'Manage location policies',
            self::LocationReviewAudit => 'Review location-access audit records',
            self::AdminIntegrationSettings => 'Manage integration settings',
            self::AdminSecurityPolicies => 'Manage security policies',
            self::AdminNotifications => 'Configure notifications',
            self::AdminIncidentsView => 'View security incidents',
            self::AdminReportsExport => 'Export authorized reports',
            self::AdminAuditRetention => 'Manage audit retention',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::LockViewStatus => 'See the reported state, battery and connection status of assigned locks.',
            self::LockLock => 'Ask LockGuard to lock an assigned lock.',
            self::LockUnlock => 'Ask LockGuard to unlock an assigned lock. Remote-unlock policies still apply.',
            self::LockRemoteUnlock => 'Unlock while away from the property, subject to the remote-unlock policy.',
            self::LockProximityUnlock => 'Use near-door proximity unlocking where it is enabled and validated.',
            self::LockViewHistory => 'See access events for assigned locks.',
            self::UsersCreate => 'Create new LockGuard accounts.',
            self::UsersEdit => 'Change profile details of other users.',
            self::UsersSuspend => 'Suspend accounts. Suspension blocks new access requests immediately.',
            self::UsersReactivate => 'Reactivate suspended accounts.',
            self::UsersRevoke => 'Permanently revoke accounts.',
            self::UsersAssignRoles => 'Assign and remove roles on other users.',
            self::UsersModifyPermissions => 'Add allow or deny overrides to individual users.',
            self::AccessGrantsCreate => 'Create time-limited access grants and guest invitations.',
            self::AccessGrantsRevoke => 'Revoke access grants before they expire.',
            self::AccessSchedulesManage => 'Create and change access schedules.',
            self::AccessCodesManage => 'Manage LockGuard records of keypad codes (not the codes stored in the lock).',
            self::AccessCodesSync => 'Push keypad-code changes to physical locks where the integration supports it.',
            self::DevicesView => 'See users\' enrolled phones and browsers.',
            self::DevicesEnroll => 'Enroll trusted devices for users.',
            self::DevicesRename => 'Rename enrolled devices.',
            self::DevicesRevoke => 'Revoke a device\'s trust, for example when it is lost.',
            self::DevicesRevokeSessions => 'Sign users out of active sessions.',
            self::LocationUse => 'Send location reports for location-dependent access.',
            self::LocationViewReports => 'See current location status reported for access decisions.',
            self::LocationViewHistory => 'See stored location history. Every view is audited.',
            self::LocationManagePolicies => 'Change geofences, freshness and accuracy thresholds, and retention.',
            self::LocationReviewAudit => 'Review the audit trail of who accessed location data.',
            self::AdminIntegrationSettings => 'Change the Eufy integration configuration.',
            self::AdminSecurityPolicies => 'Change authentication, session, remote-unlock and lockdown policies.',
            self::AdminNotifications => 'Configure notification providers and rules.',
            self::AdminIncidentsView => 'See security alerts and incidents.',
            self::AdminReportsExport => 'Export audit and access reports.',
            self::AdminAuditRetention => 'Change audit and data-retention settings.',
        };
    }

    /**
     * Everyday door access that user administrators may delegate without holding it themselves
     * (a Property Manager assigns the Resident role). Proximity unlocking is deliberately excluded.
     * These permissions are ignored by the anti-escalation ceiling in UserManagementGuard.
     */
    public function isDoorAccess(): bool
    {
        return in_array($this, [
            self::LockViewStatus,
            self::LockLock,
            self::LockUnlock,
            self::LockRemoteUnlock,
            self::LockViewHistory,
            self::LocationUse,
        ], true);
    }

    /**
     * Sensitive permissions require step-up authentication when that policy is enabled, and
     * changes to them are highlighted in the permission preview.
     */
    public function isSensitive(): bool
    {
        return in_array($this, [
            self::LockUnlock,
            self::LockRemoteUnlock,
            self::LockProximityUnlock,
            self::UsersRevoke,
            self::UsersAssignRoles,
            self::UsersModifyPermissions,
            self::AccessCodesSync,
            self::LocationViewHistory,
            self::LocationManagePolicies,
            self::AdminIntegrationSettings,
            self::AdminSecurityPolicies,
            self::AdminAuditRetention,
        ], true);
    }
}
