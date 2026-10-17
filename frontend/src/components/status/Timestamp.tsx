import { formatAbsolute, formatRelative } from '../../lib/time'

/** A relative time ("5 minutes ago") with the exact time on hover and in the markup. */
export function Timestamp({ iso, now, className }: { iso: string; now?: Date; className?: string }) {
  return (
    <time dateTime={iso} title={formatAbsolute(iso)} className={className}>
      {formatRelative(iso, now)}
    </time>
  )
}
