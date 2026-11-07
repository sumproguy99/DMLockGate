import { Download, Eye, Filter, ScrollText, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { exportAuditLogs, getAuditRecord, listAuditLogs, type AuditFilters, type AuditRecord } from '../../api/audit'
import { ApiError } from '../../api/client'
import { fetchLocks } from '../../api/locks'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button, IconButton } from '../../components/ui/Button'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { SearchField, SelectField, TextField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { LoadingState } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useToast } from '../../components/ui/toast-context'
import { describeActivity } from '../../lib/activity'
import { formatAbsolute } from '../../lib/time'
import { useLoaded } from '../../lib/useLoaded'
import { fromLocalInput, toLocalInput } from '../../lib/users'

const FILTERS = ['search', 'category', 'outcome', 'actor_user_id', 'target_user_id', 'target_lock_id', 'from', 'to', 'page'] as const
type FilterName = (typeof FILTERS)[number]

const outcomeBadge = {
  success: { tone: 'success', label: 'Success' },
  failure: { tone: 'danger', label: 'Failed' },
  denied: { tone: 'warning', label: 'Denied' },
  info: { tone: 'info', label: 'Info' },
} as const

function titleOf(record: AuditRecord): string {
  return describeActivity({
    id: record.event_id,
    kind: 'audit',
    occurred_at: record.occurred_at,
    action: record.action,
    outcome: record.outcome,
    actor: null,
    lock: null,
    detail: null,
  }).title
}

function actorName(record: AuditRecord): string {
  if (record.actor) {
    return record.actor.name ?? `Removed user #${record.actor.id}`
  }
  return record.actor_type === 'integration' ? 'Eufy bridge' : record.action.startsWith('auth.') ? 'Not signed in' : 'System'
}

