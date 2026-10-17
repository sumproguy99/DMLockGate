import { CircleAlert, CircleCheck, CircleHelp, Info, TriangleAlert, type LucideIcon } from 'lucide-react'

/**
 * The status tones (docs/UI_DESIGN.md, color rules). Every tone has a default icon, so a status is
 * never shown by color alone.
 *
 * - info: blue, in progress or informational.
 * - success: green, confirmed healthy.
 * - warning: amber, degraded or needs attention.
 * - danger: red, critical, failed or dangerous.
 * - unknown: gray, unknown, stale or unavailable.
 */
export type Tone = 'info' | 'success' | 'warning' | 'danger' | 'unknown'

export const toneIcon: Record<Tone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
  unknown: CircleHelp,
}

/** Text color for each tone, at 4.5:1 or better on every surface and on its own tint. */
export const toneText: Record<Tone, string> = {
  info: 'text-primary-text',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger-text',
  unknown: 'text-unknown',
}

/** A tinted background and border for badges and banners. */
export const toneSurface: Record<Tone, string> = {
  info: 'bg-primary/12 border-primary/35',
  success: 'bg-success/12 border-success/30',
  warning: 'bg-warning/12 border-warning/35',
  danger: 'bg-danger/12 border-danger/40',
  unknown: 'bg-unknown/12 border-unknown/30',
}
