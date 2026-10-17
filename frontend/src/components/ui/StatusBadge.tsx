import type { LucideIcon } from 'lucide-react'
import { cx } from '../../lib/cx'
import { toneIcon, toneSurface, toneText, type Tone } from './tones'

type StatusBadgeProps = {
  tone: Tone
  /** The visible status text. Required: color and icon are never the only signal. */
  label: string
  /** Overrides the tone's default icon. */
  icon?: LucideIcon
  className?: string
}

export function StatusBadge({ tone, label, icon, className }: StatusBadgeProps) {
  const Icon = icon ?? toneIcon[tone]

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-label',
        toneSurface[tone],
        toneText[tone],
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
    </span>
  )
}
