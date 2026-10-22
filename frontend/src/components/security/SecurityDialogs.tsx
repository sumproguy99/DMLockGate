import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../../api/client'
import { getAlert, openIncident, resolveAlert, type AlertSeverity, type SecurityAlert, type SecurityIncident } from '../../api/security'
import { describeResolution, severityBadge, severityOptions } from '../../lib/security'
import { formatAbsolute } from '../../lib/time'
import { useLoaded } from '../../lib/useLoaded'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { SelectField, TextAreaField, TextField } from '../ui/Form'
import { LoadingState } from '../ui/Spinner'
import { StatusBadge } from '../ui/StatusBadge'

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong.'
}

/** Open an incident by hand, optionally for one alert (its title and severity are suggested). */
export function OpenIncidentDialog({ alert, onClose, onOpened }: { alert?: SecurityAlert; onClose: () => void; onOpened: (incident: SecurityIncident) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      const incident = await openIncident({
        title: String(form.get('title') ?? '').trim(),
        severity: String(form.get('severity')) as AlertSeverity,
        description: String(form.get('description') ?? '').trim() || undefined,
        alert_ids: alert ? [alert.id] : undefined,
      })
      onOpened(incident)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'unknown', errorText(caught)))
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={() => !busy && onClose()} title="Open an incident" description={alert ? `For the alert: ${alert.title}` : 'Group related alerts and record how they were handled.'}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField name="title" label="Title" required maxLength={160} defaultValue={alert?.title ?? ''} error={error?.field('title')} disabled={busy} />
        <SelectField name="severity" label="Severity" options={severityOptions} defaultValue={alert?.severity ?? 'medium'} error={error?.field('severity')} disabled={busy} />
        <TextAreaField name="description" label="What is known so far" maxLength={5000} defaultValue={alert?.description ?? ''} disabled={busy} />
        {error && !error.field('title') && (
          <Banner tone="danger" title="The incident was not opened">
            {error.message}
          </Banner>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Open incident
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Resolve an event alert by hand, with an optional note kept in the audit log. */
export function ResolveAlertDialog({ alert, onClose, onResolved }: { alert: SecurityAlert; onClose: () => void; onResolved: (alert: SecurityAlert) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const note = String(new FormData(event.currentTarget).get('note') ?? '').trim()
    setBusy(true)
    setError(null)
    try {
      onResolved(await resolveAlert(alert.id, note || null))
    } catch (caught) {
      setError(errorText(caught))
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={() => !busy && onClose()} title="Resolve this alert" description={alert.title}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextAreaField name="note" label="What was found (optional)" hint="Kept with the alert and in the audit log." maxLength={2000} disabled={busy} />
        {error && (
          <Banner tone="danger" title="The alert was not resolved">
            {error}
          </Banner>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Resolve
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Everything recorded about one alert. */
export function AlertDetailDialog({ alertId, onClose }: { alertId: string; onClose: () => void }) {
  const loaded = useLoaded((signal) => getAlert(alertId, signal), alertId)
  const a = loaded.data

  return (
    <Dialog open onClose={onClose} title={a ? a.title : 'Security alert'} description={a?.rule_label} className="max-w-2xl">
      {loaded.error != null ? (
        <Banner tone="danger" title="This alert could not be loaded">
          {errorText(loaded.error)}
        </Banner>
      ) : !a ? (
        <LoadingState />
      ) : (
        <dl className="grid gap-x-4 gap-y-2 text-support sm:grid-cols-[10rem_1fr]">
          <Item label="Severity">
            <StatusBadge {...severityBadge[a.severity]} />
          </Item>
          <Item label="What happened">{a.description}</Item>
          <Item label="Times seen">{a.occurrences}</Item>
          <Item label="First seen">{formatAbsolute(a.first_seen_at)}</Item>
          <Item label="Last seen">{formatAbsolute(a.last_seen_at)}</Item>
          {a.subject_user && (
            <Item label="Account">
              <Link to={`/users/${a.subject_user.id}`} className="text-primary-text hover:underline">
                {a.subject_user.name ?? `Removed user #${a.subject_user.id}`}
              </Link>
            </Item>
          )}
          {a.subject_lock && (
            <Item label="Lock">
              <Link to={`/locks/${a.subject_lock.id}`} className="text-primary-text hover:underline">
                {a.subject_lock.name ?? `Removed lock #${a.subject_lock.id}`}
              </Link>
            </Item>
          )}
          {a.subject_ip && <Item label="From address">{a.subject_ip}</Item>}
          {a.incident && (
            <Item label="Incident">
              <Link to={`/security/incidents/${a.incident.id}`} className="text-primary-text hover:underline">
                {a.incident.title}
              </Link>
            </Item>
          )}
          {a.acknowledged_at && (
            <Item label="Acknowledged">
              {a.acknowledged_by?.name ?? 'An administrator'}, {formatAbsolute(a.acknowledged_at)}
            </Item>
          )}
          {a.resolved_at && (
            <Item label="Resolved">
              {describeResolution(a)}, {formatAbsolute(a.resolved_at)}
              {a.resolution_note && <p className="mt-1 text-text-muted">{a.resolution_note}</p>}
            </Item>
          )}
          {a.last_event_id && (
            <Item label="Latest event">
              <Link to={`/audit?search=${a.last_event_id}`} className="text-primary-text hover:underline">
                Find it in the audit log
              </Link>
            </Item>
          )}
          {a.context && Object.keys(a.context).length > 0 && (
            <Item label="Details">
              <pre className="max-h-48 overflow-auto rounded-md bg-bg p-3 font-mono text-caption whitespace-pre-wrap">{JSON.stringify(a.context, null, 2)}</pre>
            </Item>
          )}
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
