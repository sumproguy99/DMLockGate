import { Lock, LockOpen, ShieldAlert, WifiOff, type LucideIcon } from 'lucide-react'
import type { LockAction, LockSummary } from '../api/locks'
import type { Tone } from '../components/ui/tones'
import { describeLockState } from '../lib/lockguard'

export type MobileLockDisplay = {
  tone: Tone
  label: string
  icon: LucideIcon
  /** True while a command is on its way; the reported state has not changed yet. */
  pending: boolean
  /** What the lock itself last reported, in words, for the line under the label. */
  reported: string
}

/**
 * The big state on a phone (project.md 34.8 B): Locked, Unlocked, Locking, Unlocking, State unknown,
 * State stale, or Device unavailable. "Locking" and "Unlocking" only mean a command is on its way;
 * the reported state changes only when the lock reports it.
 */
export function describeMobileLock(lock: LockSummary, pendingAction: LockAction | null): MobileLockDisplay {
  const reported = describeLockState(lock.reported_state, lock.state_freshness === 'unknown' ? 'unknown' : 'current').label.toLowerCase()

  if (pendingAction !== null) {
    return {
      tone: 'info',
      label: pendingAction === 'lock' ? 'Locking…' : 'Unlocking…',
      icon: pendingAction === 'lock' ? Lock : LockOpen,
      pending: true,
      reported,
    }
  }
  if (lock.connection_status === 'disconnected') {
    return { tone: 'danger', label: 'Device unavailable', icon: WifiOff, pending: false, reported }
  }
  if (lock.reported_state === 'unknown' || lock.state_freshness === 'unknown') {
    return { tone: 'unknown', label: 'State unknown', icon: ShieldAlert, pending: false, reported }
  }
  if (lock.state_freshness === 'stale') {
    return { tone: 'unknown', label: 'State stale', icon: ShieldAlert, pending: false, reported }
  }
  const { tone, label, icon } = describeLockState(lock.reported_state, 'current')

  return { tone, label, icon, pending: false, reported }
}
