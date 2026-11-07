import { MonitorSmartphone } from 'lucide-react'
import { useRef } from 'react'
import { useSearchParams } from 'react-router'
import { listDevices } from '../api/devices'
import { ApiError } from '../api/client'
import { hasAnyPermission, useCurrentUser } from '../auth/auth-context'
import { DeviceList } from '../components/devices/DeviceList'
import { OwnDevicesCard } from '../components/devices/OwnDevicesCard'
import { useAdminDeviceManager } from '../components/devices/useAdminDeviceManager'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { SearchField, SelectField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { LoadingState } from '../components/ui/Spinner'
import { useLoaded } from '../lib/useLoaded'

const FILTERS = ['search', 'status', 'page'] as const

/**
 * Trusted devices (project.md sections 7, 12 and 34.4): everyone sees their own devices; holders of
 * devices.view also see everyone's, and act on them as their permissions allow.
 */
export function DevicesPage() {
  const me = useCurrentUser()
  const canViewAll = hasAnyPermission(me, ['devices.view'])

  return (
    <>
      <PageHeader title="Devices" description="The browsers and phones signed in to LockGuard, and which of them are trusted." />
      <div className="flex flex-col gap-6">
        <OwnDevicesCard />
        {canViewAll && <EveryonesDevices />}
      </div>
    </>
  )
}

function EveryonesDevices() {
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(FILTERS.map((name) => [name, params.get(name) ?? ''])) as Record<(typeof FILTERS)[number], string>
  const filterKey = FILTERS.map((name) => filters[name]).join('|')
  const devices = useLoaded((signal) => listDevices({ ...filters, page: Number(filters.page) || 1 }, signal), filterKey)
  const manager = useAdminDeviceManager(devices.reload)
  const searchTimer = useRef<number | undefined>(undefined)

  function setFilter(name: (typeof FILTERS)[number], value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) {
          next.set(name, value)
        } else {
          next.delete(name)
        }
        if (name !== 'page') {
          next.delete('page')
        }
        return next
      },
      { replace: name === 'search' },
    )
  }

  return (
    <Card
      title="Everyone's devices"
      description="Revoke a device someone no longer uses. Report a lost or stolen one lost: that also signs its owner out everywhere and opens an incident."
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:self-end">
          <SearchField
            label="Search devices by name, person or email"
            placeholder="Search devices"
            defaultValue={filters.search}
            onChange={(event) => {
              const value = event.target.value
              window.clearTimeout(searchTimer.current)
              searchTimer.current = window.setTimeout(() => setFilter('search', value.trim()), 300)
            }}
          />
        </div>
        <SelectField
          label="Status"
          value={filters.status}
          onChange={(event) => setFilter('status', event.target.value)}
          options={[
            { value: '', label: 'Any status' },
            { value: 'trusted', label: 'Trusted' },
            { value: 'recognized', label: 'Not trusted' },
            { value: 'revoked', label: 'Revoked' },
          ]}
        />
      </div>

      {devices.loading && !devices.data ? (
        <LoadingState label="Loading devices…" />
      ) : !devices.data ? (
        <Banner
          tone="danger"
          title="Devices could not be loaded"
          action={
            <Button variant="secondary" size="sm" onClick={devices.reload}>
              Try again
            </Button>
          }
        >
          {devices.error instanceof ApiError ? devices.error.message : 'Something went wrong.'}
        </Banner>
      ) : devices.data.data.length === 0 ? (
        <EmptyState icon={MonitorSmartphone} title="No devices match" description="Try another search or status." />
      ) : (
        <>
          <p className="mb-2 text-caption text-text-muted">
            {devices.data.meta.total} device{devices.data.meta.total === 1 ? '' : 's'}
          </p>
          <DeviceList devices={devices.data.data} manager={manager} showOwner />
          <Pagination
            className="mt-4"
            page={devices.data.meta.current_page}
            pageCount={devices.data.meta.last_page}
            onPageChange={(next) => setFilter('page', String(next))}
            label="Device pages"
          />
        </>
      )}
    </Card>
  )
}