/** Audit logs (project.md 34.6 H): search, filter, inspect and export the append-only audit trail. */
export function AuditLogPage() {
  const me = useCurrentUser()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(FILTERS.map((name) => [name, params.get(name) ?? ''])) as Record<FilterName, string>
  const records = useLoaded((signal) => listAuditLogs(filters as AuditFilters, signal), FILTERS.map((n) => filters[n]).join('|'))
  const locks = useLoaded((signal) => fetchLocks(signal).catch(() => []), 'locks')
  const [inspecting, setInspecting] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const searchTimer = useRef<number | undefined>(undefined)

  function setFilter(name: FilterName, value: string, label?: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) {
          next.set(name, value)
        } else {
          next.delete(name)
        }
        if (label) {
          next.set(`${name}_label`, label)
        } else {
          next.delete(`${name}_label`)
        }
        if (name !== 'page') {
          next.delete('page')
        }
        return next
      },
      { replace: name === 'search' },
    )
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const { blob, filename } = await exportAuditLogs(filters as AuditFilters)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      toast({ tone: 'success', title: 'Export downloaded', message: 'The export has been recorded in the audit log.' })
    } catch (error) {
      toast({ tone: 'danger', title: 'Could not export', message: error instanceof ApiError ? error.message : 'Something went wrong.' })
    } finally {
      setExporting(false)
    }
  }

  const personFilters = (['actor_user_id', 'target_user_id'] as const).filter((name) => filters[name])

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
      cell: (r) => (
        <div>
          <p className="font-medium">{titleOf(r)}</p>
          {r.reason && <p className="max-w-md truncate text-caption text-text-muted">{r.reason}</p>}
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'By',
      cell: (r) =>
        r.actor ? (
          <button type="button" className="text-left hover:underline" onClick={() => setFilter('actor_user_id', String(r.actor!.id), actorName(r))}>
            {actorName(r)}
            <span className="sr-only">, show only events by this person</span>
          </button>
        ) : (
          <span className="text-text-muted">{actorName(r)}</span>
        ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'target',
      header: 'Affecting',
      cell: (r) => (
        <div className="flex flex-col">
          {r.target_user && (
            <button
              type="button"
              className="text-left hover:underline"
              onClick={() => setFilter('target_user_id', String(r.target_user!.id), r.target_user!.name ?? `#${r.target_user!.id}`)}
            >
              {r.target_user.name ?? `Removed user #${r.target_user.id}`}
              <span className="sr-only">, show only events affecting this person</span>
            </button>
          )}
          {r.target_lock && <span className="text-caption text-text-muted">{r.target_lock.name ?? `Removed lock #${r.target_lock.id}`}</span>}
          {!r.target_user && !r.target_lock && <span className="text-text-muted">—</span>}
        </div>
      ),
      className: 'hidden lg:table-cell',
    },
    { key: 'outcome', header: 'Outcome', cell: (r) => <StatusBadge {...outcomeBadge[r.outcome]} /> },
    {
      key: 'inspect',
      header: <span className="sr-only">Details</span>,
      align: 'right',
      cell: (r) => <IconButton icon={Eye} label={`Details of ${titleOf(r)}`} variant="ghost" size="sm" onClick={() => setInspecting(r.event_id)} />,
    },
  ]

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every security-relevant action LockGuard recorded. Records cannot be changed or deleted."
        actions={
          hasAnyPermission(me, ['admin.reports_export']) && (
            <Button variant="secondary" icon={Download} onClick={exportCsv} loading={exporting}>
              Export CSV
            </Button>
          )
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="sm:col-span-2 xl:self-end">
          <SearchField
            label="Search events by action, reason or event ID"
            placeholder="Search action, reason or event ID"
            defaultValue={filters.search}
            onChange={(event) => {
              const value = event.target.value
              window.clearTimeout(searchTimer.current)
              searchTimer.current = window.setTimeout(() => setFilter('search', value.trim()), 300)
            }}
          />
        </div>
        <SelectField
          label="Category"
          value={filters.category}
          onChange={(e) => setFilter('category', e.target.value)}
          options={[
            { value: '', label: 'All categories' },
            { value: 'auth', label: 'Sign-in and identity' },
            { value: 'user', label: 'User administration' },
            { value: 'device', label: 'Devices' },
            { value: 'lock', label: 'Locks and access' },
            { value: 'property', label: 'Properties' },
            { value: 'location', label: 'Location' },
            { value: 'security', label: 'Security center' },
            { value: 'audit', label: 'Audit log use' },
          ]}
        />
        <SelectField
          label="Outcome"
          value={filters.outcome}
          onChange={(e) => setFilter('outcome', e.target.value)}
          options={[
            { value: '', label: 'Any outcome' },
            { value: 'success', label: 'Success' },
            { value: 'failure', label: 'Failed' },
            { value: 'denied', label: 'Denied' },
            { value: 'info', label: 'Info' },
          ]}
        />
        <SelectField
          label="Lock"
          value={filters.target_lock_id}
          onChange={(e) => setFilter('target_lock_id', e.target.value)}
          options={[{ value: '', label: 'Any lock' }, ...(locks.data ?? []).map((l) => ({ value: String(l.id), label: l.name }))]}
        />
        <div className="grid grid-cols-2 gap-3 sm:col-span-2 xl:col-span-6 xl:max-w-xl">
          <TextField label="From" type="datetime-local" value={toLocalInput(filters.from || null)} onChange={(e) => setFilter('from', fromLocalInput(e.target.value) ?? '')} />
          <TextField label="To" type="datetime-local" value={toLocalInput(filters.to || null)} onChange={(e) => setFilter('to', fromLocalInput(e.target.value) ?? '')} />
        </div>
      </div>

      {personFilters.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Filter className="size-4 text-text-muted" aria-hidden />
          {personFilters.map((name) => (
            <span key={name} className="inline-flex items-center gap-1 rounded-full border border-border bg-panel-2 py-0.5 pr-1 pl-3 text-label">
              {name === 'actor_user_id' ? 'By' : 'Affecting'} {params.get(`${name}_label`) ?? `#${filters[name]}`}
              <IconButton icon={X} label={`Remove the ${name === 'actor_user_id' ? 'by' : 'affecting'} filter`} variant="ghost" size="sm" onClick={() => setFilter(name, '')} />
            </span>
          ))}
        </div>
      )}

      {records.error != null && (
        <Banner tone="danger" title="The audit log could not be loaded" className="mb-4" action={<Button variant="secondary" size="sm" onClick={records.reload}>Try again</Button>}>
          {records.error instanceof Error ? records.error.message : 'Something went wrong.'}
        </Banner>
      )}

      <DataTable
        caption={records.data ? `Audit events (${records.data.meta.total})` : 'Audit events'}
        columns={columns}
        rows={records.data?.data ?? []}
        rowKey={(r) => r.event_id}
        loading={records.loading && !records.data}
        empty={<EmptyState icon={ScrollText} title="No events match these filters" />}
      />
      <Pagination className="mt-4" page={records.data?.meta.current_page ?? 1} pageCount={records.data?.meta.last_page ?? 1} onPageChange={(p) => setFilter('page', String(p))} />

      {inspecting && <AuditDetailDialog eventId={inspecting} onClose={() => setInspecting(null)} />}
    </>
  )
}

