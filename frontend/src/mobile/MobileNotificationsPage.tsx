import { BellOff, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { useSystemHealth } from '../app/health-context'
import { Timestamp } from '../components/status/Timestamp'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/Spinner'
import { StatusBadge } from '../components/ui/StatusBadge'
import { deriveAlerts, severityTone } from '../lib/alerts'
import { useMobileLocks } from './locks-context'

/**
 * Mobile Notifications (project.md 34.8 G): what needs attention now, worked out from the locks'
 * reports and the integration's health. LockGuard does not store notifications yet, so an alert
 * goes away by itself when its cause clears and there is no read status or history.
 */
export function MobileNotificationsPage() {
  const locks = useMobileLocks()
  const health = useSystemHealth()
  const alerts = locks.data ? deriveAlerts(locks.data.locks, health.data) : []

  return (
    <>
      <PageHeader title="Notifications" description="What needs attention right now." />

      {locks.loading ? (
        <LoadingState label="Checking your locks…" />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={locks.data ? 'Nothing needs attention' : 'Could not check your locks'}
          description={
            locks.data
              ? 'Your locks and the lock integration are reporting normally.'
              : 'LockGuard could not be reached. Alerts will appear here when it can.'
          }
          className="rounded-lg border border-border bg-panel"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {alerts.map((alert) => (
            <li key={alert.id} className="rounded-lg border border-border bg-panel p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <StatusBadge tone={severityTone[alert.severity]} label={alert.severity === 'critical' ? 'Critical' : 'Warning'} />
                {alert.at && <Timestamp iso={alert.at} className="text-caption text-text-muted" />}
              </div>
              <p className="text-support font-semibold">{alert.title}</p>
              <p className="text-support text-text-muted">{alert.description}</p>
              {alert.lockId !== null && (
                <Link
                  to={`/m/locks/${alert.lockId}`}
                  className="mt-1 inline-flex min-h-11 items-center gap-1 text-label font-semibold text-primary-text"
                >
                  Open the lock
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-caption text-text-muted">
        Alerts are worked out from what your locks report now. LockGuard does not keep a notification history or send
        notifications to your phone yet, and none of these can be turned off.
      </p>
    </>
  )
}
