import { ArrowLeft, History, Save, Users } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../../api/client'
import { fetchLock, fetchLockHistory, updateLock, type LockChanges, type LockSummary } from '../../api/locks'
import { listUsers } from '../../api/users'
import { useSystemHealth } from '../../app/health-context'
import { USER_ADMIN_PERMISSIONS } from '../../app/navigation'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { LockCard } from '../../components/locks/LockCard'
import { ActivityEntry } from '../../components/status/ActivityEntry'
import { LockStateBadge } from '../../components/status/LockStatus'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { TextField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingState } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/toast-context'
import { describeIntegration } from '../../lib/health'
import { describeCommandStatus } from '../../lib/lockguard'
import { usePolled } from '../../lib/usePolled'
import { useLoaded, type Loaded } from '../../lib/useLoaded'
import { describeUserStatus } from '../../lib/users'

/** "T85D0ABC1234" → "••••1234": enough to match the Eufy app, not the whole serial. */
function maskSerial(serial: string): string {
  return serial.length <= 4 ? serial : `••••${serial.slice(-4)}`
}

/** LockStateEvent sources: a re-read from the Eufy cloud, or an event the lock pushed. */
const sourceLabel: Record<string, string> = {
  poll: 'Read from Eufy',
  push: 'Pushed by the lock',
}

/** One lock (project.md 34.6 D): its state and actions, diagnostics, settings, history and access. */
export function LockDetailPage() {
  const { id } = useParams()
  const lockId = Number(id)
  const me = useCurrentUser()
  const lock = usePolled((signal) => fetchLock(lockId, signal), 30_000)
  const canHistory = hasAnyPermission(me, ['lock.view_history'])
  const history = useLoaded(
    (signal) => (canHistory ? fetchLockHistory(lockId, signal) : Promise.resolve(null)),
    `${lockId}:${canHistory}`,
  )
  const [saved, setSaved] = useState<LockSummary | null>(null)

  const refreshAll = () => {
    setSaved(null)
    lock.refresh()
    history.reload()
  }

  if (lock.error instanceof ApiError && (lock.error.status === 404 || lock.error.status === 403)) {
    return (
      <>
        <PageHeader title="Lock not found" description="It does not exist, or you have not been given access to it." />
        <Link to="/locks" className="text-primary-text hover:underline">
          Back to locks
        </Link>
      </>
    )
  }

  const current = saved ?? lock.data
  if (!current) {
    return lock.error != null ? (
      <Banner
        tone="danger"
        title="This lock could not be loaded"
        action={
          <Button variant="secondary" size="sm" onClick={lock.refresh}>
            Try again
          </Button>
        }
      >
        {lock.error instanceof Error ? lock.error.message : 'Something went wrong.'}
      </Banner>
    ) : (
      <LoadingState label="Loading lock…" />
    )
  }

  return (
    <>
      <Link to="/locks" className="mb-3 inline-flex items-center gap-1.5 text-support text-text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />
        Locks
      </Link>
      <PageHeader title={current.name} description={[current.property?.name, current.vendor === 'eufy' ? 'Eufy' : current.vendor, current.model].filter(Boolean).join(' · ')} />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <LockCard lock={current} lastRequest={canHistory ? (history.data?.requests[0] ?? null) : undefined} onChanged={refreshAll} />
        <DiagnosticsCard lock={current} />
        {hasAnyPermission(me, ['admin.integration_settings']) && <SettingsCard lock={current} onSaved={setSaved} />}
        {hasAnyPermission(me, USER_ADMIN_PERMISSIONS) && <AccessCard lockId={current.id} />}
        {canHistory && <HistoryCard history={history} />}
      </div>
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-border py-2 last:border-b-0">
      <dt className="text-support text-text-muted">{label}</dt>
      <dd className="text-support">{children}</dd>
    </div>
  )
}

