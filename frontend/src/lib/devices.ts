import type { Device, DeviceStatus } from '../api/devices'
import type { Tone } from '../components/ui/tones'

export const deviceStatusBadge: Record<DeviceStatus, { tone: Tone; label: string }> = {
  recognized: { tone: 'unknown', label: 'Not trusted' },
  trusted: { tone: 'success', label: 'Trusted' },
  revoked: { tone: 'danger', label: 'Revoked' },
}

/** What revoking a device does, for the confirmation (project.md 34.8 E). */
export function revokeConsequence(device: Device, lost: boolean, self: boolean): string {
  const name = `“${device.name}”`
  const owner = self ? 'your account' : 'this account'
  const base = `${name} can no longer sign in to ${owner} or send lock commands, and it is signed out on its next request. This cannot be undone; to use it again, the browser's site data has to be cleared and it signs in as a new device.`
  if (!lost) {
    return base
  }
  return self
    ? `${base} Because it is lost, every other sign-in on your account also ends now. This device stays signed in, and administrators are alerted.`
    : `${base} Because it is lost, the person is also signed out everywhere now, and an incident is opened.`
}
