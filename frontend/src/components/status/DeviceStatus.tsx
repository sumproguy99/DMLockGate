import { Battery, BatteryLow, BatteryWarning } from 'lucide-react'
import { describeConnection, type ConnectionStatus } from '../../lib/lockguard'
import { StatusBadge } from '../ui/StatusBadge'
import { Timestamp } from './Timestamp'

/** The lock's link to LockGuard (LockResource.connection_status). */
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const { tone, label, icon } = describeConnection(status)

  return <StatusBadge tone={tone} label={label} icon={icon} />
}

/** Battery percentage as last reported; "Unknown" when the lock has not reported one. */
export function BatteryBadge({ level }: { level: number | null }) {
  if (level === null) {
    return <StatusBadge tone="unknown" label="Battery unknown" icon={Battery} />
  }
  if (level <= 10) {
    return <StatusBadge tone="danger" label={`Battery ${level}%`} icon={BatteryWarning} />
  }
  if (level <= 25) {
    return <StatusBadge tone="warning" label={`Battery ${level}%`} icon={BatteryLow} />
  }

  return <StatusBadge tone="success" label={`Battery ${level}%`} icon={Battery} />
}

type DeviceStatusProps = {
  connection: ConnectionStatus
  batteryLevel: number | null
  lastCommunicationAt: string | null
  now?: Date
}

/** Connection, battery and last contact for one device. */
export function DeviceStatus({ connection, batteryLevel, lastCommunicationAt, now }: DeviceStatusProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ConnectionBadge status={connection} />
      <BatteryBadge level={batteryLevel} />
      <span className="text-caption text-text-muted">
        {lastCommunicationAt ? (
          <>
            Last contact <Timestamp iso={lastCommunicationAt} now={now} />
          </>
        ) : (
          'No contact yet'
        )}
      </span>
    </div>
  )
}
