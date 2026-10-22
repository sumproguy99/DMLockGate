import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { SecurityAlert as Alert } from '../../api/security'
import { alertLook, alertStatusBadge, describeResolution, severityBadge } from '../../lib/security'
import { SecurityAlert } from '../status/SecurityAlert'
import { StatusBadge } from '../ui/StatusBadge'

/** One stored alert: severity, status, what it is about, and its incident (left out on the incident's own page). */
export function AlertCard({ alert, actions, showIncident = true }: { alert: Alert; actions?: ReactNode; showIncident?: boolean }) {
  const about = [
    alert.subject_user && `Account: ${alert.subject_user.name ?? `#${alert.subject_user.id}`}`,
    alert.subject_lock && `Lock: ${alert.subject_lock.name ?? `#${alert.subject_lock.id}`}`,
    alert.subject_ip && `From ${alert.subject_ip}`,
  ].filter(Boolean)

  return (
    <SecurityAlert
      severity={alertLook(alert.severity)}
      severityLabel={severityBadge[alert.severity].label}
      badges={
        <>
          <StatusBadge {...alertStatusBadge[alert.status]} />
          {alert.occurrences > 1 && <span className="text-caption text-text-muted">Seen {alert.occurrences} times</span>}
        </>
      }
      title={alert.title}
      description={alert.description}
      at={alert.last_seen_at}
      actions={actions}
    >
      <div className="mt-1 flex flex-col gap-0.5 text-caption text-text-muted">
        {about.length > 0 && <p>{about.join(' · ')}</p>}
        {showIncident && alert.incident && (
          <p>
            Incident:{' '}
            <Link to={`/security/incidents/${alert.incident.id}`} className="font-medium text-primary-text hover:underline">
              {alert.incident.title}
            </Link>
          </p>
        )}
        {alert.status === 'acknowledged' && <p>Acknowledged by {alert.acknowledged_by?.name ?? 'an administrator'}</p>}
        {alert.status === 'resolved' && <p>{describeResolution(alert)}</p>}
        {alert.is_condition && alert.status !== 'resolved' && <p>Resolves itself when the problem clears.</p>}
      </div>
    </SecurityAlert>
  )
}
