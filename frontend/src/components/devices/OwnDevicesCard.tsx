import { ShieldCheck } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { fetchOwnDevices, renameOwnDevice, revokeOwnDevice, trustThisDevice } from '../../api/devices'
import { ApiError } from '../../api/client'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { useLoaded } from '../../lib/useLoaded'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { LoadingState } from '../ui/Spinner'
import { useToast } from '../ui/toast-context'
import { DeviceList, type DeviceManager } from './DeviceList'

/**
 * The signed-in person's devices (project.md 34.8 E and H): which are trusted, when each was last
 * used, trusting the device in hand, and revoking or reporting lost the others.
 */
export function OwnDevicesCard({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const toast = useToast()
  const stepUp = useStepUp()
  const load = useCallback((signal: AbortSignal) => fetchOwnDevices(signal), [])
  const devices = useLoaded(load, 'own-devices')
  const [trusting, setTrusting] = useState(false)
  const current = devices.data?.devices.find((d) => d.current) ?? null

  const manager = useMemo<DeviceManager>(
    () => ({
      self: true,
      canRename: () => true,
      canTrust: (d) => d.current && d.status === 'recognized',
      canRevoke: (d) => !d.current,
      rename: (d, name) => renameOwnDevice(d.id, name),
      trust: () => stepUp('Confirm your identity to trust this device.', trustThisDevice),
      revoke: async (d, lost) => (await revokeOwnDevice(d.id, lost)).signedOut,
      onChanged: devices.reload,
    }),
    [stepUp, devices.reload],
  )

  async function trustCurrent() {
    setTrusting(true)
    try {
      await stepUp('Confirm your identity to trust this device.', trustThisDevice)
      devices.reload()
      toast({ tone: 'success', title: 'This device is now trusted' })
    } catch (e) {
      if (!(e instanceof StepUpCancelled)) {
        toast({ tone: 'danger', title: 'This device could not be trusted', message: e instanceof ApiError ? e.message : 'LockGuard could not be reached.' })
      }
    } finally {
      setTrusting(false)
    }
  }

  return (
    <Card
      title="Your devices"
      headingLevel={headingLevel}
      description="The browsers and phones signed in to your account. Revoke one you no longer use; report a lost or stolen one lost."
    >
      {devices.loading && !devices.data ? (
        <LoadingState label="Loading your devices…" />
      ) : !devices.data ? (
        <Banner
          tone="danger"
          title="Your devices could not be loaded"
          action={
            <Button variant="secondary" size="sm" onClick={devices.reload}>
              Try again
            </Button>
          }
        >
          {devices.error instanceof ApiError ? devices.error.message : 'Something went wrong.'}
        </Banner>
      ) : (
        <div className="flex flex-col gap-4">
          {current?.status === 'recognized' && (
            <Banner
              tone={devices.data.unlockRequiresTrusted ? 'warning' : 'info'}
              title="This device is not trusted"
              action={
                <Button size="sm" icon={ShieldCheck} loading={trusting} onClick={() => void trustCurrent()}>
                  Trust this device
                </Button>
              }
            >
              {devices.data.unlockRequiresTrusted
                ? 'Unlocking needs a trusted device. Trust this one if it is yours and you keep it with you.'
                : 'Trust it if it is yours and you keep it with you. Your administrator can require a trusted device for unlocking.'}
            </Banner>
          )}
          <DeviceList devices={devices.data.devices} manager={manager} />
        </div>
      )}
    </Card>
  )
}
