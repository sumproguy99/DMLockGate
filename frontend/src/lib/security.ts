import type { AlertSeverity, AlertStatus, IncidentStatus, SecurityAlert } from '../api/security'
import type { Tone } from '../components/ui/tones'

/** Severity in words and tone. Always shown as text, never by color alone. */
export const severityBadge: Record<AlertSeverity, { tone: Tone; label: string }> = {
  critical: { tone: 'danger', label: 'Critical' },
  high: { tone: 'danger', label: 'High' },
  medium: { tone: 'warning', label: 'Medium' },
  low: { tone: 'info', label: 'Low' },
  info: { tone: 'info', label: 'Informational' },
}

export const severityOptions: { value: AlertSeverity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'info', label: 'Informational' },
]

export const alertStatusBadge: Record<AlertStatus, { tone: Tone; label: string }> = {
  open: { tone: 'warning', label: 'Open' },
  acknowledged: { tone: 'info', label: 'Acknowledged' },
  resolved: { tone: 'success', label: 'Resolved' },
}

export const incidentStatusBadge: Record<IncidentStatus, { tone: Tone; label: string }> = {
  new: { tone: 'danger', label: 'New' },
  acknowledged: { tone: 'warning', label: 'Acknowledged' },
  investigating: { tone: 'warning', label: 'Investigating' },
  contained: { tone: 'info', label: 'Contained' },
  resolved: { tone: 'success', label: 'Resolved' },
  closed: { tone: 'unknown', label: 'Closed' },
}

/** The lifecycle in order (project.md section 18). */
export const incidentStatuses: IncidentStatus[] = ['new', 'acknowledged', 'investigating', 'contained', 'resolved', 'closed']

export const categoryLabel: Record<string, string> = {
  security_incident: 'Security',
  lock_connectivity: 'Lock connection',
  battery_warning: 'Battery',
  integration_failure: 'Lock integration',
  device_revoked: 'Devices',
}

/** How a resolved alert came to be resolved, in words. */
export function describeResolution(alert: SecurityAlert): string | null {
  switch (alert.resolution) {
    case 'manual':
      return `Resolved by ${alert.resolved_by?.name ?? 'an administrator'}`
    case 'cleared':
      return 'Resolved itself: the problem cleared'
    case 'quiet':
      return 'Resolved itself: it stopped happening'
    case 'incident':
      return `Resolved with its incident by ${alert.resolved_by?.name ?? 'an administrator'}`
    default:
      return null
  }
}

/** The SecurityAlert component's three looks, from the five severities. */
export function alertLook(severity: AlertSeverity): 'critical' | 'warning' | 'info' {
  return severity === 'critical' || severity === 'high' ? 'critical' : severity === 'medium' ? 'warning' : 'info'
}
