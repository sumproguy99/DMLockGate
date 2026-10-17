import { cx } from '../../lib/cx'
import { describeLockState, type ReportedLockState, type StateFreshness } from '../../lib/lockguard'
import { StatusBadge } from '../ui/StatusBadge'
import { toneSurface, toneText } from '../ui/tones'
import { Timestamp } from './Timestamp'

type LockStateProps = {
  state: ReportedLockState
  freshness: StateFreshness
}

/** The reported lock state as a compact badge, for tables and lists. */
export function LockStateBadge({ state, freshness }: LockStateProps) {
  const { tone, label, icon } = describeLockState(state, freshness)

  return <StatusBadge tone={tone} label={label} icon={icon} />
}

type LockStatusDisplayProps = LockStateProps & {
  /** When the lock reported this state (LockResource.state_observed_at). */
  observedAt: string | null
  now?: Date
  className?: string
}

/**
 * The reported lock state, large, with when it was reported. Only ever shows what the lock last
 * reported, never what a command asked for, and says plainly when that report is old or missing.
 */
export function LockStatusDisplay({ state, freshness, observedAt, now, className }: LockStatusDisplayProps) {
  const { tone, label, icon: Icon } = describeLockState(state, freshness)

  let detail
  if (freshness === 'unknown' || observedAt === null) {
    detail = 'No reliable report from the lock.'
  } else if (freshness === 'stale') {
    detail = (
      <>
        Last report <Timestamp iso={observedAt} now={now} />. It may have changed since.
      </>
    )
  } else {
    detail = (
      <>
        Reported by the lock <Timestamp iso={observedAt} now={now} />
      </>
    )
  }

  return (
    <div className={cx('flex items-center gap-4', className)}>
      <span className={cx('flex size-14 shrink-0 items-center justify-center rounded-full border', toneSurface[tone])}>
        <Icon className={cx('size-7', toneText[tone])} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className={cx('text-section', toneText[tone])}>{label}</p>
        <p className="text-support text-text-muted">{detail}</p>
      </div>
    </div>
  )
}