function DiagnosticsCard({ lock }: { lock: LockSummary }) {
  const health = useSystemHealth()
  const integration = health.data?.integration.status
  const reason = health.data?.integration.degraded_reason

  return (
    <Card title="Integration diagnostics" description="How LockGuard last heard from this lock.">
      <dl>
        <Row label="Eufy integration">
          {integration ? <StatusBadge tone={describeIntegration(integration, reason).tone} label={describeIntegration(integration, reason).label} /> : 'Checking…'}
        </Row>
        <Row label="Reported state">
          <LockStateBadge state={lock.reported_state} freshness={lock.state_freshness} />
        </Row>
        <Row label="State reported">{lock.state_observed_at ? <Timestamp iso={lock.state_observed_at} /> : 'Never'}</Row>
        <Row label="Reported through">{lock.state_source ? (sourceLabel[lock.state_source] ?? lock.state_source) : 'Nothing yet'}</Row>
        <Row label="Last contact">{lock.last_communication_at ? <Timestamp iso={lock.last_communication_at} /> : 'Never'}</Row>
        <Row label="Battery reported">{lock.battery_observed_at ? <Timestamp iso={lock.battery_observed_at} /> : 'Never'}</Row>
        <Row label="Last problem">
          {lock.last_error ? (
            <span className="text-warning">
              {lock.last_error}
              {lock.last_error_at && (
                <>
                  {' '}
                  (<Timestamp iso={lock.last_error_at} />)
                </>
              )}
            </span>
          ) : (
            'None recorded'
          )}
        </Row>
        <Row label="Serial number">
          <span className="font-mono">{maskSerial(lock.external_id)}</span>
        </Row>
        <Row label="Firmware">{lock.firmware_version ?? 'Not reported'}</Row>
      </dl>
    </Card>
  )
}

