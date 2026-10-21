import { LocateFixed, MapPin as MapPinIcon, RefreshCw } from 'lucide-react'
import { lazy, Suspense, useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import {
  fetchLocationMap,
  requestLocation,
  type LocationRequestRecord,
  type MapPin,
  type UnavailableReason,
} from '../../api/location'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { useLocationRequestWatch } from '../../components/location/useLocationRequestWatch'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { SelectField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingState } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { describePin } from '../../lib/map-pins'
import { useLoaded } from '../../lib/useLoaded'

const LeafletMap = lazy(() => import('../../components/location/LeafletMap'))

const PERIODS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
]

const unavailableText: Record<UnavailableReason, string> = {
  permission_denied: 'their browser blocks location for LockGuard',
  position_unavailable: 'the phone could not work out where it is',
  timeout: 'the phone took too long to find its position',
  unsupported: 'their browser cannot share a location here; browsers only share it with LockGuard opened over HTTPS',
}

const columns: Column<MapPin>[] = [
  { key: 'at', header: 'When', cell: (pin) => <Timestamp iso={pin.at} /> },
  { key: 'who', header: 'Who', cell: (pin) => pin.user.name },
  { key: 'what', header: 'What', cell: (pin) => describePin(pin).title },
  {
    key: 'result',
    header: 'Result',
    cell: (pin) => {
      const { tone, result } = describePin(pin)
      return <StatusBadge tone={tone} label={result} />
    },
  },
  { key: 'accuracy', header: 'Accuracy', align: 'right', cell: (pin) => `${Math.round(pin.accuracy_meters)} m` },
]

/**
 * The location map (Location and security): a pin for each lock request a phone sent with its
 * position, and each location a phone shared on request. Needs location.view_history; the backend
 * audits every view and every request. Positions come from the phone's browser and are not proof.
 */
export function LocationMapPage() {
  const [days, setDays] = useState('7')
  const map = useLoaded((signal) => fetchLocationMap(Number(days), signal), days)
  const { watched, watch, clear } = useLocationRequestWatch(map.reload)
  const [choosing, setChoosing] = useState(false)
  const [person, setPerson] = useState('')
  const [sending, setSending] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const withStepUp = useStepUp()

  const pins = map.data?.pins ?? []
  const people = map.data?.people ?? []
  const arrived = watched?.status === 'fulfilled' ? pins.find((pin) => pin.kind === 'location_request' && pin.captured_at === watched.location?.captured_at && pin.user.id === watched.user.id) : undefined

  async function submitRequest(event: FormEvent) {
    event.preventDefault()
    if (person === '') {
      setRequestError('Choose whose location to request.')
      return
    }
    setSending(true)
    setRequestError(null)
    try {
      const record = await withStepUp('request a location', () => requestLocation(Number(person)))
      watch(record)
      setChoosing(false)
      setPerson('')
    } catch (error) {
      if (!(error instanceof StepUpCancelled)) {
        setRequestError(error instanceof ApiError ? error.message : 'The request could not be sent.')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Location map"
        description="Where phones were when people pressed Lock or Unlock, and locations shared on request. Positions come from each phone's browser and can be off by the accuracy shown."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={map.reload} loading={map.loading && map.data !== null}>
              Refresh
            </Button>
            <Button icon={LocateFixed} onClick={() => setChoosing(true)} disabled={!map.data}>
              Request location
            </Button>
          </>
        }
      />

      {watched && <RequestStatus record={watched} onDismiss={clear} />}

      <div className="flex flex-col gap-6">
        <Card
          title="Map"
          actions={
            <SelectField
              label="Period"
              options={PERIODS}
              value={days}
              onChange={(event) => setDays(event.target.value)}
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
            <>
              <Suspense fallback={<LoadingState label="Loading the map…" className="h-[28rem]" />}>
                <LeafletMap pins={pins} focusPinId={arrived?.id ?? null} className="h-[28rem] w-full" />
              </Suspense>
              <p className="mt-3 text-caption text-text-muted">
                Pins: ✓ succeeded, ✕ failed, ! denied, ? outcome unknown, … in progress, ● location shared on request. Hover
                over or tab to a pin for who, when and the result. Records are deleted after {map.data?.retention_days ?? 30} days.
              </p>
            </>
          )}
        </Card>

        <Card title="Pins" description="The same records as the map, newest first.">
          <DataTable
            caption="Location pins"
            captionHidden
            columns={columns}
            rows={pins}
            rowKey={(pin) => pin.id}
            loading={map.loading && !map.data}
            empty={<EmptyState icon={MapPinIcon} title="No locations in this period" description="Pins appear when someone locks or unlocks from the mobile app, or shares their location on request." />}
          />
        </Card>
      </div>

      <Dialog
        open={choosing}
        onClose={() => {
          setChoosing(false)
          setRequestError(null)
        }}
        title="Request a location"
        description="Their phone sends its position automatically if LockGuard is open on it. They agreed to this when they signed in, and can see each request on their Location screen."
      >
        <form onSubmit={submitRequest} noValidate className="flex flex-col gap-4">
          <SelectField
            label="Person"
            placeholder="Choose a person"
            options={people.map((p) => ({ value: String(p.id), label: p.name }))}
            value={person}
            onChange={(event) => setPerson(event.target.value)}
            error={requestError}
            required
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setChoosing(false)}>
              Cancel
            </Button>
            <Button type="submit" icon={LocateFixed} loading={sending}>
              Request location
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}

/** Where a location request stands, in plain words. */
function RequestStatus({ record, onDismiss }: { record: LocationRequestRecord; onDismiss: () => void }) {
  const name = record.user.name

  if (record.status === 'pending') {
    return (
      <Banner tone="info" title={`Waiting for ${name}'s phone`} className="mb-6">
        It answers only while LockGuard is open on it. The request expires <Timestamp iso={record.expires_at} />.
      </Banner>
    )
  }
  if (record.status === 'fulfilled' && record.location) {
    return (
      <Banner tone="success" title={`${name}'s location received`} onDismiss={onDismiss} className="mb-6">
        Taken <Timestamp iso={record.location.captured_at} />, within about {Math.round(record.location.accuracy_meters)} m. It
        is shown on the map.
      </Banner>
    )
  }
  if (record.status === 'unavailable') {
    return (
      <Banner tone="warning" title={`${name}'s phone could not share its location`} onDismiss={onDismiss} className="mb-6">
        It answered, but {record.failure_reason ? unavailableText[record.failure_reason] : 'gave no position'}.
      </Banner>
    )
  }

  return (
    <Banner tone="warning" title={`${name}'s phone did not answer`} onDismiss={onDismiss} className="mb-6">
      The request expired. The phone can only answer while LockGuard is open on it; it cannot be reached when the app is
      closed.
    </Banner>
  )
}
