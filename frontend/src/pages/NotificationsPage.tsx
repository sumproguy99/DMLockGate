import { BellOff, CheckCheck } from 'lucide-react'
import { useSearchParams } from 'react-router'
import type { AppNotification } from '../api/notifications'
import { hasAnyPermission, useCurrentUser } from '../auth/auth-context'
import { NotificationList } from '../components/notifications/NotificationList'
import { useNotifications } from '../components/notifications/useNotifications'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { LoadingState } from '../components/ui/Spinner'
import { Tabs } from '../components/ui/Tabs'

/**
 * The desktop notification center: everything LockGuard has told this person, newest first, with
 * read status. Marking something read never changes the alert behind it.
 */
export function NotificationsPage() {
  const me = useCurrentUser()
  const [params, setParams] = useSearchParams()
  const unreadOnly = params.get('show') === 'unread'
  const page = Number(params.get('page') ?? '1') || 1
  const { list, marking, markingAll, markRead, markAllRead, unreadCount } = useNotifications(unreadOnly, page)
  const canSeeAlerts = hasAnyPermission(me, ['admin.incidents_view'])

  function links(notification: AppNotification) {
    return [
      ...(notification.alert_id && canSeeAlerts ? [{ to: `/security?alert=${notification.alert_id}`, label: 'View the alert' }] : []),
      ...(notification.lock_id !== null ? [{ to: `/locks/${notification.lock_id}`, label: 'Open the lock' }] : []),
    ]
  }

  const body =
    list.error != null && !list.data ? (
      <Banner tone="danger" title="Notifications could not be loaded" action={<Button variant="secondary" size="sm" onClick={list.reload}>Try again</Button>}>
        {list.error instanceof Error ? list.error.message : 'Something went wrong.'}
      </Banner>
    ) : !list.data ? (
      <LoadingState label="Loading notifications…" />
    ) : list.data.data.length === 0 ? (
      <EmptyState
        icon={BellOff}
        title={unreadOnly ? 'Nothing unread' : 'No notifications yet'}
        description="Security alerts and lock problems that concern you appear here."
        className="rounded-lg border border-border bg-panel"
      />
    ) : (
      <>
        <NotificationList notifications={list.data.data} links={links} onMarkRead={markRead} marking={marking} />
        <Pagination
          className="mt-4"
          page={list.data.meta.current_page}
          pageCount={list.data.meta.last_page}
          onPageChange={(p) => setParams((current) => ({ ...Object.fromEntries(current), page: String(p) }))}
        />
      </>
    )

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unreadCount === 0 ? 'Everything has been read.' : `${unreadCount} unread.`}
        actions={
          unreadCount > 0 && (
            <Button variant="secondary" icon={CheckCheck} loading={markingAll} onClick={markAllRead}>
              Mark all read
            </Button>
          )
        }
      />
      <Tabs
        label="Which notifications"
        value={unreadOnly ? 'unread' : 'all'}
        onChange={(id) => setParams(id === 'unread' ? { show: 'unread' } : {})}
        tabs={[
          { id: 'all', label: 'All', content: body },
          { id: 'unread', label: 'Unread', content: body },
        ]}
      />
      <p className="mt-6 text-caption text-text-muted">
        Notifications appear in LockGuard only; nothing is sent to your phone or by email yet. Security notifications for people who
        handle incidents cannot be turned off.
      </p>
    </>
  )
}
