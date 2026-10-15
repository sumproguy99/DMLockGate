<?php

namespace App\Enums;

/**
 * The built-in role templates seeded at install. Administrators may create further roles.
 *
 * Proximity unlocking is not granted by any template; it must be granted deliberately.
 */
enum RoleTemplate: string
{
    case SuperAdministrator = 'super_administrator';
    case SecurityAdministrator = 'security_administrator';
    case PropertyManager = 'property_manager';
    case Resident = 'resident';
    case TemporaryGuest = 'temporary_guest';
    case ServiceProvider = 'service_provider';
    case ReadOnlyAuditor = 'read_only_auditor';

    public function label(): string
    {
        return match ($this) {
            self::SuperAdministrator => 'Super Administrator',
            self::SecurityAdministrator => 'Security Administrator',
            self::PropertyManager => 'Property Manager',
            self::Resident => 'Resident',
            self::TemporaryGuest => 'Temporary Guest',
            self::ServiceProvider => 'Service Provider',
            self::ReadOnlyAuditor => 'Read-Only Auditor',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::SuperAdministrator => 'Full control of LockGuard, including integration and security settings.',
            self::SecurityAdministrator => 'Manages account security, devices, incidents and security policies.',
            self::PropertyManager => 'Manages residents, guests, access grants and schedules for assigned properties.',
            self::Resident => 'Locks and unlocks assigned doors and sees their history.',
            self::TemporaryGuest => 'Time-limited lock and unlock access to assigned doors.',
            self::ServiceProvider => 'Scheduled lock and unlock access for contractors and service staff.',
            self::ReadOnlyAuditor => 'Reviews history, incidents and audit records without changing anything.',
        };
    }

    /**
     * @return list<PermissionKey>
     */
    public function permissions(): array
    {
        return match ($this) {
            self::SuperAdministrator => array_values(array_filter(
                PermissionKey::cases(),
                fn (PermissionKey $key): bool => $key !== PermissionKey::LockProximityUnlock,
            )),
            self::SecurityAdministrator => [
                PermissionKey::LockViewStatus,
                PermissionKey::LockLock,
                PermissionKey::LockViewHistory,
                PermissionKey::UsersSuspend,
                PermissionKey::UsersReactivate,
                PermissionKey::UsersRevoke,
                PermissionKey::AccessGrantsRevoke,
                PermissionKey::DevicesView,
                PermissionKey::DevicesRevoke,
                PermissionKey::DevicesRevokeSessions,
                PermissionKey::LocationViewReports,
                PermissionKey::LocationReviewAudit,
                PermissionKey::AdminSecurityPolicies,
                PermissionKey::AdminNotifications,
                PermissionKey::AdminIncidentsView,
                PermissionKey::AdminReportsExport,
            ],
            self::PropertyManager => [
                PermissionKey::LockViewStatus,
                PermissionKey::LockLock,
                PermissionKey::LockUnlock,
                PermissionKey::LockViewHistory,
                PermissionKey::UsersCreate,
                PermissionKey::UsersEdit,
                PermissionKey::UsersSuspend,
                PermissionKey::UsersReactivate,
                PermissionKey::AccessGrantsCreate,
                PermissionKey::AccessGrantsRevoke,
                PermissionKey::AccessSchedulesManage,
                PermissionKey::AccessCodesManage,
                PermissionKey::DevicesView,
            ],
            self::Resident => [
                PermissionKey::LockViewStatus,
                PermissionKey::LockLock,
                PermissionKey::LockUnlock,
                PermissionKey::LockRemoteUnlock,
                PermissionKey::LockViewHistory,
                PermissionKey::LocationUse,
            ],
            self::TemporaryGuest, self::ServiceProvider => [
                PermissionKey::LockViewStatus,
                PermissionKey::LockLock,
                PermissionKey::LockUnlock,
            ],
            self::ReadOnlyAuditor => [
                PermissionKey::LockViewStatus,
                PermissionKey::LockViewHistory,
                PermissionKey::LocationReviewAudit,
                PermissionKey::AdminIncidentsView,
                PermissionKey::AdminReportsExport,
            ],
        };
    }
}
