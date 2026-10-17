const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 30],
  ['month', 12],
  ['year', Infinity],
]

/** "5 minutes ago", "yesterday". `now` is injectable for tests. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  let value = (new Date(iso).getTime() - now.getTime()) / 1000
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) {
      return relative.format(Math.round(value), unit)
    }
    value /= size
  }

  return relative.format(Math.round(value), 'year')
}

const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })

/** A full local date and time, for titles and audit detail. */
export function formatAbsolute(iso: string): string {
  return absolute.format(new Date(iso))
}
