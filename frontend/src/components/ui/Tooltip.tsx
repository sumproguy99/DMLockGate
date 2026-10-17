import { cloneElement, useId, useState, type ReactElement } from 'react'
import { cx } from '../../lib/cx'

type TooltipProps = {
  /** Supplementary text only: anything essential must be visible without hovering. */
  content: string
  /** One focusable element, such as a button. It is described by the tooltip. */
  children: ReactElement<{ 'aria-describedby'?: string }>
  side?: 'top' | 'bottom'
}

/** A short description shown on hover and on keyboard focus. Escape hides it. */
export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      onKeyDown={(event) => event.key === 'Escape' && setVisible(false)}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        id={id}
        role="tooltip"
        hidden={!visible}
        className={cx(
          'pointer-events-none absolute left-1/2 z-40 w-max max-w-64 -translate-x-1/2 rounded-sm border border-border-strong bg-elevated px-2.5 py-1.5 text-caption text-text shadow-raised',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        )}
      >
        {content}
      </span>
    </span>
  )
}
