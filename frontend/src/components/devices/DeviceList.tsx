import { MonitorSmartphone, MoreVertical, Pencil, ShieldCheck, ShieldOff, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Device, SignedOut } from '../../api/devices'
import { ApiError } from '../../api/client'
import { StepUpCancelled } from '../../app/step-up-context'
import { deviceStatusBadge, revokeConsequence } from '../../lib/devices'
import { Timestamp } from '../status/Timestamp'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Dialog } from '../ui/Dialog'
import { TextField } from '../ui/Form'
import { Menu, type MenuItem } from '../ui/Menu'
import { ReasonDialog } from '../ui/ReasonDialog'
import { StatusBadge } from '../ui/StatusBadge'
import { useToast } from '../ui/toast-context'

/**
 * What may be done to the devices in a list, and how. The backend decides; these only decide which
 * actions are offered. `self` lists are the signed-in person's own devices: revoking needs no
 * reason there, and the device in hand cannot be revoked.
 */
export type DeviceManager = {
  self: boolean
  canRename: (device: Device) => boolean
  canTrust: (device: Device) => boolean
  canRevoke: (device: Device) => boolean
  rename: (device: Device, name: string) => Promise<unknown>
  trust: (device: Device) => Promise<unknown>
  revoke: (device: Device, lost: boolean, reason: string | null) => Promise<SignedOut | null>
  onChanged: () => void
}

type Pending = { kind: 'rename' | 'trust' | 'revoke' | 'lost'; device: Device }

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : 'LockGuard could not be reached. Try again.'
}

/** A list of devices with their trust status, last use and, where allowed, their actions. */
export function DeviceList({ devices, manager, showOwner = false }: { devices: Device[]; manager?: DeviceManager; showOwner?: boolean }) {
  const toast = useToast()
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function open(kind: Pending['kind'], device: Device) {
    setError(null)
    setPending({ kind, device })
  }

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setError(null)
    try {
      const message = await action()
      setPending(null)
      manager?.onChanged()
      toast({ tone: 'success', title: message })
    } catch (e) {
      if (!(e instanceof StepUpCancelled)) {
        setError(errorText(e))
      }
    } finally {
      setBusy(false)
    }
  }

  function revoke(lost: boolean, reason: string | null) {
    if (!manager || !pending) {
      return
    }
    const device = pending.device
    void run(async () => {
      const signedOut = await manager.revoke(device, lost, reason)
      if (signedOut) {
        const count = signedOut.browser_logins + signedOut.api_clients
        return `${device.name} reported lost. ${count} sign-in${count === 1 ? '' : 's'} ended.`
      }
      return `${device.name} revoked`
    })
  }

  return (
    <>
      <ul className="-my-2 divide-y divide-border">
        {devices.map((device) => (
          <DeviceItem key={device.id} device={device} showOwner={showOwner} actions={manager ? actionsFor(device, manager, open) : []} />
        ))}
      </ul>

      {manager && pending?.kind === 'rename' && (
        <RenameDialog
          device={pending.device}
          busy={busy}
          error={error}
          onCancel={() => setPending(null)}
          onConfirm={(name) => void run(async () => (await manager.rename(pending.device, name), 'Device renamed'))}
        />
      )}
      <ConfirmDialog
        open={pending?.kind === 'trust'}
        title={manager?.self ? 'Trust this device?' : `Trust “${pending?.device.name}”?`}
        consequence={
          manager?.self
            ? 'Mark the device you are using now as yours. Only trust a device you keep with you, such as your own phone. You will be asked to confirm your identity.'
            : 'Mark this device as one the person keeps with them. Trusted devices can unlock when unlocking is limited to trusted devices.'
        }
        confirmLabel="Trust device"
        busy={busy}
        error={error}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && manager && void run(async () => (await manager.trust(pending.device), 'Device trusted'))}
      />
      {manager?.self ? (
        <ConfirmDialog
          open={pending?.kind === 'revoke' || pending?.kind === 'lost'}
          title={pending?.kind === 'lost' ? `Report “${pending.device.name}” lost?` : `Revoke “${pending?.device.name}”?`}
          consequence={pending ? revokeConsequence(pending.device, pending.kind === 'lost', true) : ''}
          confirmLabel={pending?.kind === 'lost' ? 'Report lost' : 'Revoke device'}
          tone="danger"
          busy={busy}
          error={error}
          onCancel={() => setPending(null)}
          onConfirm={() => revoke(pending?.kind === 'lost', null)}
        />
      ) : (
        <ReasonDialog
          open={pending?.kind === 'revoke' || pending?.kind === 'lost'}
          title={pending?.kind === 'lost' ? `Report “${pending.device.name}” lost?` : `Revoke “${pending?.device.name}”?`}
          consequence={pending ? revokeConsequence(pending.device, pending.kind === 'lost', false) : ''}
          confirmLabel={pending?.kind === 'lost' ? 'Report lost' : 'Revoke device'}
          tone="danger"
          busy={busy}
          error={error}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => revoke(pending?.kind === 'lost', reason)}
        />
      )}
    </>
  )
}

