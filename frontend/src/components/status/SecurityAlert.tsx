import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { StatusBadge } from '../ui/StatusBadge'
import { toneIcon, toneText } from '../ui/tones'
import { Timestamp } from './Timestamp'

export type AlertSeverity = 'critical' | 'warning' | 'info'

const severity = {
  critical: { tone: 'danger', label: 'Critical', border: 'border-l-danger' },
  warning: { tone: 'warning', label: 'Warning', border: 'border-l-warning' },
  info: { tone: 'info', label: 'Notice', border: 'border-l-primary' },
} as const

type SecurityAlertProps = {
  severity: AlertSeverity
  title: ReactNode
  description?: ReactNode
  at: string
  /** Acknowledge, view details, and so on. */
  actions?: ReactNode
  /** Replaces the severity word, for finer severities such as High; the look still follows severity. */
  severityLabel?: string
  /** Further badges after the severity, such as the alert's status. */
  badges?: ReactNode
  /** Extra lines under the description. */
  children?: ReactNode
  now?: Date
}

/** One security alert. Severity is stated in words as well as color. */
export function SecurityAlert({ severity: level, title, description, at, actions, severityLabel, badges, children, now }: SecurityAlertProps) {
  const { tone, label: defaultLabel, border } = severity[level]
  const label = severityLabel ?? defaultLabel
  const Icon = toneIcon[tone]

  return (
    <article className={cx('flex gap-3 rounded-md border border-l-4 border-border bg-panel-2 p-4', border)}>
      <Icon className={cx('mt-0.5 size-5 shrink-0', toneText[tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={tone} label={label} />
          {badges}
          <Timestamp iso={at} now={now} className="text-caption text-text-muted" />
        </div>
        <h3 className="mt-1.5 text-panel-title">{title}</h3>
        {description && <p className="mt-0.5 text-support text-text-muted">{description}</p>}
        {children}
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </article>
  )
}
