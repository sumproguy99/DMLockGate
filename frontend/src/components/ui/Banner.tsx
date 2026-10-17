import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { IconButton } from './Button'
import { toneIcon, toneSurface, toneText, type Tone } from './tones'

type BannerProps = {
  tone: Tone
  title: ReactNode
  children?: ReactNode
  /** A follow-up control, such as "Retry" or "Open settings". */
  action?: ReactNode
  onDismiss?: () => void
  /**
   * How a screen reader learns of the banner when it appears: "alert" interrupts, "status" waits,
   * "none" for banners that are part of the page when it loads. Defaults to "alert" for danger and
   * "status" otherwise.
   */
  live?: 'alert' | 'status' | 'none'
  className?: string
}

/** A page- or panel-level message: warnings, errors, unavailable integrations. */
export function Banner({ tone, title, children, action, onDismiss, live, className }: BannerProps) {
  const Icon = toneIcon[tone]
  const politeness = live ?? (tone === 'danger' ? 'alert' : 'status')

  return (
    <div
      role={politeness === 'none' ? undefined : politeness}
      className={cx('flex gap-3 rounded-md border px-4 py-3', toneSurface[tone], className)}
    >
      <Icon className={cx('mt-0.5 size-5 shrink-0', toneText[tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cx('text-support font-semibold', toneText[tone])}>{title}</p>
        {children && <div className="mt-1 text-support text-text">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
      {onDismiss && <IconButton icon={X} label="Dismiss" size="sm" onClick={onDismiss} className="-my-1 -mr-2" />}
    </div>
  )
}
