import { Inbox, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

type EmptyStateProps = {
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}

/** Shown where a list or table has nothing in it yet. Says why, and what to do next if anything. */
export function EmptyState({ title, description, icon: Icon = Inbox, action, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center gap-2 px-4 py-10 text-center', className)}>
      <Icon className="size-8 text-unknown" aria-hidden />
      <p className="text-panel-title">{title}</p>
      {description && <p className="max-w-sm text-support text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
