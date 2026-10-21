import { Bell, ChevronRight, KeyRound } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { useSystemHealth } from '../app/health-context'
import { useCurrentUser } from '../auth/auth-context'
import { Timestamp } from '../components/status/Timestamp'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/Spinner'
import { toneIcon, toneText } from '../components/ui/tones'
import { deriveAlerts, severityTone, type Alert } from '../lib/alerts'
import { cx } from '../lib/cx'
import { describeIntegration } from '../lib/health'
import { lastRequestFor, useMobileLocks } from './locks-context'
import { MobileLockCard } from './MobileLockCard'

/** Alerts shown on Home before "See all". */
const HOME_ALERTS = 2

function greeting(now = new Date()): string {
  const hour = now.getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

/**
 * Mobile Home (project.md 34.8 B): who is signed in, what needs attention, each lock with Lock and
 * Unlock, and the integration's health. Everything comes from the backend.
 */
export function MobileHomePage() {
  const user = useCurrentUser()
  const locks = useMobileLocks()
  const health = useSystemHealth()

  const refreshAll = () => {
    locks.refresh()
    health.refresh()
  }

  // Home has a greeting instead of a PageHeader, so it sets the tab title itself.
  useEffect(() => {
    document.title = 'Home · DM LockGuard'
  }, [])

  const firstName = user.name.split(/\s+/)[0] ?? user.name
  const alerts = locks.data ? deriveAlerts(locks.data.locks, health.data) : []

  return (
    <>
      <div className="mb-5">
        <h1 className="text-page-title">
          {greeting()}, {firstName}
        </h1>
        <p className="text-support text-text-muted">{user.roles.map((r) => r.name).join(', ') || 'No role'}</p>
      </div>

      {locks.loading ? (
        <LoadingState label="Loading your locks…" />
      ) : !locks.data ? (
        <Banner
          tone="danger"
          title="Your locks could not be loaded"
          action={
            <Button variant="secondary" size="sm" onClick={refreshAll}>
              Try again
            </Button>
          }
        >
          {locks.error instanceof Error ? locks.error.message : 'Something went wrong.'}
        </Banner>
      ) : (
        <div className="flex flex-col gap-5">
          {locks.error != null && (
            <Banner tone="warning" title="Showing the last information LockGuard sent">
              The latest refresh failed. It will try again automatically.
            </Banner>
          )}

          {alerts.length > 0 && <AlertSummary alerts={alerts} />}

          <section aria-labelledby="home-locks" className="flex flex-col gap-4">
            <h2 id="home-locks" className="sr-only">
              Your locks
            </h2>
            {locks.data.locks.length === 0 ? (
              <EmptyState
                icon={KeyRound}
                title="No locks to show"
                description="You have not been given access to any lock yet. An administrator can grant it."
                className="rounded-lg border border-border bg-panel"
              />
            ) : (
              locks.data.locks.map((lock) => (
                <MobileLockCard
                  key={lock.id}
                  lock={lock}
                  lastRequest={lastRequestFor(locks.data!, lock.id)}
                  onChanged={refreshAll}
                  linkToDetails
                />
              ))
            )}
          </section>

          <ConnectionCard />

          {locks.loadedAt && (
            <p className="text-center text-caption text-text-muted">
              Updated <Timestamp iso={locks.loadedAt} />.{' '}
              <button type="button" onClick={refreshAll} className="min-h-11 px-2 font-semibold text-primary-text">
                Refresh
              </button>
            </p>
          )}
        </div>
      )}
    </>
  )
}

function AlertSummary({ alerts }: { alerts: Alert[] }) {
  return (
    <section aria-labelledby="home-alerts" className="rounded-lg border border-border bg-panel p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="home-alerts" className="flex items-center gap-2 text-panel-title">
          <Bell className="size-4 text-text-muted" aria-hidden />
          Needs attention
        </h2>
        {alerts.length > HOME_ALERTS && (
          <Link to="/m/notifications" className="flex min-h-11 items-center gap-1 text-label font-semibold text-primary-text">
            See all {alerts.length}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {alerts.slice(0, HOME_ALERTS).map((alert) => {
          const tone = severityTone[alert.severity]
          const Icon = toneIcon[tone]
          return (
            <li key={alert.id} className="flex gap-3 py-2">
              <Icon className={cx('mt-0.5 size-5 shrink-0', toneText[tone])} aria-hidden />
              <div className="min-w-0">
                <p className="text-support font-medium">
                  <span className="sr-only">{alert.severity === 'critical' ? 'Critical: ' : 'Warning: '}</span>
                  {alert.title}
                </p>
                <p className="text-caption text-text-muted">{alert.description}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The integration's health as a compact card. */
function ConnectionCard() {
  const { data, error } = useSystemHealth()
  if (!data) {
    return (
      <section className="rounded-lg border border-border bg-panel p-4">
        <h2 className="text-panel-title">Connection</h2>
        <p className="text-support text-text-muted">
          {error ? 'LockGuard could not check the lock integration.' : 'Checking the lock integration…'}
        </p>
      </section>
    )
  }
  const { tone, label, icon: Icon, explanation } = describeIntegration(data.integration.status, data.integration.degraded_reason)

  return (
    <section aria-labelledby="home-connection" className="rounded-lg border border-border bg-panel p-4">
      <h2 id="home-connection" className="mb-2 text-panel-title">
        Connection
      </h2>
      <p className={cx('flex items-center gap-2 text-support font-semibold', toneText[tone])}>
        <Icon className="size-4" aria-hidden />
        {label}
      </p>
      <p className="mt-1 text-caption text-text-muted">{explanation}</p>
      <p className="mt-1 text-caption text-text-muted">
        Checked <Timestamp iso={data.integration.checked_at} />
        {data.integration.last_sync_at && (
          <>
            {' '}
            · last lock sync <Timestamp iso={data.integration.last_sync_at} />
          </>
        )}
      </p>
    </section>
  )
}
