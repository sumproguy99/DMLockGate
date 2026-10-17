import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

type CardProps = {
  title?: ReactNode
  description?: ReactNode
  /** Controls in the card header, such as a refresh or "View all" button. */
  actions?: ReactNode
  /** The heading level for the title, so cards fit the page outline. */
  headingLevel?: 2 | 3 | 4
  className?: string
  children?: ReactNode
}

/** A panel with an optional heading. */
export function Card({ title, description, actions, headingLevel = 2, className, children }: CardProps) {
  const Heading = `h${headingLevel}` as const

  return (
    <section className={cx('rounded-lg border border-border bg-panel p-5 shadow-panel', className)}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <Heading className="text-panel-title">{title}</Heading>}
            {description && <p className="mt-0.5 text-support text-text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/** A single figure with its label, for summary rows. The value must come from the backend. */
export function Metric({ label, value, detail }: { label: ReactNode; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label text-text-muted">{label}</span>
      <span className="text-metric">{value}</span>
      {detail && <span className="text-caption text-text-muted">{detail}</span>}
    </div>
  )
}
