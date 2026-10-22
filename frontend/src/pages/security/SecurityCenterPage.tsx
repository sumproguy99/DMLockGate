import { Check, CheckCheck, Eye, FolderPlus, ScrollText, ShieldCheck, Siren } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { listAuditLogs, type AuditRecord } from '../../api/audit'
import { ApiError } from '../../api/client'
import { acknowledgeAlert, listAlerts, listIncidents, type SecurityAlert, type SecurityIncident } from '../../api/security'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { AlertCard } from '../../components/security/AlertCard'
import { AlertDetailDialog, OpenIncidentDialog, ResolveAlertDialog } from '../../components/security/SecurityDialogs'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { EmptyState } from '../../components/ui/EmptyState'
import { SearchField, SelectField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { LoadingState } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/toast-context'
import { describeActivity } from '../../lib/activity'
import { incidentStatusBadge, incidentStatuses, severityBadge, severityOptions } from '../../lib/security'
import { formatAbsolute } from '../../lib/time'
import { useLoaded } from '../../lib/useLoaded'

const TABS = ['alerts', 'incidents', 'events'] as const
type Tab = (typeof TABS)[number]

/** Ready-made views of the audit trail's failures and refusals (project.md 34.6 G). */
const EVENT_VIEWS = [
  { id: 'failures', label: 'All failures', filters: { outcome: 'failure' } },
  { id: 'denials', label: 'All refusals', filters: { outcome: 'denied' } },
  { id: 'sign-ins', label: 'Failed sign-ins and identity checks', filters: { category: 'auth', outcome: 'failure' } },
  { id: 'refused-sign-ins', label: 'Refused sign-ins', filters: { category: 'auth', outcome: 'denied' } },
  { id: 'denied-locks', label: 'Denied lock requests', filters: { category: 'lock', outcome: 'denied' } },
  { id: 'lock-failures', label: 'Lock command failures', filters: { category: 'lock', outcome: 'failure' } },
  { id: 'location', label: 'Location failures', filters: { category: 'location', outcome: 'failure' } },
  { id: 'security', label: 'Security Center actions', filters: { category: 'security' } },
] as const

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

/**
 * The Security Center (project.md 18 and 34.6 G): alerts raised by the alert engine, incidents and
 * their lifecycle, and the security events in the audit trail. Everyone with admin.incidents_view
 * can look; acting needs admin.incidents_manage, which the backend enforces too.
 */
export function SecurityCenterPage() {
  const me = useCurrentUser()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'alerts'
  const canManage = hasAnyPermission(me, ['admin.incidents_manage'])
  const [opening, setOpening] = useState(false)

  function setParam(name: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) {
          next.set(name, value)
        } else {
          next.delete(name)
        }
        if (name !== 'page' && name !== 'alert') {
          next.delete('page')
        }
        return next
      },
      { replace: name === 'search' || name === 'alert' },
    )
  }

  return (
    <>
      <PageHeader
        title="Security center"
        description="Alerts LockGuard raised, the incidents they belong to, and the failed and refused actions in the audit log."
        actions={
          canManage && (
            <Button icon={FolderPlus} onClick={() => setOpening(true)}>
              Open incident
            </Button>
          )
        }
      />

      <Tabs
        label="Security center sections"
        value={tab}
        onChange={(id) => setParams(id === 'alerts' ? {} : { tab: id })}
        tabs={[
          { id: 'alerts', label: 'Alerts', content: <AlertsTab params={params} setParam={setParam} canManage={canManage} /> },
          { id: 'incidents', label: 'Incidents', content: <IncidentsTab params={params} setParam={setParam} /> },
          { id: 'events', label: 'Security events', content: <EventsTab params={params} setParam={setParam} /> },
        ]}
      />

      {opening && <OpenIncidentDialog onClose={() => setOpening(false)} onOpened={(incident) => navigate(`/security/incidents/${incident.id}`)} />}
    </>
  )
}

type TabProps = { params: URLSearchParams; setParam: (name: string, value: string) => void }

