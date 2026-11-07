import { useMemo } from 'react'
import { renameDevice, revokeDevice, trustDevice, type Device } from '../../api/devices'
import { useStepUp } from '../../app/step-up-context'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import type { DeviceManager } from './DeviceList'

/**
 * Actions on other people's devices, offered by the administrator's own permissions. Their own
 * devices are managed under Your devices instead, as the backend requires. ownerId says whose
 * devices these are, for lists that do not include each device's owner.
 */
export function useAdminDeviceManager(onChanged: () => void, ownerId?: number): DeviceManager {
  const me = useCurrentUser()
  const stepUp = useStepUp()

  return useMemo<DeviceManager>(() => {
    const someoneElses = (device: Device) => (device.user?.id ?? ownerId) !== me.id
    return {
      self: false,
      canRename: (d) => someoneElses(d) && hasAnyPermission(me, ['devices.rename']),
      canTrust: (d) => someoneElses(d) && d.status === 'recognized' && hasAnyPermission(me, ['devices.enroll']),
      canRevoke: (d) => someoneElses(d) && hasAnyPermission(me, ['devices.revoke']),
      rename: (d, name) => renameDevice(d.id, name),
      trust: (d) => stepUp(`Confirm your identity to trust ${d.name}.`, () => trustDevice(d.id)),
      revoke: async (d, lost, reason) => (await revokeDevice(d.id, reason ?? '', lost)).signedOut,
      onChanged,
    }
  }, [me, stepUp, onChanged, ownerId])
}
