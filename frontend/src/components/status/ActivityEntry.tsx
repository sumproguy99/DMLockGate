import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { toneIcon, toneText, type Tone } from '../ui/tones'
import { Timestamp } from './Timestamp'

type ActivityEntryProps = {
  tone: Tone
  title: ReactNode
  /** Who or what did it: a user's name, "Eufy bridge", "Scheduler". */
  actor?: ReactNode
  detail?: ReactNode
  at: string
  icon?: LucideIcon
  now?: Date
}

/** One line of an activity or audit feed. Render inside a <ul> or <ol>. */
export function ActivityEntry({ tone, title, actor, detail, at, icon, now }: ActivityEntryProps) {
  const Icon = icon ?? toneIcon[tone]

  return (
    <li className="flex gap-3 py-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-panel-2">
        <Icon className={cx('size-4', toneText[tone])} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-support">
          <span className="font-medium">{title}</span>
          {actor && <span className="text-text-muted"> · {actor}</span>}
        </p>
        {detail && <p className="text-caption text-text-muted">{detail}</p>}
      </div>
      <Timestamp iso={at} now={now} className="shrink-0 text-caption text-text-muted" />
    </li>
  )
}
