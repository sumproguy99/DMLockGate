import { Activity, KeyRound, RefreshCw } from 'lucide-react'
import { useCallback } from 'react'
import { Link } from 'react-router'
import { fetchLocks, type LockSummary } from '../api/locks'
import { fetchDashboard, type ActivityItem, type Dashboard } from '../api/system'
import { useSystemHealth } from '../app/health-context'
import { USER_ADMIN_PERMISSIONS } from '../app/navigation'
import { hasAnyPermission, useCurrentUser } from '../auth/auth-context'
import { LockCard } from '../components/locks/LockCard'
import { DetailRow as Row, IntegrationPanel, SystemHealthPanel } from '../components/system/HealthPanels'
import { ActivityEntry } from '../components/status/ActivityEntry'
import { Timestamp } from '../components/status/Timestamp'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { Card, Metric } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/Spinner'
import { describeActivity } from '../lib/activity'
import { cx } from '../lib/cx'
import { usePolled } from '../lib/usePolled'

/** How often the dashboard reloads locks and summaries. */
export const DASHBOARD_INTERVAL_MS = 30_000

type DashboardData = { locks: LockSummary[]; dashboard: Dashboard }

async function loadDashboard(signal: AbortSignal): Promise<DashboardData> {
  const [locks, dashboard] = await Promise.all([fetchLocks(signal), fetchDashboard(signal)])
  return { locks, dashboard }
}

/**
 * The desktop dashboard (project.md 34.5). Every figure comes from the backend; a panel the user
 * may not see is left out, and anything LockGuard cannot measure says so.
 */
export function DashboardPage() {
  const user = useCurrentUser()
  const polled = usePolled(loadDashboard, DASHBOARD_INTERVAL_MS)
  const health = useSystemHealth()
  const { data, error, loading, refreshing, loadedAt } = polled
  const refreshPolled = polled.refresh
  const refreshHealth = health.refresh

  const refreshAll = useCallback(() => {
    refreshPolled()
    refreshHealth()
  }, [refreshPolled, refreshHealth])

  const header = (
    <PageHeader
      title="Dashboard"
      description="Your locks and LockGuard's health, from what the backend has actually recorded."
      actions={
        <div className="flex items-center gap-3">
          {loadedAt && (
            <span className="text-caption text-text-muted">
              Updated <Timestamp iso={loadedAt} />
            </span>
          )}
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={refreshAll} loading={refreshing}>
            Refresh
          </Button>
        </div>
      }
    />
  )

  if (loading) {
    return (
      <>
        {header}
        <LoadingState label="Loading the dashboard…" />
      </>
    )
  }

  if (!data) {
    return (
      <>
        {header}
        <Banner
          tone="danger"
          title="The dashboard could not be loaded"
          action={
            <Button variant="secondary" size="sm" onClick={refreshAll}>
              Try again
            </Button>
          }
        >
          {error instanceof Error ? error.message : 'Something went wrong.'}
        </Banner>
      </>
    )
  }

  const { locks, dashboard } = data
  const lastRequestFor = (lockId: number) =>
    dashboard.last_requests === null ? undefined : (dashboard.last_requests.find((r) => r.lock_id === lockId) ?? null)

  return (
    <>
      {header}

      {error != null && (
        <Banner tone="warning" title="Showing the last information LockGuard sent" className="mb-6">
          The latest refresh failed: {error instanceof Error ? error.message : 'something went wrong'}. It will try
          again automatically.
        </Banner>
      )}

      <section aria-labelledby="locks-heading" className="mb-8">
        <h2 id="locks-heading" className="mb-3 text-section">
          Locks
        </h2>
        {locks.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No locks to show"
            description="You have not been given access to any lock yet. An administrator can grant it."
            className="rounded-lg border border-border bg-panel"
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {locks.map((lock) => (
              <LockCard key={lock.id} lock={lock} lastRequest={lastRequestFor(lock.id)} onChanged={refreshAll} />
            ))}
          </div>
        )}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <IntegrationPanel health={health.data} failed={health.error != null} />
        {dashboard.security && <SecurityPanel security={dashboard.security} />}
        {dashboard.users && (
          <UsersPanel users={dashboard.users} canManage={hasAnyPermission(user, USER_ADMIN_PERMISSIONS)} />
        )}
        {health.data?.subsystems && <SystemHealthPanel subsystems={health.data.subsystems} />}
        {dashboard.activity && <ActivityPanel activity={dashboard.activity} />}
      </div>
    </>
  )
}

function SecurityPanel({ security }: { security: NonNullable<Dashboard['security']> }) {
  const counts = [
    { label: 'Failed sign-ins', value: security.failed_sign_ins },
    { label: 'Rejected two-step codes', value: security.failed_mfa },
    { label: 'Failed identity checks', value: security.failed_step_ups },
    { label: 'Denied lock commands', value: security.denied_commands },
    { label: 'Commands failed or unconfirmed', value: security.unresolved_commands },
  ]

  return (
    <Card title="Security" description={`Failed and denied events in the last ${security.window_hours} hours, from the audit log.`}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {counts.map((count) => (
          <Metric
            key={count.label}
            label={count.label}
            value={<span className={cx(count.value > 0 && 'text-warning')}>{count.value}</span>}
          />
        ))}
      </div>
      <h3 className="mt-5 text-label text-text-muted">Most recent</h3>
      {security.recent.length === 0 ? (
        <p className="mt-2 text-support text-text-muted">Nothing failed or was denied in this period.</p>
      ) : (
        <ActivityList items={security.recent} />
      )}
      <p className="mt-3 text-caption text-text-muted">
        Alert acknowledgement and the Security Center are not built yet; these counts are read straight from the audit
        log.
      </p>
    </Card>
  )
}

function UsersPanel({ users, canManage }: { users: NonNullable<Dashboard['users']>; canManage: boolean }) {
  return (
    <Card
      title="Users and access"
      actions={
        canManage && (
          <Link to="/users" className="text-label font-medium text-primary-text hover:underline">
            Manage users
          </Link>
        )
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Active" value={users.active} />
        <Metric label="Suspended" value={users.suspended} />
        <Metric label="Revoked" value={users.revoked} />
        <Metric label="Expired" value={users.expired} />
      </div>
      <dl className="mt-4">
        <Row label="Active without two-step verification">
          <span className={cx(users.active_without_mfa > 0 && 'text-warning')}>{users.active_without_mfa}</span>
        </Row>
        <Row label="Time-limited lock access">{users.temporary_access}</Row>
        <Row label={`Ending within ${users.expiring_within_days} days`}>{users.expiring_access}</Row>
      </dl>
    </Card>
  )
}

function ActivityList({ items }: { items: ActivityItem[] }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const { tone, title, detail } = describeActivity(item)
        return (
          <ActivityEntry key={item.id} tone={tone} title={title} actor={item.actor} detail={detail} at={item.occurred_at} />
        )
      })}
    </ul>
  )
}

function ActivityPanel({ activity }: { activity: NonNullable<Dashboard['activity']> }) {
  return (
    <Card title="Recent activity" className="lg:col-span-2">
      {activity.length === 0 ? (
        <EmptyState icon={Activity} title="No activity yet" description="Sign-ins and lock requests will appear here." />
      ) : (
        <ActivityList items={activity} />
      )}
    </Card>
  )
}
