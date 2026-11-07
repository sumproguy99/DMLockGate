import { KeyRound } from 'lucide-react'
import { useCallback, useState } from 'react'
import { createRegistrationCode, fetchUserDevices } from '../../api/devices'
import { ApiError } from '../../api/client'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { useLoaded } from '../../lib/useLoaded'
import { formatAbsolute } from '../../lib/time'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Dialog } from '../ui/Dialog'
import { LoadingState } from '../ui/Spinner'
import { useToast } from '../ui/toast-context'
import { DeviceList } from './DeviceList'
import { useAdminDeviceManager } from './useAdminDeviceManager'

/**
 * One person's devices on their user page, for holders of devices.view. When the person is bound
 * to one device, holders of devices.enroll can create the registration code for it here.
 */
export function UserDevicesCard({ userId, name }: { userId: number; name: string }) {
  const me = useCurrentUser()
  const stepUp = useStepUp()
  const toast = useToast()
  const load = useCallback((signal: AbortSignal) => fetchUserDevices(userId, signal), [userId])
  const devices = useLoaded(load, `user-devices-${userId}`)
  const manager = useAdminDeviceManager(devices.reload, userId)
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<{ code: string; expires_at: string } | null>(null)

  const bound = devices.data?.bound ?? false
  const registered = devices.data?.devices.find((d) => d.status !== 'revoked' && d.registered_at !== null) ?? null
  const canCreate = bound && me.id !== userId && hasAnyPermission(me, ['devices.enroll'])

  async function createCode() {
    setCreating(true)
    try {
      const result = await stepUp(`Confirm your identity to create a registration code for ${name}.`, () => createRegistrationCode(userId))
      setIssued(result)
      devices.reload()
    } catch (e) {
      if (!(e instanceof StepUpCancelled)) {
        toast({ tone: 'danger', title: 'The code could not be created', message: e instanceof ApiError ? e.message : 'LockGuard could not be reached.' })
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <Card
      title="Devices"
      description={`The browsers and phones ${name} has signed in from.`}
      actions={
        canCreate && (
          <Button variant="secondary" size="sm" icon={KeyRound} loading={creating} onClick={() => void createCode()}>
            {registered ? 'Register a new device' : 'Create registration code'}
          </Button>
        )
      }
    >
      {devices.loading && !devices.data ? (
        <LoadingState label="Loading devices…" />
      ) : !devices.data ? (
        <Banner tone="danger" title="Devices could not be loaded">
          {devices.error instanceof ApiError ? devices.error.message : 'Something went wrong.'}
        </Banner>
      ) : (
        <div className="flex flex-col gap-4">
          {bound && (
            <Banner tone={registered ? 'info' : 'warning'} title={registered ? `Bound to ${registered.name}` : 'No registered device'}>
              {registered
                ? `${name} can only use LockGuard on this device. A new registration code moves them to another device and stops this one working.`
                : `${name} can only use LockGuard on a device registered with a one-time code, and has none yet.`}
              {devices.data.registrationCodeExpiresAt && ` An unused code is waiting, valid until ${formatAbsolute(devices.data.registrationCodeExpiresAt)}.`}
            </Banner>
          )}
          {devices.data.devices.length === 0 ? (
            <p className="text-support text-text-muted">
              {bound ? 'No devices yet.' : 'No devices yet. One is recorded the next time they sign in.'}
            </p>
          ) : (
            <DeviceList devices={devices.data.devices} manager={manager} />
          )}
        </div>
      )}
      <Dialog
        open={issued !== null}
        onClose={() => setIssued(null)}
        title="Registration code"
        description={`Give this code to ${name}. It is shown only now.`}
        footer={<Button onClick={() => setIssued(null)}>Done</Button>}
      >
        {issued && (
          <div className="flex flex-col gap-3">
            <p className="rounded-md border border-border bg-bg px-4 py-3 text-center font-mono text-section tracking-widest" aria-label={`Code ${issued.code.split('').join(' ')}`}>
              {issued.code}
            </p>
            <p className="text-support text-text-muted">
              On the sign-in screen of the device they will use, they enter their email, password and this code. It works once,
              until {formatAbsolute(issued.expires_at)}. That device becomes the only one their account works on; any earlier
              device stops working, and any earlier unused code no longer works.
            </p>
          </div>
        )}
      </Dialog>
    </Card>
  )
}
