import { ArrowLeft, History } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../../api/client'
import { changeIncidentStatus, getIncident, type IncidentStatus, type SecurityIncident } from '../../api/security'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { AlertCard } from '../../components/security/AlertCard'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { SelectField, TextAreaField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingState } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useToast } from '../../components/ui/toast-context'
import { incidentStatusBadge, incidentStatuses, severityBadge } from '../../lib/security'
import { formatAbsolute } from '../../lib/time'
import { useLoaded } from '../../lib/useLoaded'

/**
 * One incident: what it is about, its alerts, the full history of status changes with who made each
 * one, and (for incident handlers) moving it through the lifecycle. A closed incident is final.
 */
export function IncidentDetailPage() {
  const { id = '' } = useParams()
  const me = useCurrentUser()
  const incident = useLoaded((signal) => getIncident(id, signal), id)
  const [current, setCurrent] = useState<SecurityIncident | null>(null)
  const shown = current?.id === id ? current : incident.data
  const canManage = hasAnyPermission(me, ['admin.incidents_manage'])

  if (incident.error != null && !shown) {
    const notFound = incident.error instanceof ApiError && incident.error.status === 404
    return (
      <>
        <PageHeader title={notFound ? 'Incident not found' : 'Incident'} />
        <Banner tone="danger" title={notFound ? 'There is no incident at this address' : 'This incident could not be loaded'}>
          {notFound ? (
            <Link to="/security?tab=incidents" className="text-primary-text hover:underline">
              Back to incidents
            </Link>
          ) : incident.error instanceof Error ? (
            incident.error.message
          ) : (
            'Something went wrong.'
          )}
        </Banner>
      </>
    )
  }

  if (!shown) {
    return <LoadingState label="Loading the incident…" />
  }

  return (
    <>
      <Link to="/security?tab=incidents" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-label font-semibold text-primary-text hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        All incidents
      </Link>
      <PageHeader title={shown.title} description={shown.description ?? undefined} />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-support">
        <StatusBadge {...severityBadge[shown.severity]} />
        <StatusBadge {...incidentStatusBadge[shown.status]} />
        <span className="text-text-muted">
          Opened {shown.opened_by ? `by ${shown.opened_by.name ?? 'a removed user'}` : 'by the alert engine'} <Timestamp iso={shown.opened_at} />
        </span>
        {shown.closed_at && <span className="text-text-muted">Closed {formatAbsolute(shown.closed_at)}</span>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title={`Alerts (${shown.alerts?.length ?? 0})`}>
            {(shown.alerts ?? []).length === 0 ? (
              <EmptyState title="No alerts are attached" description="This incident was opened by hand." />
            ) : (
              <ul className="flex flex-col gap-3">
                {shown.alerts!.map((alert) => (
                  <li key={alert.id}>
                    <AlertCard
                      alert={alert}
                      showIncident={false}
                      actions={
                        <Link to={`/security?alert=${alert.id}&status=all`} className="text-label font-semibold text-primary-text hover:underline">
                          Details<span className="sr-only">: {alert.title}</span>
                        </Link>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="History">
            <ol className="flex flex-col gap-3">
              {(shown.history ?? []).map((entry, index) => (
                <li key={index} className="flex gap-3">
                  <History className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-support">
                      <span className="font-medium">{entry.actor ? (entry.actor.name ?? 'A removed user') : 'Alert engine'}</span>
                      {entry.to_status && (
                        <>
                          {' '}
                          {entry.from_status ? `changed the status from ${incidentStatusBadge[entry.from_status].label} to` : 'opened it as'}{' '}
                          <span className="font-medium">{incidentStatusBadge[entry.to_status].label}</span>
                        </>
                      )}
                    </p>
                    {entry.note && <p className="text-support text-text-muted">{entry.note}</p>}
                    <p className="text-caption text-text-muted" title={formatAbsolute(entry.at)}>
                      <Timestamp iso={entry.at} />
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {canManage && <StatusCard incident={shown} onChanged={setCurrent} />}
      </div>
    </>
  )
}

function StatusCard({ incident, onChanged }: { incident: SecurityIncident; onChanged: (incident: SecurityIncident) => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const options = incidentStatuses.filter((s) => s !== incident.status)

  if (incident.status === 'closed') {
    return (
      <Card title="Status">
        <p className="text-support text-text-muted">This incident is closed and can no longer change. If the problem comes back, open a new incident.</p>
      </Card>
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const status = String(form.get('status')) as IncidentStatus
    const note = String(form.get('note') ?? '').trim()
    setBusy(true)
    setError(null)
    try {
      const updated = await changeIncidentStatus(incident.id, status, note || null)
      onChanged(updated)
      formElement.reset()
      toast({ tone: 'success', title: `Incident ${incidentStatusBadge[status].label.toLowerCase()}`, message: 'Recorded in its history and the audit log.' })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Change status" description="Each change is kept in the history with your name.">
      <form key={incident.status} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <SelectField
          name="status"
          label="New status"
          options={options.map((s) => ({ value: s, label: incidentStatusBadge[s].label }))}
          defaultValue={options[0]}
          hint="Resolving or closing also resolves its alerts, except those that clear themselves. Closing is final."
          disabled={busy}
        />
        <TextAreaField name="note" label="Note (optional)" maxLength={2000} disabled={busy} />
        {error && (
          <Banner tone="danger" title="The status was not changed">
            {error}
          </Banner>
        )}
        <Button type="submit" loading={busy}>
          Save status
        </Button>
      </form>
    </Card>
  )
}
