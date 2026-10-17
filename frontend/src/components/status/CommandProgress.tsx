import { Check } from 'lucide-react'
import { cx } from '../../lib/cx'
import {
  commandStageLabel,
  describeCommandStatus,
  type AccessRequestStatus,
  type CommandStage,
} from '../../lib/lockguard'
import { Spinner } from '../ui/Spinner'
import { StatusBadge } from '../ui/StatusBadge'

const STEPS: ReadonlyArray<Exclude<CommandStage, 'failed'>> = [
  'received',
  'authorized',
  'submitted',
  'integration_response',
  'confirmed',
]

type CommandProgressProps = {
  status: AccessRequestStatus
  /** The backend's plain-language description (AccessRequestResource.status_message). */
  message: string
  /** command.integration_result is set: the lock service answered. */
  integrationResponded?: boolean
  className?: string
}

/**
 * Where a lock or unlock request stands, using the backend's real lifecycle. "Sent" and "confirmed"
 * are separate steps: only the lock reporting its new state counts as confirmed.
 */
export function CommandProgress({ status, message, integrationResponded = false, className }: CommandProgressProps) {
  const { tone, label, stage, pending } = describeCommandStatus(status, integrationResponded)
  const reached = stage === null || stage === 'failed' ? -1 : STEPS.indexOf(stage)

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div role="status" className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={tone} label={label} />
        {pending && <Spinner className="text-primary-text" />}
        <span className="text-support">{message}</span>
      </div>
      {reached >= 0 && (
        <ol className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-4" aria-label="Progress">
          {STEPS.map((step, i) => {
            const done = i < reached || (i === reached && !pending)
            const current = i === reached && pending
            return (
              <li
                key={step}
                aria-current={current ? 'step' : undefined}
                className={cx(
                  'flex items-center gap-1.5 text-label',
                  done ? 'text-success' : current ? 'text-primary-text' : 'text-text-muted',
                )}
              >
                {done ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <span className={cx('size-2 rounded-full', current ? 'bg-primary-text' : 'bg-border-strong')} aria-hidden />
                )}
                {commandStageLabel[step]}
                <span className="sr-only">{done ? '(done)' : current ? '(in progress)' : '(not yet)'}</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