function AuditDetailDialog({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const record = useLoaded((signal) => getAuditRecord(eventId, signal), eventId)
  const r = record.data

  return (
    <Dialog open onClose={onClose} title={r ? titleOf(r) : 'Audit event'} description={r ? formatAbsolute(r.occurred_at) : undefined} className="max-w-2xl">
      {record.error != null ? (
        <Banner tone="danger" title="This event could not be loaded">
          {record.error instanceof Error ? record.error.message : 'Something went wrong.'}
        </Banner>
      ) : !r ? (
        <LoadingState />
      ) : (
        <dl className="grid gap-x-4 gap-y-2 text-support sm:grid-cols-[10rem_1fr]">
          <Item label="Outcome"><StatusBadge {...outcomeBadge[r.outcome]} /></Item>
          <Item label="Action"><code className="font-mono text-caption">{r.action}</code></Item>
          <Item label="By">{actorName(r)}</Item>
          {r.target_user && (
            <Item label="Affecting user">
              <Link to={`/users/${r.target_user.id}`} className="text-primary-text hover:underline">
                {r.target_user.name ?? `Removed user #${r.target_user.id}`}
              </Link>
            </Item>
          )}
          {r.target_lock && (
            <Item label="Lock">
              <Link to={`/locks/${r.target_lock.id}`} className="text-primary-text hover:underline">
                {r.target_lock.name ?? `Removed lock #${r.target_lock.id}`}
              </Link>
            </Item>
          )}
          {r.reason && <Item label="Reason">{r.reason}</Item>}
          <Item label="From address">{r.ip_address ?? 'Not recorded'}</Item>
          <Item label="Browser or app"><span className="break-all text-caption">{r.user_agent ?? 'Not recorded'}</span></Item>
          {r.correlation_id && <Item label="Correlation ID"><code className="font-mono text-caption break-all">{r.correlation_id}</code></Item>}
          <Item label="Event ID"><code className="font-mono text-caption break-all">{r.event_id}</code></Item>
          <Item label="Details">
            {r.metadata && Object.keys(r.metadata).length > 0 ? (
              <pre className="max-h-64 overflow-auto rounded-md bg-bg p-3 font-mono text-caption whitespace-pre-wrap">{JSON.stringify(r.metadata, null, 2)}</pre>
            ) : (
              'None'
            )}
          </Item>
          <Item label="Record hash">
            <code className="font-mono text-caption break-all">{r.hash}</code>
            <p className="mt-1 text-caption text-text-muted">Each record is chained to the one before it. Check the whole chain with lockguard:audit-verify on the server.</p>
          </Item>
        </dl>
      )}
    </Dialog>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  )
}