function AlertsTab({ params, setParam, canManage }: TabProps & { canManage: boolean }) {
  const toast = useToast()
  const navigate = useNavigate()
  const status = params.get('status') ?? 'active'
  const filters = { status: status === 'all' ? '' : status, severity: params.get('severity') ?? '', search: params.get('search') ?? '', page: params.get('page') ?? '' }
  const alerts = useLoaded((signal) => listAlerts(filters, signal), Object.values(filters).join('|'))
  const inspecting = params.get('alert')
  const [busy, setBusy] = useState<string | null>(null)
  const [resolving, setResolving] = useState<SecurityAlert | null>(null)
  const [escalating, setEscalating] = useState<SecurityAlert | null>(null)
  const searchTimer = useRef<number | undefined>(undefined)

  async function acknowledge(alert: SecurityAlert) {
    setBusy(alert.id)
    try {
      await acknowledgeAlert(alert.id)
      toast({ tone: 'success', title: 'Alert acknowledged', message: 'Others can see that you are handling it.' })
      alerts.reload()
    } catch (error) {
      toast({ tone: 'danger', title: 'Could not acknowledge', message: error instanceof ApiError ? error.message : 'Something went wrong.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SelectField
          label="Status"
          value={status}
          onChange={(e) => setParam('status', e.target.value === 'active' ? '' : e.target.value)}
          options={[
            { value: 'active', label: 'Needs attention' },
            { value: 'open', label: 'Open' },
            { value: 'acknowledged', label: 'Acknowledged' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'all', label: 'All alerts' },
          ]}
        />
        <SelectField
          label="Severity"
          value={filters.severity}
          onChange={(e) => setParam('severity', e.target.value)}
          options={[{ value: '', label: 'Any severity' }, ...severityOptions.map((o) => ({ value: o.value, label: `${o.label} or higher` }))]}
        />
        <div className="sm:col-span-2 xl:self-end">
          <SearchField
            label="Search alerts"
            placeholder="Search alerts"
            defaultValue={filters.search}
            onChange={(event) => {
              const value = event.target.value
              window.clearTimeout(searchTimer.current)
              searchTimer.current = window.setTimeout(() => setParam('search', value.trim()), 300)
            }}
          />
        </div>
      </div>

      {alerts.error != null && (
        <Banner tone="danger" title="Alerts could not be loaded" className="mb-4" action={<Button variant="secondary" size="sm" onClick={alerts.reload}>Try again</Button>}>
          {errorText(alerts.error)}
        </Banner>
      )}

      {!alerts.data ? (
        alerts.error == null && <LoadingState label="Loading alerts…" />
      ) : alerts.data.data.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={status === 'active' ? 'Nothing needs attention' : 'No alerts match these filters'}
          description={status === 'active' ? 'LockGuard has not noticed anything that needs looking at.' : undefined}
          className="rounded-lg border border-border bg-panel"
        />
      ) : (
        <>
          <h2 className="sr-only">Alerts ({alerts.data.meta.total})</h2>
          <ul className="flex flex-col gap-3">
            {alerts.data.data.map((alert) => (
              <li key={alert.id}>
                <AlertCard
                  alert={alert}
                  actions={
                    <>
                      <Button size="sm" variant="secondary" icon={Eye} onClick={() => setParam('alert', alert.id)}>
                        Details<span className="sr-only">: {alert.title}</span>
                      </Button>
                      {canManage && alert.status === 'open' && (
                        <Button size="sm" variant="secondary" icon={Check} loading={busy === alert.id} onClick={() => acknowledge(alert)}>
                          Acknowledge<span className="sr-only">: {alert.title}</span>
                        </Button>
                      )}
                      {canManage && alert.status !== 'resolved' && !alert.is_condition && (
                        <Button size="sm" variant="secondary" icon={CheckCheck} onClick={() => setResolving(alert)}>
                          Resolve<span className="sr-only">: {alert.title}</span>
                        </Button>
                      )}
                      {canManage && alert.status !== 'resolved' && !alert.incident && (
                        <Button size="sm" variant="ghost" icon={FolderPlus} aria-label={`Open incident for ${alert.title}`} onClick={() => setEscalating(alert)}>
                          Open incident
                        </Button>
                      )}
                    </>
                  }
                />
              </li>
            ))}
          </ul>
          <Pagination className="mt-4" page={alerts.data.meta.current_page} pageCount={alerts.data.meta.last_page} onPageChange={(p) => setParam('page', String(p))} />
        </>
      )}

      {inspecting && <AlertDetailDialog alertId={inspecting} onClose={() => setParam('alert', '')} />}
      {resolving && (
        <ResolveAlertDialog
          alert={resolving}
          onClose={() => setResolving(null)}
          onResolved={() => {
            setResolving(null)
            toast({ tone: 'success', title: 'Alert resolved', message: 'Recorded in the audit log.' })
            alerts.reload()
          }}
        />
      )}
      {escalating && <OpenIncidentDialog alert={escalating} onClose={() => setEscalating(null)} onOpened={(incident) => navigate(`/security/incidents/${incident.id}`)} />}
    </>
  )
}

function IncidentsTab({ params, setParam }: TabProps) {
  const status = params.get('status') ?? 'active'
  const filters = { status: status === 'all' ? '' : status, page: params.get('page') ?? '' }
  const incidents = useLoaded((signal) => listIncidents(filters, signal), Object.values(filters).join('|'))

  const columns: Column<SecurityIncident>[] = [
    {
      key: 'title',
      header: 'Incident',
      cell: (i) => (
        <Link to={`/security/incidents/${i.id}`} className="font-medium text-primary-text hover:underline">
          {i.title}
        </Link>
      ),
    },
    { key: 'severity', header: 'Severity', cell: (i) => <StatusBadge {...severityBadge[i.severity]} /> },
    { key: 'status', header: 'Status', cell: (i) => <StatusBadge {...incidentStatusBadge[i.status]} /> },
    { key: 'alerts', header: 'Alerts', cell: (i) => i.alert_count, className: 'hidden md:table-cell' },
    {
      key: 'opened',
      header: 'Opened',
      cell: (i) => (
        <span title={formatAbsolute(i.opened_at)}>
          <Timestamp iso={i.opened_at} />
          <span className="block text-caption text-text-muted">{i.opened_by ? `by ${i.opened_by.name ?? 'a removed user'}` : 'by the alert engine'}</span>
        </span>
      ),
      className: 'hidden lg:table-cell whitespace-nowrap',
    },
  ]

  return (
    <>
      <div className="mb-4 max-w-xs">
        <SelectField
          label="Status"
          value={status}
          onChange={(e) => setParam('status', e.target.value === 'active' ? '' : e.target.value)}
          options={[
            { value: 'active', label: 'Still open (not resolved or closed)' },
            ...incidentStatuses.map((s) => ({ value: s, label: incidentStatusBadge[s].label })),
            { value: 'all', label: 'All incidents' },
          ]}
        />
      </div>

      {incidents.error != null && (
        <Banner tone="danger" title="Incidents could not be loaded" className="mb-4" action={<Button variant="secondary" size="sm" onClick={incidents.reload}>Try again</Button>}>
          {errorText(incidents.error)}
        </Banner>
      )}

      <DataTable
        caption={incidents.data ? `Incidents (${incidents.data.meta.total})` : 'Incidents'}
        columns={columns}
        rows={incidents.data?.data ?? []}
        rowKey={(i) => i.id}
        loading={incidents.loading && !incidents.data}
        empty={<EmptyState icon={Siren} title={status === 'active' ? 'No open incidents' : 'No incidents match this filter'} />}
      />
      <Pagination className="mt-4" page={incidents.data?.meta.current_page ?? 1} pageCount={incidents.data?.meta.last_page ?? 1} onPageChange={(p) => setParam('page', String(p))} />
    </>
  )
}

function EventsTab({ params, setParam }: TabProps) {
  const view = EVENT_VIEWS.find((v) => v.id === params.get('view')) ?? EVENT_VIEWS[0]
  const page = params.get('page') ?? ''
  const records = useLoaded((signal) => listAuditLogs({ ...view.filters, page }, signal), `${view.id}|${page}`)
  const auditLink = `/audit?${new URLSearchParams(view.filters).toString()}`

  const columns: Column<AuditRecord>[] = [
    {
      key: 'when',
      header: 'When',
      cell: (r) => (
        <span title={formatAbsolute(r.occurred_at)}>
          <Timestamp iso={r.occurred_at} />
        </span>
      ),
      className: 'whitespace-nowrap',
    },
    {
      key: 'event',
      header: 'Event',
      cell: (r) => {
        const { title } = describeActivity({ id: r.event_id, kind: 'audit', occurred_at: r.occurred_at, action: r.action, outcome: r.outcome, actor: null, lock: null, detail: null })
        return (
          <div>
            <p className="font-medium">{title}</p>
            {r.reason && <p className="max-w-md truncate text-caption text-text-muted">{r.reason}</p>}
          </div>
        )
      },
    },
    {
      key: 'who',
      header: 'Who',
      cell: (r) => r.actor?.name ?? r.target_user?.name ?? <span className="text-text-muted">Not signed in</span>,
      className: 'hidden md:table-cell',
    },
    { key: 'lock', header: 'Lock', cell: (r) => r.target_lock?.name ?? <span className="text-text-muted">—</span>, className: 'hidden lg:table-cell' },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-sm">
          <SelectField label="Show" value={view.id} onChange={(e) => setParam('view', e.target.value)} options={EVENT_VIEWS.map((v) => ({ value: v.id, label: v.label }))} />
        </div>
        <Link to={auditLink} className="inline-flex min-h-11 items-center gap-1.5 text-label font-semibold text-primary-text hover:underline">
          <ScrollText className="size-4" aria-hidden />
          Open in the audit log
        </Link>
      </div>

      {records.error != null && (
        <Banner tone="danger" title="Security events could not be loaded" className="mb-4" action={<Button variant="secondary" size="sm" onClick={records.reload}>Try again</Button>}>
          {errorText(records.error)}
        </Banner>
      )}

      <DataTable
        caption={records.data ? `${view.label} (${records.data.meta.total})` : view.label}
        columns={columns}
        rows={records.data?.data ?? []}
        rowKey={(r) => r.event_id}
        loading={records.loading && !records.data}
        empty={<EmptyState icon={ShieldCheck} title="No events of this kind" />}
      />
      <Pagination className="mt-4" page={records.data?.meta.current_page ?? 1} pageCount={records.data?.meta.last_page ?? 1} onPageChange={(p) => setParam('page', String(p))} />
    </>
  )
}
