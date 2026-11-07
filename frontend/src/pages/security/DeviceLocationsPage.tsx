import { ChevronRight, LocateFixed, MapPin as MapPinIcon, RefreshCw, Smartphone } from 'lucide-react'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { fetchLocationMap, type MapPin } from '../../api/location'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { SelectField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingState } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { cx } from '../../lib/cx'
import { groupByDevice, type DeviceGroup } from '../../lib/device-locations'
import { deviceStatusBadge } from '../../lib/devices'
import { describePin } from '../../lib/map-pins'
import { useLoaded } from '../../lib/useLoaded'

const LeafletMap = lazy(() => import('../../components/location/LeafletMap'))

const PERIODS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
]

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

/** The group's pins split by local day, keeping newest first. */
function byDay(pins: MapPin[]): { day: string; pins: MapPin[] }[] {
  const days: { day: string; pins: MapPin[] }[] = []
  for (const pin of pins) {
    const day = dayFormat.format(new Date(pin.at))
    const last = days.at(-1)
    if (last?.day === day) {
      last.pins.push(pin)
    } else {
      days.push({ day, pins: [pin] })
    }
  }
  return days
}

/**
 * Device locations (Security): a map with each device's latest location, and below it every
 * device with an expanding history of all the locations it reported. Same data and permission as
 * the location map (location.view_history); the backend audits every view.
 */
export function DeviceLocationsPage() {
  const [days, setDays] = useState('7')
  const map = useLoaded((signal) => fetchLocationMap(Number(days), signal), days)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [selectedPinId, setSelectedPinId] = useState<number | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => groupByDevice(map.data?.pins ?? []), [map.data])

  // Each device's latest location, plus the full history of the devices that are expanded.
  const visiblePins = useMemo(
    () => groups.flatMap((group) => (expanded.has(group.key) ? group.pins : group.pins.slice(0, 1))),
    [groups, expanded],
  )

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function showOnMap(pin: MapPin) {
    setSelectedPinId(pin.id)
    mapRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }

  return (
    <>
      <PageHeader
        title="Device locations"
        description="Where each phone or browser was when it last reported a location, and every location it reported in the period. Positions come from each device's browser and can be off by the accuracy shown."
        actions={
          <Button variant="secondary" icon={RefreshCw} onClick={map.reload} loading={map.loading && map.data !== null}>
            Refresh
          </Button>
        }
      />

      <div className="flex flex-col gap-6">
        <Card
          title="Map"
          actions={
            <SelectField
              label="Period"
              options={PERIODS}
              value={days}
              onChange={(event) => {
                setDays(event.target.value)
                setSelectedPinId(null)
              }}
              className="w-44"
            />
          }
        >
          {map.error && !map.data ? (
            <Banner
              tone="danger"
              title="The map could not be loaded"
              action={
                <Button variant="secondary" size="sm" onClick={map.reload}>
                  Try again
                </Button>
              }
            >
              {map.error instanceof ApiError ? map.error.message : null}
            </Banner>
          ) : (
            <div ref={mapRef}>
              <Suspense fallback={<LoadingState label="Loading the map…" className="h-[28rem]" />}>
                <LeafletMap pins={visiblePins} focusPinId={selectedPinId} className="h-[28rem] w-full" />
              </Suspense>
              <p className="mt-3 text-caption text-text-muted">
                The map shows each device's latest location. Expand a device below to add its whole history to the map, and
                choose a location to center on it. Records are deleted after {map.data?.retention_days ?? 30} days.
              </p>
            </div>
          )}
        </Card>

        <Card title="Devices" description="Every device that reported a location in the period, most recent first.">
          {map.loading && !map.data ? (
            <LoadingState label="Loading devices…" />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={MapPinIcon}
              title="No locations in this period"
              description="Devices appear when someone locks or unlocks from the mobile app, or shares their location on request."
            />
          ) : (
            <ul className="divide-y divide-border" aria-label="Devices and their locations">
              {groups.map((group) => (
                <DeviceBranch
                  key={group.key}
                  group={group}
                  open={expanded.has(group.key)}
                  onToggle={() => toggle(group.key)}
                  selectedPinId={selectedPinId}
                  onSelect={showOnMap}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

type DeviceBranchProps = {
  group: DeviceGroup
  open: boolean
  onToggle: () => void
  selectedPinId: number | null
  onSelect: (pin: MapPin) => void
}

function DeviceBranch({ group, open, onToggle, selectedPinId, onSelect }: DeviceBranchProps) {
  const latest = group.pins[0]
  const name = group.device?.name ?? 'Device not recorded'
  const historyId = `device-history-${group.key}`
  const status = group.device ? deviceStatusBadge[group.device.status] : null
  const count = group.pins.length

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={historyId}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 text-left hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          <ChevronRight className={cx('size-4 shrink-0 text-text-muted transition-transform', open && 'rotate-90')} aria-hidden />
          <Smartphone className="size-5 shrink-0 text-text-muted" aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-support font-semibold">{name}</span>
            <span className="text-caption text-text-muted">
              {group.owner.name} · last location <Timestamp iso={latest.at} /> · {count} {count === 1 ? 'location' : 'locations'}
            </span>
          </span>
        </button>
        {status && <StatusBadge tone={status.tone} label={status.label} />}
        <Button variant="secondary" size="sm" icon={LocateFixed} onClick={() => onSelect(latest)} aria-label={`Show the latest location of ${name} on the map`}>
          Latest
        </Button>
      </div>

      {open && (
        <div id={historyId} className="mt-1 ml-6 border-l border-border pl-4">
          {byDay(group.pins).map(({ day, pins }) => (
            <section key={day} aria-label={day} className="py-1">
              <h3 className="py-1 text-caption font-semibold text-text-muted">{day}</h3>
              <ul className="flex flex-col">
                {pins.map((pin) => {
                  const { tone, title, result } = describePin(pin)
                  return (
                    <li key={pin.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(pin)}
                        aria-pressed={pin.id === selectedPinId}
                        className={cx(
                          'flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1 text-left hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-focus',
                          pin.id === selectedPinId && 'bg-panel-2',
                        )}
                      >
                        <span className="w-24 shrink-0 text-caption text-text-muted">{timeFormat.format(new Date(pin.at))}</span>
                        <span className="text-support font-medium">{title}</span>
                        <StatusBadge tone={tone} label={result} />
                        <span className="text-caption text-text-muted">within about {Math.round(pin.accuracy_meters)} m</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </li>
  )
}

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })
