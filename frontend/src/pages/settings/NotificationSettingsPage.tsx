import { Save } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../../api/client'
import {
  getNotificationSettings,
  saveNotificationSettings,
  type AlertEmailDelivery,
  type AlertEmailSeverity,
  type NotificationSettings,
} from '../../api/settings'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { CheckboxField, SelectField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingState } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import type { Tone } from '../../components/ui/tones'
import { useToast } from '../../components/ui/toast-context'
import { severityBadge } from '../../lib/security'
import { useLoaded } from '../../lib/useLoaded'

const SEVERITY_OPTIONS: { value: AlertEmailSeverity; label: string }[] = [
  { value: 'low', label: 'Low and above' },
  { value: 'medium', label: 'Medium and above' },
  { value: 'high', label: 'High and Critical only' },
  { value: 'critical', label: 'Critical only' },
]

const DELIVERY_STATUS: Record<AlertEmailDelivery['status'], { label: string; tone: Tone }> = {
  queued: { label: 'Waiting to send', tone: 'info' },
  retrying: { label: 'Retrying', tone: 'warning' },
  sent: { label: 'Sent', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'unknown' },
}

/**
 * Notification settings (admin.notifications): the limits everyone's own preferences work within,
 * and the latest alert emails with how their delivery went.
 */
export function NotificationSettingsPage() {
  const settings = useLoaded(getNotificationSettings, 'notification-settings')

  return (
    <>
      <PageHeader
        title="Notification settings"
        description="Decide which alerts are emailed and which notifications nobody can turn off. Each person chooses the rest under Notifications > Preferences."
      />
      {settings.data ? (
        <div className="flex flex-col gap-6">
          <LimitsForm key={settings.data.updated_at ?? 'new'} settings={settings.data} onSaved={settings.reload} />
          <Deliveries settings={settings.data} onReload={settings.reload} />
          <Retention days={settings.data.retention_days} />
        </div>
      ) : settings.error != null ? (
        <Banner tone="danger" title="Notification settings could not be loaded" action={<Button variant="secondary" size="sm" onClick={settings.reload}>Try again</Button>}>
          {settings.error instanceof ApiError ? settings.error.message : null}
        </Banner>
      ) : (
        <LoadingState label="Loading notification settings…" />
      )}
    </>
  )
}

function LimitsForm({ settings, onSaved }: { settings: NotificationSettings; onSaved: () => void }) {
  const toast = useToast()
  const withStepUp = useStepUp()
  const [emailEnabled, setEmailEnabled] = useState(settings.email_enabled)
  const [minSeverity, setMinSeverity] = useState<AlertEmailSeverity>(settings.email_min_severity)
  const [required, setRequired] = useState<string[]>(settings.required_categories)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await withStepUp('change the notification settings', () =>
        saveNotificationSettings({ email_enabled: emailEnabled, email_min_severity: minSeverity, required_categories: required }),
      )
      toast({ tone: 'success', title: 'Notification settings saved' })
      onSaved()
    } catch (caught) {
      setBusy(false)
      if (!(caught instanceof StepUpCancelled)) {
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.')
      }
    }
  }

  const retry = settings.retry
  const waits = retry.backoff_seconds.map((seconds) => (seconds >= 60 ? `${seconds / 60} min` : `${seconds} s`)).join(', then ')

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      {error && <Banner tone="danger" title="Could not save">{error}</Banner>}
      {!settings.mail_configured && (
        <Banner tone="warning" title="Email is not set up" live="none">
          Alert emails use <Link to="/settings/email" className="font-semibold text-primary-text underline">Email settings</Link>. Until they are saved and
          turned on, emails use the server's own mail setting ({settings.fallback_mailer === 'log' ? 'log only: never delivered' : settings.fallback_mailer}).
        </Banner>
      )}

      <Card
        title="Alert emails"
        description={
          settings.updated_at ? (
            <>
              Last changed <Timestamp iso={settings.updated_at} />
              {settings.updated_by ? ` by ${settings.updated_by}` : ''}.
            </>
          ) : (
            'Using the defaults.'
          )
        }
      >
        <div className="flex flex-col gap-4">
          <CheckboxField
            label="Email security alerts"
            hint="Turned off, nobody gets alert emails, including the High and Critical ones always sent to incident handlers. Alerts still appear in LockGuard."
            checked={emailEnabled}
            onChange={(event) => setEmailEnabled(event.target.checked)}
          />
          <SelectField
            label="Email alerts of"
            name="email_min_severity"
            options={SEVERITY_OPTIONS}
            value={minSeverity}
            disabled={!emailEnabled}
            hint="Less serious alerts appear in LockGuard only. A higher setting means fewer emails."
            onChange={(event) => setMinSeverity(event.target.value as AlertEmailSeverity)}
            className="max-w-sm"
          />
          <p className="text-caption text-text-muted">
            A failed email is tried {retry.tries} times in all, waiting {waits} between tries. Every final failure is written to the audit log.
          </p>
        </div>
      </Card>

      <Card
        title="Always shown in LockGuard"
        description="People cannot turn these off in the app. They can still choose whether they are emailed. People who handle incidents always see every security alert."
      >
        <div className="flex flex-col gap-1">
          {settings.categories.map((category) => (
            <CheckboxField
              key={category.category}
              label={category.label}
              hint={category.description}
              checked={required.includes(category.category)}
              onChange={(event) =>
                setRequired((current) =>
                  event.target.checked ? [...current, category.category] : current.filter((key) => key !== category.category),
                )
              }
            />
          ))}
        </div>
      </Card>

      <div>
        <Button type="submit" icon={Save} loading={busy}>
          Save notification settings
        </Button>
      </div>
    </form>
  )
}

