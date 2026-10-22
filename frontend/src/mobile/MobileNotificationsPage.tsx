import { BellOff, CheckCheck, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { AppNotification } from '../api/notifications'
import { useSystemHealth } from '../app/health-context'
import { NotificationList } from '../components/notifications/NotificationList'
import { useNotifications } from '../components/notifications/useNotifications'
import { Timestamp } from '../components/status/Timestamp'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { LoadingState } from '../components/ui/Spinner'
import { StatusBadge } from '../components/ui/StatusBadge'
import { deriveAlerts, severityTone } from '../lib/alerts'
import { useMobileLocks } from './locks-context'

/**
 * Mobile Notifications (project.md 34.8 G): what needs attention right now, worked out from the
 * locks' reports and the integration's health, then the notifications LockGuard has stored for
 * this person with severity, time, description and read status.
 */
export function MobileNotificationsPage() {
  const locks = useMobileLocks()
  const health = useSystemHealth()
  const alerts = locks.data ? deriveAlerts(locks.data.locks, health.data) : []
  const [page, setPage] = useState(1)
  const { list, marking, markingAll, markRead, markAllRead, unreadCount } = useNotifications(false, page)

  const links = (notification: AppNotification) =>
    notification.lock_id !== null ? [{ to: `/m/locks/${notification.lock_id}`, label: 'Open the lock' }] : []

  return (
    <>
      <PageHeader title="Notifications" description="What needs attention, and what LockGuard has told you." />

      <section aria-labelledby="now-heading" className="mb-8">
        <h2 id="now-heading" className="mb-3 text-section">
          Right now
        </h2>
        {locks.loading ? (
          <LoadingState label="Checking your locks…" />
        ) : alerts.length === 0 ? (
          <p className="rounded-lg border border-border bg-panel p-4 text-support text-text-muted">
            {locks.data ? 'Your locks and the lock integration are reporting normally.' : 'LockGuard could not be reached to check your locks.'}
          </p>
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
                  <Link to={`/m/locks/${alert.lockId}`} className="mt-1 inline-flex min-h-11 items-center gap-1 text-label font-semibold text-primary-text">
                    Open the lock
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="stored-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="stored-heading" className="text-section">
            Your notifications{unreadCount > 0 && <span className="text-text-muted"> ({unreadCount} unread)</span>}
          </h2>
          {unreadCount > 0 && (
            <Button variant="secondary" size="sm" icon={CheckCheck} loading={markingAll} onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>

        {list.error != null && !list.data ? (
          <Banner tone="danger" title="Notifications could not be loaded" action={<Button variant="secondary" size="sm" onClick={list.reload}>Try again</Button>}>
            {list.error instanceof Error ? list.error.message : 'Something went wrong.'}
          </Banner>
        ) : !list.data ? (
          <LoadingState label="Loading notifications…" />
        ) : list.data.data.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="No notifications yet"
            description="Lock problems and security alerts that concern you appear here."
            className="rounded-lg border border-border bg-panel"
          />
        ) : (
          <>
            <NotificationList notifications={list.data.data} links={links} onMarkRead={markRead} marking={marking} />
            <Pagination className="mt-4" page={list.data.meta.current_page} pageCount={list.data.meta.last_page} onPageChange={setPage} />
          </>
        )}
      </section>

      <p className="mt-6 text-caption text-text-muted">
        Notifications appear in LockGuard only; nothing is sent to your phone in the background yet. Security notifications for people who
        handle incidents cannot be turned off.
      </p>
    </>
  )
}
