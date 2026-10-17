import { CircleSlash, PlugZap, RefreshCw, ShieldAlert, Unplug, Wifi, WifiOff, type LucideIcon } from 'lucide-react'
import type { IntegrationStatus, SubsystemStatus } from '../api/system'
import type { Tone } from '../components/ui/tones'

type DescribedIntegration = { tone: Tone; label: string; icon: LucideIcon; explanation: string }

const integrations: Record<IntegrationStatus, DescribedIntegration> = {
  connected: {
    tone: 'success',
    label: 'Eufy connected',
    icon: Wifi,
    explanation: 'Lock commands can be sent. Each one still waits for the lock to report its new state.',
  },
  degraded: {
    tone: 'warning',
    label: 'Eufy degraded',
    icon: Unplug,
    explanation:
      'The Eufy cloud is failing or not answering. LockGuard refuses lock commands until it recovers, because their outcome could not be confirmed.',
  },
  needs_login: {
    tone: 'danger',
    label: 'Eufy sign-in needed',
    icon: ShieldAlert,
    explanation: "The Eufy bridge's Eufy account must be signed in again on the server. Lock commands cannot be sent until then.",
  },
  starting: {
    tone: 'info',
    label: 'Eufy starting',
    icon: RefreshCw,
    explanation: 'The Eufy bridge is starting up. Lock commands are refused until it has connected.',
  },
  unreachable: {
    tone: 'danger',
    label: 'Eufy bridge offline',
    icon: WifiOff,
    explanation: 'LockGuard cannot reach the Eufy bridge. Lock status may be out of date and commands cannot be sent.',
  },
  not_configured: {
    tone: 'unknown',
    label: 'No lock integration',
    icon: CircleSlash,
    explanation: 'No lock integration is configured on the server, so no real lock can be controlled.',
  },
  simulated: {
    tone: 'warning',
    label: 'Simulated locks',
    icon: PlugZap,
    explanation: 'The server is using simulated locks for development. Nothing here controls a real door.',
  },
  unknown: {
    tone: 'unknown',
    label: 'Eufy status unknown',
    icon: ShieldAlert,
    explanation: 'The Eufy bridge answered with a status LockGuard does not recognize.',
  },
}

export function describeIntegration(status: IntegrationStatus): DescribedIntegration {
  return integrations[status] ?? integrations.unknown
}

const subsystems: Record<SubsystemStatus, { tone: Tone; label: string }> = {
  ok: { tone: 'success', label: 'Healthy' },
  warning: { tone: 'warning', label: 'Warning' },
  down: { tone: 'danger', label: 'Down' },
  unknown: { tone: 'unknown', label: 'Unknown' },
  not_implemented: { tone: 'unknown', label: 'Not built yet' },
}

export function describeSubsystem(status: SubsystemStatus): { tone: Tone; label: string } {
  return subsystems[status] ?? subsystems.unknown
}

export const subsystemLabel: Record<string, string> = {
  application: 'Application',
  database: 'Database',
  queue: 'Background jobs',
  state_sync: 'Lock state sync',
  eufy: 'Eufy integration',
  audit: 'Audit trail',
  notifications: 'Notifications',
  live_updates: 'Live updates',
}
