<?php

namespace App\Enums;

/**
 * The alert engine's rules. Event rules react to audit records; condition rules look at the current
 * state of locks and the integration and resolve themselves when the condition clears.
 */
enum AlertRule: string
{
    // Event rules
    case FailedSignIns = 'failed_sign_ins';
    case DeniedLockRequests = 'denied_lock_requests';
    case LockCommandFailures = 'lock_command_failures';
    case LockOutcomeUnknown = 'lock_outcome_unknown';
    case AdminPermissionChange = 'admin_permission_change';
    case MfaDisabled = 'mfa_disabled';
    case RecoveryCodeUsed = 'recovery_code_used';
    case AuditWriteFailure = 'audit_write_failure';
    case NewDeviceSignIn = 'new_device_sign_in';
    case RevokedDeviceAccess = 'revoked_device_access';
    case DeviceLost = 'device_lost';

    // Condition rules
    case IntegrationUnavailable = 'integration_unavailable';
    case LockOffline = 'lock_offline';
    case LockJammed = 'lock_jammed';
    case LockStateUnconfirmed = 'lock_state_unconfirmed';
    case BatteryLow = 'battery_low';
    case AuditProtectionMissing = 'audit_protection_missing';

    public function label(): string
    {
        return match ($this) {
            self::FailedSignIns => 'Repeated failed sign-ins',
            self::DeniedLockRequests => 'Repeated denied lock requests',
            self::LockCommandFailures => 'Repeated lock command failures',
            self::LockOutcomeUnknown => 'Lock command outcome unknown',
            self::AdminPermissionChange => 'Administrative permission granted',
            self::MfaDisabled => 'Two-step sign-in turned off',
            self::RecoveryCodeUsed => 'Recovery code used',
            self::AuditWriteFailure => 'Audit record could not be written',
            self::NewDeviceSignIn => 'Sign-in from a new device',
            self::RevokedDeviceAccess => 'Revoked device used',
            self::DeviceLost => 'Device reported lost',
            self::IntegrationUnavailable => 'Lock integration unavailable',
            self::LockOffline => 'Lock offline',
            self::LockJammed => 'Lock jammed',
            self::LockStateUnconfirmed => 'Lock state not confirmed',
            self::BatteryLow => 'Lock battery low',
            self::AuditProtectionMissing => 'Audit protection missing',
        };
    }

    public function isCondition(): bool
    {
        return in_array($this, [
            self::IntegrationUnavailable,
            self::LockOffline,
            self::LockJammed,
            self::LockStateUnconfirmed,
            self::BatteryLow,
            self::AuditProtectionMissing,
        ], true);
    }

    /**
     * The notification category (project.md section 22) people see this alert under.
     */
    public function category(): string
    {
        return match ($this) {
            self::LockOffline, self::LockJammed, self::LockStateUnconfirmed, self::LockCommandFailures, self::LockOutcomeUnknown => 'lock_connectivity',
            self::BatteryLow => 'battery_warning',
            self::IntegrationUnavailable => 'integration_failure',
            self::RevokedDeviceAccess, self::DeviceLost => 'device_revoked',
            default => 'security_incident',
        };
    }

    /**
     * Whether incident handlers are told. A new device is only news to its owner; handlers still see
     * the alert in the Security Center.
     */
    public function notifiesHandlers(): bool
    {
        return $this !== self::NewDeviceSignIn;
    }

    /**
     * Whether people who use the lock are told, as well as the incident handlers.
     */
    public function notifiesLockUsers(): bool
    {
        return in_array($this, [self::LockOffline, self::LockJammed, self::BatteryLow], true);
    }

    /**
     * Whether the person the alert is about is told, for problems with their own account.
     */
    public function notifiesSubjectUser(): bool
    {
        return in_array($this, [self::FailedSignIns, self::MfaDisabled, self::RecoveryCodeUsed, self::AdminPermissionChange, self::NewDeviceSignIn, self::RevokedDeviceAccess, self::DeviceLost], true);
    }
}
