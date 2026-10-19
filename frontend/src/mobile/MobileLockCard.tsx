import { ChevronRight, Lock as LockIcon, LockOpen } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { LockRequest, LockSummary } from '../api/locks'
import { hasAnyPermission, useCurrentUser } from '../auth/auth-context'
import { CommandOutcome, LastCommand } from '../components/locks/LockCard'
import { StepUpDialog } from '../components/locks/StepUpDialog'
import { useLockCommand } from '../components/locks/useLockCommand'
import { DeviceStatus } from '../components/status/DeviceStatus'
import { Timestamp } from '../components/status/Timestamp'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Spinner } from '../components/ui/Spinner'
import { toneSurface, toneText } from '../components/ui/tones'
import { cx } from '../lib/cx'
import { describeMobileLock } from './lock-display'

type MobileLockCardProps = {
  lock: LockSummary
  /** The newest request for this lock; undefined when the user may not see the lock's history. */
  lastRequest?: LockRequest | null
  /** Reload the locks, for example once a command has finished. */
  onChanged: () => void
  /** On Home the card links to the lock's own screen; on that screen it does not. */
  linkToDetails?: boolean
  headingLevel?: 2 | 3
  /** Off on the lock's own screen, where the page title already names it. */
  showTitle?: boolean
}

/**
 * One lock on a phone: a large state, its connection, and Lock and Unlock buttons sized for a thumb.
 * Unlock sits apart from Lock and asks for confirmation. The state shown is only ever what the lock
 * reported; while a command is on its way it says "Locking…" or "Unlocking…", never "Locked".
 */
export function MobileLockCard({
  lock,
  lastRequest,
  onChanged,
  linkToDetails = false,
  headingLevel = 2,
  showTitle = true,
}: MobileLockCardProps) {
  const user = useCurrentUser()
  const { state, send, reset } = useLockCommand(lock.id, onChanged)
  const [confirmingUnlock, setConfirmingUnlock] = useState(false)
  const Heading = `h${headingLevel}` as const

  const canLock = hasAnyPermission(user, ['lock.lock'])
  const canUnlock = hasAnyPermission(user, ['lock.unlock']) && hasAnyPermission(user, ['lock.remote_unlock'])
  const inProgress = state.phase === 'sending' || state.phase === 'tracking'
  const pendingAction = state.phase === 'sending' ? state.action : state.phase === 'tracking' ? state.request.action : null
  const display = describeMobileLock(lock, pendingAction)
  const unavailable = !lock.commands_enabled
    ? 'Commands are turned off for this lock.'
    : lock.registration_status !== 'active'
      ? 'This lock is not registered for use.'
      : null
  const showsRequest = state.phase === 'tracking' || state.phase === 'finished' || state.phase === 'gave_up'
  const subtitle = [lock.property?.name, lock.model].filter(Boolean).join(' · ')
  const Icon = display.icon

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-panel p-4 shadow-panel">
      {showTitle && (
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Heading className="text-panel-title">{lock.name}</Heading>
            {subtitle && <p className="text-caption text-text-muted">{subtitle}</p>}
          </div>
          {linkToDetails && (
            <Link
              to={`/m/locks/${lock.id}`}
              aria-label={`Details for ${lock.name}`}
              className="-mr-2 flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-label font-semibold text-primary-text"
            >
              Details
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          )}
        </header>
      )}

      <div className={cx('flex items-center gap-4 rounded-lg border p-4', toneSurface[display.tone])}>
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-bg/60">
          {display.pending ? (
            <Spinner className={cx('size-7', toneText[display.tone])} />
          ) : (
            <Icon className={cx('size-8', toneText[display.tone])} aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          <p className={cx('text-page-title', toneText[display.tone])}>{display.label}</p>
          <p className="text-support text-text-muted">
            {display.pending ? (
              <>Still {display.reported} until the lock reports its new state.</>
            ) : lock.state_observed_at && lock.state_freshness !== 'unknown' ? (
              <>
                Lock reported {display.reported} <Timestamp iso={lock.state_observed_at} />
              </>
            ) : (
              'No reliable report from the lock.'
            )}
          </p>
        </div>
      </div>

      <DeviceStatus
        connection={lock.connection_status}
        batteryLevel={lock.battery_level}
        lastCommunicationAt={lock.last_communication_at}
      />

      {lastRequest !== undefined && !showsRequest && <LastCommand request={lastRequest} />}

      {(canLock || canUnlock) && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          {canLock && (
            <Button
              size="lg"
              fullWidth
              icon={LockIcon}
              className="min-h-14"
              onClick={() => send('lock')}
              disabled={unavailable !== null || inProgress}
              loading={state.phase === 'sending' && state.action === 'lock'}
            >
              Lock {lock.name}
            </Button>
          )}
          {canUnlock && (
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              icon={LockOpen}
              className={cx('min-h-14', canLock && 'mt-3')}
              onClick={() => setConfirmingUnlock(true)}
              disabled={unavailable !== null || inProgress}
              loading={state.phase === 'sending' && state.action === 'unlock'}
            >
              Unlock {lock.name}
            </Button>
          )}
          {unavailable && <p className="text-caption text-text-muted">{unavailable}</p>}
          <CommandOutcome state={state} onRetry={(action) => send(action, { reuseKey: true })} onDismiss={reset} />
        </div>
      )}

      <ConfirmDialog
        open={confirmingUnlock}
        title={`Unlock ${lock.name}?`}
        consequence="This asks the lock to unlock now, from wherever you are. Anyone at the door can open it until it is locked again."
        confirmLabel="Unlock"
        tone="danger"
        onCancel={() => setConfirmingUnlock(false)}
        onConfirm={() => {
          setConfirmingUnlock(false)
          send('unlock')
        }}
      >
        <p className="text-support text-text-muted">LockGuard shows it as unlocked only after the lock itself reports it.</p>
      </ConfirmDialog>

      <StepUpDialog
        open={state.phase === 'step_up'}
        purpose={`unlock ${lock.name}`}
        onCancel={reset}
        onConfirmed={() => state.phase === 'step_up' && send(state.action)}
      />
    </article>
  )
}
