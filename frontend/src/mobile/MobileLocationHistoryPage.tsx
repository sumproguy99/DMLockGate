import { ChevronLeft, ExternalLink, MapPin } from 'lucide-react'
import { Link } from 'react-router'
import { fetchOwnLocationSharing, type SharedLocation } from '../api/location'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/Spinner'
import { describeShared } from '../lib/location-sharing'
import { useLoaded } from '../lib/useLoaded'

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })

/** The entries split by local day, newest first. */
function byDay(items: SharedLocation[]): { day: string; items: SharedLocation[] }[] {
  const days: { day: string; items: SharedLocation[] }[] = []
  for (const item of items) {
    const day = dayFormat.format(new Date(item.at))
    const last = days.at(-1)
    if (last?.day === day) {
      last.items.push(item)
    } else {
      days.push({ day, items: [item] })
    }
  }
  return days
}

/** An OpenStreetMap link centered on the position. Only opened when the person taps it. */
function mapLink(item: SharedLocation): string {
  const lat = item.latitude.toFixed(5)
  const lon = item.longitude.toFixed(5)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`
}

/**
 * Mobile location timeline: every location this person's devices shared, newest first, grouped by
 * day, with where it was, why it was sent and from which device. Records are deleted after the
 * retention period.
 */
export function MobileLocationHistoryPage() {
  const sharing = useLoaded(fetchOwnLocationSharing, 'mine')
  const items = [...(sharing.data?.shared ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))

  return (
    <>
      <Link to="/m/location" className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 px-2 text-label font-semibold text-primary-text">
        <ChevronLeft className="size-4" aria-hidden />
        Location
      </Link>
      <PageHeader
        title="Location timeline"
        description={`Every location your devices shared, newest first. Records are deleted after ${sharing.data?.retention_days ?? 30} days.`}
      />

      {sharing.loading && !sharing.data ? (
        <LoadingState label="Loading your timeline…" />
      ) : sharing.error && !sharing.data ? (
        <Banner
          tone="danger"
          title="Your timeline could not be loaded"
          action={
            <Button variant="secondary" size="sm" onClick={sharing.reload}>
              Try again
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState icon={MapPin} title="Your location has not been shared" description="Entries appear when you lock or unlock, or when an administrator asks for your location." />
      ) : (
        <div className="flex flex-col gap-5">
          {byDay(items).map(({ day, items: entries }, index) => (
            <section key={day} aria-labelledby={`timeline-day-${index}`}>
              <h2 id={`timeline-day-${index}`} className="mb-2 text-label font-semibold text-text-muted">
                {day}
              </h2>
              <ol className="relative ml-2 border-l-2 border-border">
                {entries.map((item) => (
                  <li key={item.id} className="relative pb-4 pl-5 last:pb-0">
                    <span className="absolute top-1.5 -left-[7px] size-3 rounded-full border-2 border-bg bg-primary" aria-hidden />
                    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-panel p-3">
                      <span className="text-caption font-semibold text-text-muted">{timeFormat.format(new Date(item.at))}</span>
                      <span className="text-support font-medium">{describeShared(item)}</span>
                      <span className="text-caption text-text-muted">
                        {item.device ?? 'Device not recorded'} · within about {Math.round(item.accuracy_meters)} m
                      </span>
                      <a
                        href={mapLink(item)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex min-h-11 items-center gap-1 self-start text-label font-semibold text-primary-text"
                      >
                        {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                        <ExternalLink className="size-4" aria-hidden />
                        <span className="sr-only">(opens OpenStreetMap)</span>
                      </a>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
