import type { AccessRequestStatus } from '../lib/lockguard'
import { api } from './client'
import type { LockAction, LockRequest } from './locks'

export type IntegrationStatus =
  | 'connected'
  | 'degraded'
  | 'needs_login'
  | 'starting'
  | 'unreachable'
  | 'not_configured'
  | 'simulated'
  | 'unknown'

export type SubsystemStatus = 'ok' | 'warning' | 'down' | 'unknown' | 'not_implemented'

/** GET /system/health. details and subsystems are present only for administrators. */
export type SystemHealth = {
  integration: {
    status: IntegrationStatus
    checked_at: string
    /** The newest lock state LockGuard's scheduled sync recorded. */
    last_sync_at: string | null
    details?: {
      error?: string | null
      degraded_reason?: string | null
      locks_visible?: number | null
      bridge_last_sync_at?: string | null
      cloud_ok_at?: string | null
      cloud_failures?: number | null
      cloud_last_error?: string | null
      last_error?: string | null
    }
  }
  subsystems?: Array<{ key: string; status: SubsystemStatus; summary: string }>
}

export type AuditOutcome = 'success' | 'denied' | 'failure' | 'info'

export type ActivityItem = {
  id: string
  kind: 'audit' | 'request'
  occurred_at: string
  action: string
  outcome: AuditOutcome
  actor: string | null
  lock: string | null
  detail: string | null
  request?: { action: LockAction; status: AccessRequestStatus; integration_responded: boolean }
}

/** GET /dashboard. A section is null when the signed-in user may not see it. */
export type Dashboard = {
  users: {
    active: number
    active_without_mfa: number
    suspended: number
    revoked: number
    expired: number
    temporary_access: number
    expiring_access: number
    expiring_within_days: number
  } | null
  security: {
    window_hours: number
    failed_sign_ins: number
    failed_mfa: number
    failed_step_ups: number
    denied_commands: number
    unresolved_commands: number
    recent: ActivityItem[]
  } | null
  activity: ActivityItem[] | null
  last_requests: LockRequest[] | null
}

export async function fetchSystemHealth(signal?: AbortSignal): Promise<SystemHealth> {
  const { data } = await api<{ data: SystemHealth }>('/system/health', { signal })
  return data
}

export async function fetchDashboard(signal?: AbortSignal): Promise<Dashboard> {
  const { data } = await api<{ data: Dashboard }>('/dashboard', { signal })
  return data
}
