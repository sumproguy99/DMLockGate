import { Lock as LockIcon, LockOpen } from 'lucide-react'
import { useState } from 'react'
import type { LockRequest, LockSummary } from '../../api/locks'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { describeCommandStatus } from '../../lib/lockguard'
import { CommandProgress } from '../status/CommandProgress'
import { DeviceStatus } from '../status/DeviceStatus'
import { LockStatusDisplay } from '../status/LockStatus'
import { Timestamp } from '../status/Timestamp'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { StatusBadge } from '../ui/StatusBadge'
import { StepUpDialog } from './StepUpDialog'
import { useLockCommand } from './useLockCommand'

type LockCardProps = {
  lock: LockSummary
  /** The newest request for this lock; undefined when the user may not see the lock's history. */
  lastRequest?: LockRequest | null
  /** Reload lock state, for example once a command has finished. */
  onChanged: () => void
}

/**
 * One lock: what it last reported, how fresh that is, its connection and battery, the last command
 * outcome, and the lock and unlock actions this user is allowed. The reported state never changes
 * because a command was sent; only a new report from the lock changes it.
 */
export function LockCard({ lock, lastRequest, onChanged }: LockCardProps) {
  const user = useCurrentUser()
  const { state, send, reset } = useLockCommand(lock.id, onChanged)
  const [confirmingUnlock, setConfirmingUnlock] = useState(false)

  const canLock = hasAnyPermission(user, ['lock.lock'])
  const canUnlock = hasAnyPermission(user, ['lock.unlock']) && hasAnyPermission(user, ['lock.remote_unlock'])
  const inProgress = state.phase === 'sending' || state.phase === 'tracking'
  const unavailable = !lock.commands_enabled
    ? 'Commands are turned off for this lock.'
    : lock.registration_status !== 'active'
      ? 'This lock is not registered for use.'
      : null
  const shownRequest =
    state.phase === 'tracking' || state.phase === 'finished' || state.phase === 'gave_up' ? state.request : null
  const subtitle = [lock.property?.name, lock.model].filter(Boolean).join(' · ')

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-panel p-5 shadow-panel">
      <header className="min-w-0">
        <h3 className="text-panel-title">{lock.name}</h3>
        {subtitle && <p className="text-caption text-text-muted">{subtitle}</p>}
      </header>

      <LockStatusDisplay state={lock.reported_state} freshness={lock.state_freshness} observedAt={lock.state_observed_at} />
      <DeviceStatus
        connection={lock.connection_status}
        batteryLevel={lock.battery_level}
        lastCommunicationAt={lock.last_communication_at}
      />

      {lock.last_error && lock.last_error_at && (
        <p className="text-caption text-warning">
          Last problem <Timestamp iso={lock.last_error_at} />: {lock.last_error}
        </p>
      )}

      {lastRequest !== undefined && !shownRequest && <LastCommand request={lastRequest} />}

      {(canLock || canUnlock) && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex flex-wrap gap-2">
            {canLock && (
              <Button
                variant="secondary"
                icon={LockIcon}
                onClick={() => send('lock')}
                disabled={unavailable !== null || inProgress}
                loading={state.phase === 'sending' && state.action === 'lock'}
              >
                Lock
              </Button>
            )}
            {canUnlock && (
              <Button
                variant="secondary"
                icon={LockOpen}
                onClick={() => setConfirmingUnlock(true)}
                disabled={unavailable !== null || inProgress}
                loading={state.phase === 'sending' && state.action === 'unlock'}
              >
                Unlock
              </Button>
            )}
          </div>
          {unavailable && <p className="text-caption text-text-muted">{unavailable}</p>}
          <CommandOutcome
            state={state}
            onRetry={(action) => send(action, { reuseKey: true })}
            onDismiss={reset}
          />
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
        <p className="text-support text-text-muted">
          LockGuard shows it as unlocked only after the lock itself reports it.
        </p>
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

export function LastCommand({ request }: { request: LockRequest | null }) {
  if (!request) {
    return <p className="text-caption text-text-muted">No lock or unlock requests yet.</p>
  }
  const { tone, label } = describeCommandStatus(request.status, request.command?.integration_result != null)

  return (
    <div className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
      <span>Last request: {request.action === 'lock' ? 'Lock' : 'Unlock'}</span>
      <StatusBadge tone={tone} label={label} />
      <Timestamp iso={request.requested_at} />
    </div>
  )
}

type CommandOutcomeProps = {
  state: ReturnType<typeof useLockCommand>['state']
  onRetry: (action: 'lock' | 'unlock') => void
  onDismiss: () => void
}

export function CommandOutcome({ state, onRetry, onDismiss }: CommandOutcomeProps) {
  switch (state.phase) {
    case 'idle':
    case 'step_up':
    case 'sending':
      return null
    case 'tracking':
      return (
        <div className="flex flex-col gap-2">
          <CommandProgress
            status={state.request.status}
            message={state.request.status_message}
            integrationResponded={state.request.command?.integration_result != null}
          />
          {state.contactLost && (
            <p className="text-caption text-warning">Lost contact with LockGuard. Still checking…</p>
          )}
        </div>
      )
    case 'finished':
      return (
        <div className="flex flex-col gap-2">
          <CommandProgress
            status={state.request.status}
            message={state.request.status_message}
            integrationResponded={state.request.command?.integration_result != null}
          />
          <div>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      )
    case 'gave_up':
      return (
        <Banner tone="warning" title="Still waiting for the lock" onDismiss={onDismiss}>
          LockGuard stopped checking this request on screen. Its final outcome will show here and in the lock's history
          when the lock reports. Check the door before trying again.
        </Banner>
      )
    case 'refused':
      return (
        <Banner tone="danger" title={`${state.action === 'lock' ? 'Lock' : 'Unlock'} not sent`} onDismiss={onDismiss}>
          {state.message}
        </Banner>
      )
    case 'no_answer':
      return (
        <Banner
          tone="warning"
          title="No answer from LockGuard"
          onDismiss={onDismiss}
          action={
            <Button variant="secondary" size="sm" onClick={() => onRetry(state.action)}>
              Check again
            </Button>
          }
        >
          {state.message}
        </Banner>
      )
  }
}
