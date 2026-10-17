import type { ManagedUser } from '../api/users'
import type { Tone } from '../components/ui/tones'

/** An account's standing in words. An active account past its expiry date cannot sign in. */
export function describeUserStatus(user: Pick<ManagedUser, 'status' | 'account_expires_at'>, now = new Date()): { tone: Tone; label: string } {
  if (user.status === 'revoked') {
    return { tone: 'danger', label: 'Revoked' }
  }
  if (user.status === 'suspended') {
    return { tone: 'warning', label: 'Suspended' }
  }
  if (user.account_expires_at && new Date(user.account_expires_at) <= now) {
    return { tone: 'unknown', label: 'Expired' }
  }
  return { tone: 'success', label: 'Active' }
}

/** Permission areas in the order the catalog defines them. */
export const permissionGroupLabel: Record<string, string> = {
  lock: 'Lock control',
  users: 'User management',
  access: 'Access management',
  devices: 'Device management',
  location: 'Location and privacy',
  admin: 'Administration',
}

/** "2026-10-20T15:00:00Z" → "2026-10-20T11:00" in local time, for datetime-local inputs. */
export function toLocalInput(iso: string | null): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** A datetime-local value back to ISO, or null when empty. */
export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}
