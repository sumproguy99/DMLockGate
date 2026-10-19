import { ChevronLeft, KeyRound } from 'lucide-react'
import { useCallback } from 'react'
import { Link, useParams } from 'react-router'
import { fetchLockHistory } from '../api/locks'
import { useSystemHealth } from '../app/health-context'
import { hasAnyPermission, useCurrentUser } from '../auth/auth-context'
import { ActivityEntry } from '../components/status/ActivityEntry'
import { BatteryBadge, ConnectionBadge } from '../components/status/DeviceStatus'
import { Timestamp } from '../components/status/Timestamp'
import { DetailRow as Row } from '../components/system/HealthPanels'
import { Banner } from '../components/ui/Banner'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/Spinner'
import { describeCommandStatus, describeLockState, maskSerial } from '../lib/lockguard'
import { useLoaded } from '../lib/useLoaded'
import { lastRequestFor, useMobileLocks } from './locks-context'
import { MobileLockCard } from './MobileLockCard'

/** Requests listed under "Recent requests". */
const RECENT_REQUESTS = 5

/**
 * Mobile lock controls (project.md 34.8 C): one lock, large, with Lock and Unlock, its last
 * confirmed state, connection, last command outcome, device details and errors.
 */
export function MobileLockPage() {
  const { lockId } = useParams()
  const user = useCurrentUser()
  const locks = useMobileLocks()
  const health = useSystemHealth()
  const lock = locks.data?.locks.find((l) => String(l.id) === lockId)

  const back = (
    <Link to="/m" className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 px-2 text-label font-semibold text-primary-text">
      <ChevronLeft className="size-4" aria-hidden />
      Home
    </Link>
  )

  if (locks.loading) {
    return (
      <>
        {back}
        <LoadingState label="Loading the lock…" />
      </>
    )
  }
  if (!lock) {
    return (
      <>
        {back}
        <PageHeader title="Lock not found" />
        <EmptyState
          icon={KeyRound}
          title="This lock is not available to you"
          description="It may have been removed, or your access to it has ended."
          className="rounded-lg border border-border bg-panel"
        />
      </>
    )
  }

  const refreshAll = () => {
    locks.refresh()
    health.refresh()
  }

  return (
    <>
      {back}
      <PageHeader title={lock.name} description={lock.property?.name} />
      <div className="flex flex-col gap-4">
        <MobileLockCard lock={lock} lastRequest={lastRequestFor(locks.data!, lock.id)} onChanged={refreshAll} showTitle={false} />

        {lock.last_error && lock.last_error_at && (
          <Banner tone="warning" title="Last problem">
            <Timestamp iso={lock.last_error_at} />: {lock.last_error}
          </Banner>
        )}

        <Card title="Device" headingLevel={2}>
          <dl>
            <Row label="Connection">
              <ConnectionBadge status={lock.connection_status} />
            </Row>
            <Row label="Battery">
              <BatteryBadge level={lock.battery_level} />
            </Row>
            <Row label="Last contact">{lock.last_communication_at ? <Timestamp iso={lock.last_communication_at} /> : 'Never'}</Row>
            <Row label="Last confirmed state">
              {lock.state_observed_at ? (
                <>
                  {describeLockState(lock.reported_state, 'current').label} · <Timestamp iso={lock.state_observed_at} />
                </>
              ) : (
                'None yet'
              )}
            </Row>
            <Row label="Model">{lock.model ?? 'Not reported'}</Row>
            <Row label="Serial">
              <span className="font-mono">{maskSerial(lock.external_id)}</span>
            </Row>
            <Row label="Firmware">{lock.firmware_version ?? 'Not reported'}</Row>
            <Row label="Commands">{lock.commands_enabled ? 'On' : 'Turned off'}</Row>
          </dl>
        </Card>

        {hasAnyPermission(user, ['lock.view_history']) && <RecentRequests lockId={lock.id} />}
      </div>
    </>
  )
}

function RecentRequests({ lockId }: { lockId: number }) {
  const load = useCallback((signal: AbortSignal) => fetchLockHistory(lockId, signal), [lockId])
  const history = useLoaded(load, String(lockId))
  const requests = history.data?.requests.slice(0, RECENT_REQUESTS) ?? []

  return (
    <Card title="Recent requests" headingLevel={2}>
      {history.loading && !history.data ? (
        <LoadingState label="Loading requests…" />
      ) : history.error && !history.data ? (
        <p className="text-support text-text-muted">The request history could not be loaded.</p>
      ) : requests.length === 0 ? (
        <p className="text-support text-text-muted">No lock or unlock requests yet.</p>
      ) : (
        <ul className="-my-3 divide-y divide-border">
          {requests.map((request) => {
            const { tone, label } = describeCommandStatus(request.status, request.command?.integration_result != null)
            return (
              <ActivityEntry
                key={request.id}
                tone={tone}
                title={`${request.action === 'lock' ? 'Lock' : 'Unlock'}: ${label}`}
                detail={request.status_message}
                at={request.requested_at}
              />
            )
          })}
        </ul>
      )}
    </Card>
  )
}