function SettingsCard({ lock, onSaved }: { lock: LockSummary; onSaved: (lock: LockSummary) => void }) {
  const toast = useToast()
  const withStepUp = useStepUp()
  const [busy, setBusy] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<LockChanges | null>(null)

  async function save(changes: LockChanges, done: string) {
    setBusy(true)
    setError(null)
    try {
      onSaved(await withStepUp(`change ${lock.name}'s settings`, () => updateLock(lock.id, changes)))
      toast({ tone: 'success', title: done })
      setConfirming(null)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 422) {
        setNameError(caught.field('name'))
      } else if (!(caught instanceof StepUpCancelled)) {
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    if (!name) {
      setNameError('Give the lock a name.')
      return
    }
    setNameError(null)
    if (name !== lock.name) {
      void save({ name }, 'Lock renamed')
    }
  }

  const enablingCommands = confirming?.commands_enabled === true
  const disablingLock = confirming?.registration_status === 'disabled'

  return (
    <Card title="Settings" description="Changes are recorded in the audit log.">
      {error && !confirming && (
        <Banner tone="danger" title="That did not work" className="mb-3">
          {error}
        </Banner>
      )}
      <form key={lock.name} onSubmit={rename} noValidate className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <TextField name="name" label="Name" defaultValue={lock.name} maxLength={120} error={nameError} required />
        </div>
        <Button type="submit" variant="secondary" icon={Save} loading={busy && !confirming}>
          Rename
        </Button>
      </form>

      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-support font-medium">Lock and unlock commands</p>
            <p className="text-caption text-text-muted">
              {lock.commands_enabled ? 'On: people with access can lock and unlock it from LockGuard.' : 'Off: LockGuard refuses every command for this lock.'}
            </p>
          </div>
          {lock.commands_enabled ? (
            <Button variant="secondary" size="sm" onClick={() => void save({ commands_enabled: false }, 'Commands turned off')} disabled={busy}>
              Turn off
            </Button>
          ) : (
            <Button size="sm" onClick={() => setConfirming({ commands_enabled: true })} disabled={busy || lock.registration_status !== 'active'}>
              Turn on
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-support font-medium">Lock registration</p>
            <p className="text-caption text-text-muted">
              {lock.registration_status === 'active' ? 'Active.' : 'Disabled: kept for history, but not usable.'}
            </p>
          </div>
          {lock.registration_status === 'active' ? (
            <Button variant="ghost" size="sm" onClick={() => setConfirming({ registration_status: 'disabled' })} disabled={busy}>
              Disable lock
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => void save({ registration_status: 'active' }, 'Lock re-enabled')} disabled={busy}>
              Re-enable
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title={enablingCommands ? `Turn on commands for ${lock.name}?` : `Disable ${lock.name}?`}
        consequence={
          enablingCommands
            ? 'Everyone with access to this lock and the lock permissions will be able to lock and unlock it from LockGuard.'
            : 'Nobody can use it from LockGuard until it is re-enabled. Its history is kept.'
        }
        confirmLabel={enablingCommands ? 'Turn on commands' : 'Disable lock'}
        tone={disablingLock ? 'danger' : 'primary'}
        busy={busy}
        error={confirming ? error : null}
        onConfirm={() => confirming && void save(confirming, enablingCommands ? 'Commands turned on' : 'Lock disabled')}
        onCancel={() => {
          setConfirming(null)
          setError(null)
        }}
      />
    </Card>
  )
}

function AccessCard({ lockId }: { lockId: number }) {
  const users = useLoaded((signal) => listUsers({ lock_id: String(lockId) }, signal), String(lockId))

  return (
    <Card title="Who has access" description="Change access from each person's user page.">
      {users.error != null ? (
        <Banner tone="danger" title="Could not load who has access">
          {users.error instanceof Error ? users.error.message : 'Something went wrong.'}
        </Banner>
      ) : !users.data ? (
        <LoadingState />
      ) : users.data.data.length === 0 ? (
        <EmptyState icon={Users} title="Nobody has access yet" />
      ) : (
        <ul className="divide-y divide-border">
          {users.data.data.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <Link to={`/users/${user.id}`} className="text-support font-medium text-primary-text hover:underline">
                {user.name}
              </Link>
              <StatusBadge {...describeUserStatus(user)} />
            </li>
          ))}
          {users.data.meta.total > users.data.data.length && (
            <li className="py-2.5 text-caption text-text-muted">
              And {users.data.meta.total - users.data.data.length} more. <Link to={`/users?lock_id=${lockId}`} className="underline">See all</Link>
            </li>
          )}
        </ul>
      )}
    </Card>
  )
}

function HistoryCard({ history }: { history: Loaded<Awaited<ReturnType<typeof fetchLockHistory>> | null> }) {
  if (history.error != null && !history.data) {
    return (
      <Card title="History">
        <Banner tone="danger" title="History could not be loaded">
          {history.error instanceof Error ? history.error.message : 'Something went wrong.'}
        </Banner>
      </Card>
    )
  }
  if (!history.data) {
    return (
      <Card title="History">
        <LoadingState />
      </Card>
    )
  }

  const { requests, states } = history.data

  return (
    <Card title="History" description="The latest 50 of each, newest first." className="xl:col-span-2">
      <Tabs
        label="Lock history"
        tabs={[
          {
            id: 'requests',
            label: 'Requests',
            content:
              requests.length === 0 ? (
                <EmptyState icon={History} title="No lock or unlock requests yet" />
              ) : (
                <ul className="divide-y divide-border">
                  {requests.map((request) => {
                    const { tone, label } = describeCommandStatus(request.status, request.command?.integration_result != null)
                    return (
                      <ActivityEntry
                        key={request.id}
                        tone={tone}
                        title={`${request.action === 'lock' ? 'Lock' : 'Unlock'} request: ${label}`}
                        detail={request.decision?.decision === 'deny' ? request.decision.reason : request.status_message}
                        at={request.requested_at}
                      />
                    )
                  })}
                </ul>
              ),
          },
          {
            id: 'states',
            label: 'Reported states',
            content:
              states.length === 0 ? (
                <EmptyState icon={History} title="The lock has not reported a state yet" />
              ) : (
                <ul className="divide-y divide-border">
                  {states.map((state) => (
                    <li key={`${state.observed_at}-${state.source}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <LockStateBadge state={state.state} freshness="current" />
                        <span className="text-caption text-text-muted">
                          {sourceLabel[state.source] ?? state.source}
                          {state.external_actor && <> · {state.external_actor}</>}
                          {state.battery_level !== null && <> · battery {state.battery_level}%</>}
                        </span>
                      </span>
                      <Timestamp iso={state.observed_at} className="text-caption text-text-muted" />
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
    </Card>
  )
}