function Deliveries({ settings, onReload }: { settings: NotificationSettings; onReload: () => void }) {
  const columns: Column<AlertEmailDelivery>[] = [
    {
      key: 'when',
      header: 'Queued',
      cell: (row) => <Timestamp iso={row.created_at} />,
      className: 'whitespace-nowrap',
    },
    {
      key: 'alert',
      header: 'Alert',
      cell: (row) => {
        const severity = severityBadge[row.severity] ?? severityBadge.info
        return (
          <div className="flex flex-col gap-1">
            <StatusBadge tone={severity.tone} label={severity.label} />
            <span>{row.title}</span>
          </div>
        )
      },
    },
    {
      key: 'to',
      header: 'To',
      cell: (row) => (
        <div className="flex flex-col">
          <span>{row.user ?? 'Removed account'}</span>
          <span className="text-caption text-text-muted">{row.recipient}</span>
          {row.mandatory && <span className="text-caption text-text-muted">Incident handler</span>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Delivery',
      cell: (row) => {
        const status = DELIVERY_STATUS[row.status]
        const notDelivered = row.status === 'sent' && (row.mailer === 'log' || row.mailer === 'array')
        return (
          <div className="flex flex-col gap-1">
            <StatusBadge tone={notDelivered ? 'warning' : status.tone} label={notDelivered ? 'Written to the log only' : status.label} />
            <span className="text-caption text-text-muted">
              {row.attempts === 1 ? '1 try' : `${row.attempts} tries`}
              {row.sent_at && (
                <>
                  , sent <Timestamp iso={row.sent_at} />
                </>
              )}
            </span>
            {row.last_error && <span className="text-caption text-danger-text">{row.last_error}</span>}
          </div>
        )
      },
    },
  ]

  return (
    <Card
      title="Recent alert emails"
      description="The latest 25, newest first."
      actions={
        <Button variant="secondary" size="sm" onClick={onReload}>
          Refresh
        </Button>
      }
    >
      <DataTable
        caption="Recent alert emails"
        captionHidden
        columns={columns}
        rows={settings.recent_deliveries}
        rowKey={(row) => row.id}
        empty="No alert emails yet."
      />
    </Card>
  )
}

const retentionRows: Array<{ key: keyof NotificationSettings['retention_days']; label: string }> = [
  { key: 'resolved_alerts_days', label: 'Resolved alerts' },
  { key: 'closed_incidents_days', label: 'Closed incidents, with their timeline' },
  { key: 'read_notifications_days', label: 'Read notifications' },
  { key: 'unread_notifications_days', label: 'Unread notifications' },
  { key: 'deliveries_days', label: 'Alert email log' },
]

function keptFor(days: number): string {
  return days > 0 ? `${days} days` : 'Kept for ever'
}

/** Read-only: how long the daily cleanup keeps finished records. Changed in the server's .env. */
function Retention({ days }: { days: NotificationSettings['retention_days'] }) {
  return (
    <Card
      title="How long records are kept"
      description="A daily cleanup deletes finished records older than this. Open alerts, incidents that are not closed, and the audit log are never deleted. Changed on the server (LOCKGUARD_RETENTION_* in .env)."
    >
      <dl className="flex flex-col gap-2 text-support">
        {retentionRows.map(({ key, label }) => (
          <div key={key} className="flex flex-wrap justify-between gap-2">
            <dt className="text-text-muted">{label}</dt>
            <dd className="font-semibold">{keptFor(days[key])}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-caption text-text-muted">An alert that belongs to an incident is kept as long as the incident.</p>
    </Card>
  )
}