function actionsFor(device: Device, manager: DeviceManager, open: (kind: Pending['kind'], device: Device) => void): MenuItem[] {
  if (device.status === 'revoked') {
    return []
  }
  const items: MenuItem[] = []
  if (manager.canRename(device)) {
    items.push({ label: 'Rename', icon: Pencil, onSelect: () => open('rename', device) })
  }
  if (manager.canTrust(device)) {
    items.push({ label: 'Trust', icon: ShieldCheck, onSelect: () => open('trust', device) })
  }
  if (manager.canRevoke(device)) {
    items.push({ label: 'Revoke', icon: ShieldOff, danger: true, onSelect: () => open('revoke', device) })
    items.push({ label: 'Report lost', icon: TriangleAlert, danger: true, onSelect: () => open('lost', device) })
  }
  return items
}

function DeviceItem({ device, showOwner, actions }: { device: Device; showOwner: boolean; actions: MenuItem[] }) {
  const badge = deviceStatusBadge[device.status]

  return (
    <li className="flex gap-3 py-3">
      <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-text-muted" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-support font-medium break-words">{device.name}</span>
          <StatusBadge tone={badge.tone} label={badge.label} />
          {device.current && <StatusBadge tone="info" label="This device" />}
          {device.reported_lost && <StatusBadge tone="danger" label="Reported lost" />}
        </div>
        {showOwner && device.user && (
          <p className="text-caption text-text-muted">
            {device.user.name} · {device.user.email}
          </p>
        )}
        <p className="text-caption text-text-muted">
          {device.status === 'revoked' ? 'Last used' : 'Active'} <Timestamp iso={device.last_seen_at} />
          {device.last_ip_address && ` · ${device.last_ip_address}`}
          {device.browser && device.browser !== device.name && ` · ${device.browser}`}
        </p>
        {device.status === 'trusted' && device.trusted_at && (
          <p className="text-caption text-text-muted">
            Trusted by {device.trusted_by?.name ?? 'someone'} <Timestamp iso={device.trusted_at} />
          </p>
        )}
        {device.status === 'revoked' && device.revoked_at && (
          <p className="text-caption text-text-muted">
            Revoked by {device.revoked_by?.name ?? 'someone'} <Timestamp iso={device.revoked_at} />
            {device.revoke_reason && `: ${device.revoke_reason}`}
          </p>
        )}
      </div>
      {actions.length > 0 && <Menu label={`Actions for ${device.name}`} icon={MoreVertical} iconOnly items={actions} />}
    </li>
  )
}

function RenameDialog({
  device,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  device: Device
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  const [fieldError, setFieldError] = useState<string | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    if (name === '') {
      setFieldError('Give the device a name.')
      return
    }
    setFieldError(null)
    onConfirm(name)
  }

  return (
    <Dialog open title={`Rename “${device.name}”`} description="A name that tells you which device this is, such as “My phone” or “Kitchen tablet”." onClose={() => !busy && onCancel()}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField name="name" label="Name" defaultValue={device.name} maxLength={80} error={fieldError} required disabled={busy} />
        {error && (
          <Banner tone="danger" title="That did not work">
            {error}
          </Banner>
        )}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save name
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
