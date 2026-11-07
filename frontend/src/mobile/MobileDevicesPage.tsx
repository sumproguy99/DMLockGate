import { ChevronRight, KeyRound } from 'lucide-react'
import { Link } from 'react-router'
import { LockStateBadge } from '../components/status/LockStatus'
import { OwnDevicesCard } from '../components/devices/OwnDevicesCard'
import { DeviceStatus } from '../components/status/DeviceStatus'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/Spinner'
import { useMobileLocks } from './locks-context'

/**
 * Mobile Devices (project.md 34.8 E): the locks this person can see, each linking to its controls,
 * and the person's own phones and browsers with their trust status.
 */
export function MobileDevicesPage() {
  const locks = useMobileLocks()

  return (
    <>
      <PageHeader title="Devices" description="Your locks, and the phones and browsers signed in to your account." />
      <div className="flex flex-col gap-5">
        <section aria-labelledby="devices-locks">
          <h2 id="devices-locks" className="mb-2 text-section">
            Locks
          </h2>
          {locks.loading ? (
            <LoadingState label="Loading your locks…" />
          ) : !locks.data ? (
            <Banner
              tone="danger"
              title="Your locks could not be loaded"
              action={
                <Button variant="secondary" size="sm" onClick={locks.refresh}>
                  Try again
                </Button>
              }
            >
              {locks.error instanceof Error ? locks.error.message : 'Something went wrong.'}
            </Banner>
          ) : locks.data.locks.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No locks to show"
              description="You have not been given access to any lock yet."
              className="rounded-lg border border-border bg-panel"
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {locks.data.locks.map((lock) => (
                <li key={lock.id}>
                  <Link
                    to={`/m/locks/${lock.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-panel p-4 shadow-panel active:bg-elevated"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-panel-title">{lock.name}</span>
                        <LockStateBadge state={lock.reported_state} freshness={lock.state_freshness} />
                      </div>
                      <DeviceStatus
                        connection={lock.connection_status}
                        batteryLevel={lock.battery_level}
                        lastCommunicationAt={lock.last_communication_at}
                      />
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <OwnDevicesCard />
      </div>
    </>
  )
}
