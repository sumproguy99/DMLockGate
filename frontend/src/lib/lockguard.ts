import { Lock, LockOpen, RefreshCw, ShieldAlert, Unplug, Wifi, WifiOff, type LucideIcon } from 'lucide-react'
import type { Tone } from '../components/ui/tones'

/*
 * Values the LockGuard API returns, mirrored from the backend enums (backend/app/Enums) and
 * resources. Keep these in step with the backend.
 */

/** ReportedLockState: what the lock itself last reported. Never inferred from a command. */
export type ReportedLockState = 'locked' | 'unlocked' | 'jammed' | 'unknown'

/** LockResource.state_freshness: whether the reported state can be relied on. */
export type StateFreshness = 'current' | 'stale' | 'unknown'

/** LockConnectionStatus. */
export type ConnectionStatus = 'connected' | 'disconnected' | 'degraded' | 'synchronizing' | 'unknown'

/** AccessRequestStatus: the lifecycle of a lock or unlock request. */
export type AccessRequestStatus =
  | 'received'
  | 'authenticating'
  | 'authorized'
  | 'denied'
  | 'queued'
  | 'submitted'
  | 'confirmed_success'
  | 'failed'
  | 'unknown_result'
  | 'already_in_state'
  | 'expired'
  | 'cancelled'

type Described = { tone: Tone; label: string; icon: LucideIcon }

/**
 * Locked is the healthy state; unlocked needs attention but is not a fault; jammed is critical.
 * A stale or unknown report is gray whatever it says, because it cannot be relied on.
 */
export function describeLockState(state: ReportedLockState, freshness: StateFreshness): Described {
  if (state === 'unknown' || freshness === 'unknown') {
    return { tone: 'unknown', label: 'Unknown', icon: ShieldAlert }
  }
  const described: Record<Exclude<ReportedLockState, 'unknown'>, Described> = {
    locked: { tone: 'success', label: 'Locked', icon: Lock },
    unlocked: { tone: 'warning', label: 'Unlocked', icon: LockOpen },
    jammed: { tone: 'danger', label: 'Jammed', icon: ShieldAlert },
  }
  const current = described[state]

  return freshness === 'stale' ? { ...current, tone: 'unknown', label: `${current.label} (stale)` } : current
}

const connections: Record<ConnectionStatus, Described> = {
  connected: { tone: 'success', label: 'Connected', icon: Wifi },
  degraded: { tone: 'warning', label: 'Degraded', icon: Unplug },
  disconnected: { tone: 'danger', label: 'Disconnected', icon: WifiOff },
  synchronizing: { tone: 'info', label: 'Synchronizing', icon: RefreshCw },
  unknown: { tone: 'unknown', label: 'Unknown', icon: WifiOff },
}

export function describeConnection(status: ConnectionStatus): Described {
  return connections[status]
}

/**
 * The command stages named in project.md 34.9, used with the same words on desktop and mobile.
 * "failed" covers both "failed" and "outcome unknown"; the status label says which.
 */
export type CommandStage = 'received' | 'authorized' | 'submitted' | 'integration_response' | 'confirmed' | 'failed'

export const commandStageLabel: Record<CommandStage, string> = {
  received: 'Request received',
  authorized: 'Authorization completed',
  submitted: 'Command submitted',
  integration_response: 'Integration response received',
  confirmed: 'Physical state confirmed',
  failed: 'Operation failed or outcome unknown',
}

type DescribedCommand = { tone: Tone; label: string; stage: CommandStage | null; pending: boolean }

/**
 * Where a request stands. integrationResponded is true once the bridge answered the submitted
 * command (AccessRequestResource command.integration_result is set): the command reached the lock
 * service, but the lock has not confirmed a new state yet.
 */
export function describeCommandStatus(status: AccessRequestStatus, integrationResponded = false): DescribedCommand {
  switch (status) {
    case 'received':
    case 'authenticating':
      return { tone: 'info', label: 'Checking request', stage: 'received', pending: true }
    case 'authorized':
    case 'queued':
      return { tone: 'info', label: 'Approved, sending', stage: 'authorized', pending: true }
    case 'submitted':
      return integrationResponded
        ? { tone: 'info', label: 'Waiting for the lock', stage: 'integration_response', pending: true }
        : { tone: 'info', label: 'Sent', stage: 'submitted', pending: true }
    case 'confirmed_success':
      return { tone: 'success', label: 'Confirmed', stage: 'confirmed', pending: false }
    case 'already_in_state':
      return { tone: 'success', label: 'Already in that state', stage: null, pending: false }
    case 'denied':
      return { tone: 'danger', label: 'Denied', stage: 'failed', pending: false }
    case 'failed':
      return { tone: 'danger', label: 'Failed', stage: 'failed', pending: false }
    case 'unknown_result':
      return { tone: 'warning', label: 'Outcome unknown', stage: 'failed', pending: false }
    case 'expired':
      return { tone: 'unknown', label: 'Expired, not sent', stage: null, pending: false }
    case 'cancelled':
      return { tone: 'unknown', label: 'Cancelled, not sent', stage: null, pending: false }
  }
}

/** A lock's serial with all but the last four characters hidden. */
export function maskSerial(serial: string): string {
  return serial.length <= 4 ? serial : `••••${serial.slice(-4)}`
}
