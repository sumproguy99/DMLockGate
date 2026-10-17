import { Lock, LockOpen, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { BrandLogo } from './components/brand/BrandLogo'
import { ActivityEntry } from './components/status/ActivityEntry'
import { CommandProgress } from './components/status/CommandProgress'
import { DeviceStatus } from './components/status/DeviceStatus'
import { LockStateBadge, LockStatusDisplay } from './components/status/LockStatus'
import { SecurityAlert } from './components/status/SecurityAlert'
import { Banner } from './components/ui/Banner'
import { Button, IconButton } from './components/ui/Button'
import { Card, Metric } from './components/ui/Card'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { DataTable } from './components/ui/DataTable'
import { Dialog } from './components/ui/Dialog'
import { EmptyState } from './components/ui/EmptyState'
import { CheckboxField, SearchField, SelectField, TextField } from './components/ui/Form'
import { Menu } from './components/ui/Menu'
import { Pagination } from './components/ui/Pagination'
import { LoadingState } from './components/ui/Spinner'
import { StatusBadge } from './components/ui/StatusBadge'
import { Tabs } from './components/ui/Tabs'
import { useToast } from './components/ui/toast-context'
import { Tooltip } from './components/ui/Tooltip'
import type { AccessRequestStatus } from './lib/lockguard'

/**
 * UI checkpoint 2: a development gallery of the shared components. Every value on this page is an
 * example typed into this file, not live data. Replaced by the application shell at UI checkpoint 3.
 */

const now = new Date()
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()

const exampleRows = [
  { id: 1, name: 'Example lock A', state: 'locked', freshness: 'current' },
  { id: 2, name: 'Example lock B', state: 'unlocked', freshness: 'stale' },
  { id: 3, name: 'Example lock C', state: 'unknown', freshness: 'unknown' },
] as const

const lifecycle: Array<[AccessRequestStatus, boolean, string]> = [
  ['queued', false, 'Approved. Sending to the lock.'],
  ['submitted', true, 'Sent. Waiting for the lock to report its new state.'],
  ['confirmed_success', true, 'Confirmed by the lock.'],
  ['unknown_result', true, 'The lock did not confirm in time. Check the door before trying again.'],
]

export default function App() {
  const toast = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [phraseOpen, setPhraseOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1)
  const [nameError, setNameError] = useState<string | null>(null)

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = new FormData(event.currentTarget).get('name')
    if (!name) {
      setNameError('Enter a display name.')
      return
    }
    setNameError(null)
    toast({ tone: 'success', title: 'Example saved', message: 'Nothing was sent anywhere.' })
  }

  function confirmRevoke() {
    setBusy(true)
    setTimeout(() => {
      setBusy(false)
      setConfirmOpen(false)
      toast({ tone: 'success', title: 'Example confirmed' })
    }, 1200)
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8">
      <Banner tone="warning" title="Development preview (UI checkpoint 2)" live="none">
        Shared components with example values typed into the page. No live data is shown and no button reaches a lock.
      </Banner>

      <header className="flex flex-wrap items-center gap-6">
        <BrandLogo variant="mark" className="size-16" />
        <div>
          <h1 className="text-page-title">DM LockGuard components</h1>
          <p className="text-support text-text-muted">Secure access. Total control.</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Buttons" description="Every button does something on this page.">
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={Lock} onClick={() => toast({ tone: 'info', title: 'Primary pressed' })}>
              Primary
            </Button>
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              Open dialog
            </Button>
            <Button variant="danger" icon={Trash2} onClick={() => setConfirmOpen(true)}>
              Confirm (danger)
            </Button>
            <Button variant="ghost" onClick={() => setPhraseOpen(true)}>
              Typed confirmation
            </Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <Tooltip content="Icon buttons always have a name">
              <IconButton icon={RefreshCw} label="Refresh" onClick={() => toast({ tone: 'info', title: 'Refreshed' })} />
            </Tooltip>
            <Menu
              label="More actions"
              icon={MoreHorizontal}
              iconOnly
              items={[
                { label: 'Rename', icon: Pencil, onSelect: () => toast({ tone: 'info', title: 'Rename chosen' }) },
                { label: 'Not available', onSelect: () => {}, disabled: true },
                { label: 'Remove', icon: Trash2, danger: true, onSelect: () => setConfirmOpen(true) },
              ]}
            />
          </div>
        </Card>

        <Card title="Status badges" description="Color, icon and text together.">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="success" label="Confirmed" />
            <StatusBadge tone="warning" label="Degraded" />
            <StatusBadge tone="danger" label="Failed" />
            <StatusBadge tone="unknown" label="Unknown" />
            <StatusBadge tone="info" label="In progress" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <LockStateBadge state="locked" freshness="current" />
            <LockStateBadge state="unlocked" freshness="current" />
            <LockStateBadge state="jammed" freshness="current" />
            <LockStateBadge state="locked" freshness="stale" />
            <LockStateBadge state="unknown" freshness="unknown" />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Lock status" description="Example values">
          <div className="flex flex-col gap-5">
            <LockStatusDisplay state="locked" freshness="current" observedAt={minutesAgo(2)} />
            <LockStatusDisplay state="unlocked" freshness="stale" observedAt={minutesAgo(180)} />
            <LockStatusDisplay state="unknown" freshness="unknown" observedAt={null} />
          </div>
        </Card>
        <Card title="Device status" description="Example values">
          <div className="flex flex-col gap-4">
            <DeviceStatus connection="connected" batteryLevel={88} lastCommunicationAt={minutesAgo(1)} />
            <DeviceStatus connection="degraded" batteryLevel={22} lastCommunicationAt={minutesAgo(20)} />
            <DeviceStatus connection="disconnected" batteryLevel={null} lastCommunicationAt={null} />
          </div>
        </Card>
        <Card title="Metrics" description="On real pages these come from the API">
          <div className="grid grid-cols-2 gap-4">
            <Metric label="Example" value="3" detail="Example detail" />
            <Metric label="Example" value="—" detail="Not reported" />
          </div>
        </Card>
      </div>

      <Card title="Command lifecycle" description="Each stage is shown separately. Only the lock's own report counts as confirmed.">
        <div className="flex flex-col gap-6">
          {lifecycle.map(([status, responded, message]) => (
            <CommandProgress key={status} status={status} integrationResponded={responded} message={message} />
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Banners">
          <div className="flex flex-col gap-3">
            <Banner tone="danger" title="Integration unavailable" live="none" action={<Button size="sm" variant="secondary" icon={RefreshCw}>Retry</Button>}>
              Example: the lock service did not respond.
            </Banner>
            <Banner tone="warning" title="Degraded" live="none">
              Example: readings may be out of date.
            </Banner>
            <Banner tone="success" title="Confirmed" live="none" />
            <Banner tone="unknown" title="Stale information" live="none" />
          </div>
        </Card>
        <Card title="Alerts and activity" description="Example values">
          <div className="flex flex-col gap-3">
            <SecurityAlert severity="critical" title="Example critical alert" description="Example description." at={minutesAgo(4)} actions={<Button size="sm" variant="secondary">Acknowledge</Button>} />
            <SecurityAlert severity="warning" title="Example warning" at={minutesAgo(90)} />
          </div>
          <ul className="mt-2 divide-y divide-border">
            <ActivityEntry tone="success" icon={Lock} title="Example lock A locked" actor="Example user" at={minutesAgo(3)} />
            <ActivityEntry tone="warning" icon={LockOpen} title="Example lock B unlocked" actor="Example user" detail="Remote, step-up confirmed" at={minutesAgo(45)} />
            <ActivityEntry tone="danger" title="Example request denied" detail="Outside the access schedule" at={minutesAgo(600)} />
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Form fields">
          <form onSubmit={submitForm} noValidate className="flex flex-col gap-4">
            <TextField name="name" label="Display name" hint="Submit it empty to see validation." error={nameError} required />
            <SelectField
              label="Role"
              placeholder="Choose a role"
              options={[
                { value: 'admin', label: 'Administrator' },
                { value: 'member', label: 'Member' },
              ]}
            />
            <CheckboxField label="Example option" hint="Hints sit under the control." />
            <TextField label="Disabled field" disabled value="Not editable" readOnly />
            <div>
              <Button type="submit" icon={Plus}>
                Save example
              </Button>
            </div>
          </form>
        </Card>
        <Card title="Tabs">
          <Tabs
            label="Example tabs"
            tabs={[
              { id: 'one', label: 'Overview', content: <EmptyState title="Nothing here yet" description="Empty states say why and what to do next." /> },
              { id: 'two', label: 'Activity', content: <LoadingState label="Loading example…" /> },
              { id: 'three', label: 'Settings', content: <p className="text-support text-text-muted">Use the arrow keys to move between tabs.</p> },
            ]}
          />
        </Card>
      </div>

      <Card title="Table" actions={<SearchField label="Search examples" placeholder="Search" className="w-56" />}>
        <DataTable
          caption="Example locks"
          captionHidden
          rowKey={(row) => row.id}
          rows={exampleRows}
          columns={[
            { key: 'name', header: 'Lock', cell: (row) => <span className="font-medium">{row.name}</span> },
            { key: 'state', header: 'Reported state', cell: (row) => <LockStateBadge state={row.state} freshness={row.freshness} /> },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              cell: (row) => (
                <Menu
                  label={`Actions for ${row.name}`}
                  icon={MoreHorizontal}
                  iconOnly
                  items={[{ label: 'Rename', icon: Pencil, onSelect: () => toast({ tone: 'info', title: `Rename ${row.name}` }) }]}
                />
              ),
            },
          ]}
        />
        <Pagination page={page} pageCount={3} onPageChange={setPage} className="mt-4" />
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Example dialog"
        description="Focus stays inside until it closes. Escape closes it."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setDialogOpen(false)}>Done</Button>
          </>
        }
      >
        <TextField label="Example field" />
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title="Revoke example access?"
        consequence="Example: this person would no longer be able to lock or unlock this example lock."
        confirmLabel="Revoke access"
        tone="danger"
        busy={busy}
        onConfirm={confirmRevoke}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={phraseOpen}
        title="Typed confirmation example"
        consequence="The highest-impact actions ask for an exact phrase."
        confirmLabel="Confirm"
        tone="danger"
        confirmPhrase="CONFIRM"
        onConfirm={() => {
          setPhraseOpen(false)
          toast({ tone: 'success', title: 'Phrase matched' })
        }}
        onCancel={() => setPhraseOpen(false)}
      />
    </main>
  )
}
