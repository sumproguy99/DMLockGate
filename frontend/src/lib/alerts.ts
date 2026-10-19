import type { LockSummary } from '../api/locks'
import type { SystemHealth } from '../api/system'
import type { Tone } from '../components/ui/tones'
import { describeIntegration } from './health'

export type AlertSeverity = 'critical' | 'warning'

/**
 * Something that needs the user's attention right now, worked out from what the backend reports
 * about the locks and the integration. LockGuard has no stored notifications yet, so an alert
 * disappears as soon as its cause is gone and has no read status.
 */
export type Alert = {
  id: string
  severity: AlertSeverity
  title: string
  description: string
  /** When the cause was reported, when known. */
  at: string | null
  lockId: number | null
}

export const severityTone: Record<AlertSeverity, Tone> = { critical: 'danger', warning: 'warning' }

export const LOW_BATTERY_PERCENT = 25

/** Alerts for the integration and each lock, most severe first. */
export function deriveAlerts(locks: readonly LockSummary[], health: SystemHealth | null): Alert[] {
  const alerts: Alert[] = []

  if (health) {
    const { status, degraded_reason, checked_at } = health.integration
    if (status === 'unreachable' || status === 'needs_login' || status === 'degraded') {
      const { label, explanation } = describeIntegration(status, degraded_reason)
      alerts.push({
        id: 'integration',
        severity: status === 'degraded' ? 'warning' : 'critical',
        title: label,
        description: explanation,
        at: checked_at,
        lockId: null,
      })
    }
  }

  for (const lock of locks) {
    if (lock.registration_status !== 'active') {
      continue
    }
    if (lock.reported_state === 'jammed') {
      alerts.push({
        id: `jammed-${lock.id}`,
        severity: 'critical',
        title: `${lock.name} is jammed`,
        description: 'The lock reported that its bolt could not move fully. Check the door and that the bolt lines up with the strike plate.',
        at: lock.state_observed_at,
        lockId: lock.id,
      })
    }
    if (lock.connection_status === 'disconnected') {
      alerts.push({
        id: `disconnected-${lock.id}`,
        severity: 'critical',
        title: `${lock.name} is offline`,
        description: 'The lock is not reporting to LockGuard. Its state may be out of date, and commands may not reach it.',
        at: lock.last_communication_at,
        lockId: lock.id,
      })
    } else if (lock.reported_state !== 'jammed' && (lock.state_freshness !== 'current' || lock.reported_state === 'unknown')) {
      alerts.push({
        id: `stale-${lock.id}`,
        severity: 'warning',
        title: `${lock.name}: state not confirmed`,
        description:
          lock.state_freshness === 'stale'
            ? 'The last report from the lock is old, so the door may have changed since. Check it before relying on it.'
            : 'LockGuard has no reliable report from this lock yet.',
        at: lock.state_observed_at,
        lockId: lock.id,
      })
    }
    if (lock.battery_level !== null && lock.battery_level <= LOW_BATTERY_PERCENT) {
      alerts.push({
        id: `battery-${lock.id}`,
        severity: lock.battery_level <= 10 ? 'critical' : 'warning',
        title: `${lock.name}: battery ${lock.battery_level}%`,
        description: 'Replace or charge the lock battery soon. A lock with a flat battery cannot be controlled remotely.',
        at: lock.battery_observed_at,
        lockId: lock.id,
      })
    }
  }

  return alerts.sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical'))
}
