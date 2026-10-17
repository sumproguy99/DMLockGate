import { KeyRound, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../../api/client'
import { fetchLocks, fetchProperties, registerLock, type LockSummary } from '../../api/locks'
import { fetchDashboard } from '../../api/system'
import { useSystemHealth } from '../../app/health-context'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { BatteryBadge, ConnectionBadge } from '../../components/status/DeviceStatus'
import { LockStateBadge } from '../../components/status/LockStatus'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { SelectField, TextField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useToast } from '../../components/ui/toast-context'
import { describeIntegration } from '../../lib/health'
import { describeCommandStatus } from '../../lib/lockguard'
import { usePolled } from '../../lib/usePolled'
import { useLoaded } from '../../lib/useLoaded'

async function loadLocks(signal: AbortSignal) {
  const [locks, dashboard] = await Promise.all([fetchLocks(signal), fetchDashboard(signal)])
  return { locks, lastRequests: dashboard.last_requests }
}

/** Lock management (project.md 34.6 D): every lock this user may see, with what it last reported. */
export function LocksPage() {
  const me = useCurrentUser()
  const health = useSystemHealth()
  const polled = usePolled(loadLocks, 30_000)
  const [registering, setRegistering] = useState(false)
  const canManage = hasAnyPermission(me, ['admin.integration_settings'])
  const integration = health.data?.integration.status

  const columns: Column<LockSummary>[] = [
    {
      key: 'name',
      header: 'Lock',
      cell: (lock) => (
        <div>
          <Link to={`/locks/${lock.id}`} className="font-medium text-primary-text hover:underline">
            {lock.name}
          </Link>
          <p className="text-caption text-text-muted">{[lock.property?.name, lock.model].filter(Boolean).join(' · ')}</p>
        </div>
      ),
    },
    { key: 'state', header: 'Reported state', cell: (lock) => <LockStateBadge state={lock.reported_state} freshness={lock.state_freshness} /> },
    { key: 'connection', header: 'Connection', cell: (lock) => <ConnectionBadge status={lock.connection_status} />, className: 'hidden md:table-cell' },
    { key: 'battery', header: 'Battery', cell: (lock) => <BatteryBadge level={lock.battery_level} />, className: 'hidden lg:table-cell' },
    {
      key: 'contact',
      header: 'Last contact',
      cell: (lock) => (lock.last_communication_at ? <Timestamp iso={lock.last_communication_at} /> : <span className="text-text-muted">Never</span>),
      className: 'hidden lg:table-cell',
    },
    {
      key: 'last_command',
      header: 'Last command',
      cell: (lock) => {
        const request = polled.data?.lastRequests?.find((r) => r.lock_id === lock.id)
        if (polled.data?.lastRequests == null) {
          return <span className="text-text-muted">Not shown</span>
        }
        if (!request) {
          return <span className="text-text-muted">None</span>
        }
        const { tone, label } = describeCommandStatus(request.status, request.command?.integration_result != null)
        return (
          <span className="flex flex-col gap-0.5">
            <StatusBadge tone={tone} label={`${request.action === 'lock' ? 'Lock' : 'Unlock'}: ${label}`} />
            <Timestamp iso={request.requested_at} className="text-caption text-text-muted" />
          </span>
        )
      },
      className: 'hidden xl:table-cell',
    },
    {
      key: 'commands',
      header: 'Commands',
      cell: (lock) =>
        lock.registration_status !== 'active' ? (
          <StatusBadge tone="unknown" label="Disabled lock" />
        ) : lock.commands_enabled ? (
          <StatusBadge tone="success" label="On" />
        ) : (
          <StatusBadge tone="unknown" label="Off" />
        ),
      className: 'hidden md:table-cell',
    },
  ]

  return (
    <>
      <PageHeader
        title="Locks"
        description="What each lock last reported. States are never assumed from a command; only the lock's own report counts."
        actions={
          canManage && (
            <Button icon={Plus} onClick={() => setRegistering(true)}>
              Register lock
            </Button>
          )
        }
      />

      {integration && integration !== 'connected' && (
        <Banner tone={describeIntegration(integration).tone} title={describeIntegration(integration).label} className="mb-4" live="none">
          {describeIntegration(integration).explanation}
        </Banner>
      )}

      {polled.error != null && (
        <Banner
          tone={polled.data ? 'warning' : 'danger'}
          title={polled.data ? 'Showing the last information LockGuard sent' : 'Locks could not be loaded'}
          className="mb-4"
          action={
            <Button variant="secondary" size="sm" onClick={polled.refresh}>
              Try again
            </Button>
          }
        >
          {polled.error instanceof Error ? polled.error.message : 'Something went wrong.'}
        </Banner>
      )}

      <DataTable
        caption="Locks"
        captionHidden
        columns={columns}
        rows={polled.data?.locks ?? []}
        rowKey={(lock) => lock.id}
        loading={polled.loading}
        empty={<EmptyState icon={KeyRound} title="No locks to show" description="No lock is registered, or you have not been given access to one." />}
      />

      {registering && <RegisterLockDialog onClose={() => setRegistering(false)} />}
    </>
  )
}

function RegisterLockDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const withStepUp = useStepUp()
  const properties = useLoaded(fetchProperties, 'properties')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (name: string) => String(data.get(name) ?? '').trim()
    const input = { property_id: Number(value('property_id')), name: value('name'), model: value('model') || null, external_id: value('external_id') }
    const missing = {
      property_id: input.property_id ? null : 'Choose a property.',
      name: input.name ? null : 'Give the lock a name.',
      external_id: input.external_id ? null : "Enter the lock's serial number.",
    }
    if (Object.values(missing).some(Boolean)) {
      setErrors(missing)
      return
    }
    setBusy(true)
    setFormError(null)
    setErrors({})
    try {
      const lock = await withStepUp('register a lock', () => registerLock(input))
      toast({ tone: 'success', title: `${lock.name} registered`, message: 'Commands are off until you turn them on.' })
      navigate(`/locks/${lock.id}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrors(Object.fromEntries(Object.keys(error.fields).map((k) => [k, error.field(k)])))
      } else if (!(error instanceof StepUpCancelled)) {
        setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      }
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title="Register a lock"
      description="Add a Eufy lock LockGuard does not know yet. Its commands stay off until you turn them on. The scheduled sync can also find locks: run lockguard:sync-locks on the server."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && (
          <Banner tone="danger" title="Could not register the lock">
            {formError}
          </Banner>
        )}
        {properties.data?.length === 0 && (
          <Banner tone="warning" title="No properties yet" live="none">
            Add a property first on the <Link to="/properties" className="underline">Properties</Link> page.
          </Banner>
        )}
        <SelectField
          name="property_id"
          label="Property"
          placeholder={properties.data ? 'Choose a property' : 'Loading…'}
          options={(properties.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
          error={errors.property_id}
          required
        />
        <TextField name="name" label="Name" placeholder="Front Door" error={errors.name} required />
        <TextField name="model" label="Model" placeholder="T85D0" error={errors.model} />
        <TextField
          name="external_id"
          label="Serial number"
          hint="As shown in the Eufy app under device settings."
          autoComplete="off"
          spellCheck={false}
          error={errors.external_id}
          required
        />
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Register
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
