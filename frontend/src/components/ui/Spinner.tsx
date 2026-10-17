import { cx } from '../../lib/cx'

/** A decorative spinning ring. Pair it with visible or screen-reader text. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cx('size-4 shrink-0 animate-spin', className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** A loading message announced to screen readers. */
export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cx('flex items-center gap-2 text-support text-text-muted', className)}>
      <Spinner className="text-primary-text" />
      <span>{label}</span>
    </div>
  )
}
