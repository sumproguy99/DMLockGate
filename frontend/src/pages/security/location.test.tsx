import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocationMap, LocationRequestRecord, MapPin } from '../../api/location'
import { AppRoutes } from '../../App'
import { AuthProvider } from '../../auth/AuthProvider'
import { locationRequestTiming } from '../../components/location/useLocationRequestWatch'
import { ToastProvider } from '../../components/ui/ToastProvider'
import { apiError, clearCookies, json, makeUser, mockFetch, signedIn } from '../../test/api'
import { expectNoAxeViolations } from '../../test/axe'

// Leaflet needs a real browser to draw tiles; the page's own behavior is what is tested here.
vi.mock('../../components/location/LeafletMap', () => ({
  default: ({ pins, focusPinId }: { pins: MapPin[]; focusPinId?: number | null }) => (
    <div data-testid="map" data-focus={focusPinId ?? ''}>
      {pins.length} pins on the map
    </div>
  ),
}))

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </ToastProvider>,
  )
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const owner = makeUser({ name: 'Dana Admin', permissions: ['location.view_history', 'lock.view_status'] })

const pins: MapPin[] = [
  {
    id: 1,
    kind: 'lock_request',
    latitude: 35.2271,
    longitude: -80.8431,
    accuracy_meters: 12,
    captured_at: minutesAgo(10),
    at: minutesAgo(10),
    user: { id: 7, name: 'Riley Resident' },
    device: { id: 21, name: 'Riley iPhone', status: 'trusted' },
    action: 'unlock',
    lock: { id: 1, name: 'Front Door' },
    status: 'confirmed_success',
    outcome: 'success',
  },
  {
    id: 2,
    kind: 'lock_request',
    latitude: 35.2272,
    longitude: -80.843,
    accuracy_meters: 30,
    captured_at: minutesAgo(30),
    at: minutesAgo(30),
    user: { id: 8, name: 'Gale Guest' },
    device: null,
    action: 'lock',
    lock: { id: 1, name: 'Front Door' },
    status: 'denied',
    outcome: 'denied',
  },
]

const mapData = (overrides: Partial<LocationMap> = {}): LocationMap => ({
  days: 7,
  retention_days: 30,
  pins,
  people: [
    { id: 7, name: 'Riley Resident' },
    { id: 8, name: 'Gale Guest' },
  ],
  ...overrides,
})

const record = (overrides: Partial<LocationRequestRecord> = {}): LocationRequestRecord => ({
  id: 'loc-1',
  status: 'pending',
  failure_reason: null,
  user: { id: 7, name: 'Riley Resident' },
  requested_at: minutesAgo(0),
  expires_at: minutesAgo(-2),
  completed_at: null,
  location: null,
  ...overrides,
})

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token; path=/'
  locationRequestTiming.pollMs = 5
})

afterEach(() => {
  clearCookies()
  vi.unstubAllGlobals()
})

describe('the location map', () => {
  it('lists each pin with who sent the request, when, and whether it succeeded', async () => {
    mockFetch({ ...signedIn(owner), 'GET /api/v1/location/map?days=7': () => json(200, { data: mapData() }) })
    const { container } = renderAt('/location')

    expect(await screen.findByRole('heading', { level: 1, name: 'Location map' })).toBeInTheDocument()
    expect(await screen.findByText('2 pins on the map')).toBeInTheDocument()
    const rows = within(screen.getByRole('table', { name: 'Location pins' })).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Riley Resident')
    expect(rows[0]).toHaveTextContent('Unlock Front Door')
    expect(rows[0]).toHaveTextContent('Succeeded')
    expect(rows[1]).toHaveTextContent('Gale Guest')
    expect(rows[1]).toHaveTextContent('Denied')
    expect(screen.getByRole('link', { name: 'Location map' })).toHaveAttribute('aria-current', 'page')
    await expectNoAxeViolations(container)
  })

  it('loads another period', async () => {
    const fetch = mockFetch({
      ...signedIn(owner),
      'GET /api/v1/location/map?days=7': () => json(200, { data: mapData() }),
      'GET /api/v1/location/map?days=30': () => json(200, { data: mapData({ days: 30, pins: [] }) }),
    })
    renderAt('/location')
    const user = userEvent.setup()

    await screen.findByText('2 pins on the map')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Period' }), '30')

    expect(await screen.findByText('No locations in this period')).toBeInTheDocument()
    expect(fetch.mock.calls.some((call) => String(call[0]) === '/api/v1/location/map?days=30')).toBe(true)
  })

  it("requests a person's location and shows it when their phone answers", async () => {
    const polls = [record(), record({ status: 'fulfilled', location: { latitude: 35.23, longitude: -80.84, accuracy_meters: 15, captured_at: minutesAgo(0) } })]
    const arrivedPin: MapPin = {
      id: 3,
      kind: 'location_request',
      latitude: 35.23,
      longitude: -80.84,
      accuracy_meters: 15,
      captured_at: polls[1].location!.captured_at,
      at: polls[1].location!.captured_at,
      user: { id: 7, name: 'Riley Resident' },
      device: null,
      requested_by: { id: 1, name: 'Dana Admin' },
    }
    let arrived = false
    const fetch = mockFetch({
      ...signedIn(owner),
      'GET /api/v1/location/map?days=7': () => json(200, { data: mapData(arrived ? { pins: [arrivedPin, ...pins] } : {}) }),
      'POST /api/v1/location/requests': () => json(202, { data: record() }),
      'GET /api/v1/location/requests/loc-1': () => {
        const next = polls.shift()!
        arrived = next.status === 'fulfilled'
        return json(200, { data: next })
      },
    })
    renderAt('/location')
    const user = userEvent.setup()

    await screen.findByText('2 pins on the map')
    await user.click(screen.getByRole('button', { name: 'Request location' }))
    const dialog = screen.getByRole('dialog', { name: 'Request a location' })
    await user.click(within(dialog).getByRole('button', { name: 'Request location' }))
    expect(within(dialog).getByText('Choose whose location to request.')).toBeInTheDocument()

    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Person/ }), '7')
    await user.click(within(dialog).getByRole('button', { name: 'Request location' }))

    expect(await screen.findByText("Riley Resident's location received")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('map')).toHaveAttribute('data-focus', '3'))
    const body = fetch.mock.calls.find((call) => String(call[0]) === '/api/v1/location/requests')?.[1]?.body
    expect(JSON.parse(String(body))).toEqual({ user_id: 7 })
  })

  it('says when the phone could not answer', async () => {
    mockFetch({
      ...signedIn(owner),
      'GET /api/v1/location/map?days=7': () => json(200, { data: mapData() }),
      'POST /api/v1/location/requests': () => json(202, { data: record() }),
      'GET /api/v1/location/requests/loc-1': () => json(200, { data: record({ status: 'expired', completed_at: minutesAgo(0) }) }),
    })
    renderAt('/location')
    const user = userEvent.setup()

    await screen.findByText('2 pins on the map')
    await user.click(screen.getByRole('button', { name: 'Request location' }))
    const dialog = screen.getByRole('dialog', { name: 'Request a location' })
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Person/ }), '7')
    await user.click(within(dialog).getByRole('button', { name: 'Request location' }))

    expect(await screen.findByText("Riley Resident's phone did not answer")).toBeInTheDocument()
    expect(screen.getByText(/it cannot be reached when the app is closed/)).toBeInTheDocument()
  })

  it('shows the backend refusal of a request', async () => {
    mockFetch({
      ...signedIn(owner),
      'GET /api/v1/location/map?days=7': () => json(200, { data: mapData() }),
      'POST /api/v1/location/requests': () => apiError(409, 'account_inactive', 'This account is suspended, revoked or expired, so it cannot share its location.'),
    })
    renderAt('/location')
    const user = userEvent.setup()

    await screen.findByText('2 pins on the map')
    await user.click(screen.getByRole('button', { name: 'Request location' }))
    const dialog = screen.getByRole('dialog', { name: 'Request a location' })
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Person/ }), '8')
    await user.click(within(dialog).getByRole('button', { name: 'Request location' }))

    expect(await within(dialog).findByText(/cannot share its location/)).toBeInTheDocument()
  })

  it('is not offered without location history permission', async () => {
    mockFetch(signedIn(makeUser({ permissions: ['admin.incidents_view'] })))
    renderAt('/location')

    expect(await screen.findByRole('heading', { level: 1, name: 'Not available to you' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Location map' })).not.toBeInTheDocument()
  })
})

describe('device locations', () => {
  const olderPhonePin: MapPin = {
    ...(pins[0] as Extract<MapPin, { kind: 'lock_request' }>),
    id: 5,
    at: minutesAgo(60 * 26),
    captured_at: minutesAgo(60 * 26),
    action: 'lock',
    outcome: 'failure',
  }

  it("shows each device's latest location and expands its whole history", async () => {
    mockFetch({ ...signedIn(owner), 'GET /api/v1/location/map?days=7': () => json(200, { data: mapData({ pins: [...pins, olderPhonePin] }) }) })
    const { container } = renderAt('/device-locations')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { level: 1, name: 'Device locations' })).toBeInTheDocument()
    // Two devices (Riley's phone, and Gale's records without a device): one pin each.
    expect(await screen.findByText('2 pins on the map')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Devices and their locations' })
    const phone = within(list).getByRole('button', { name: /^Riley iPhone/ })
    expect(phone).toHaveAttribute('aria-expanded', 'false')
    expect(phone).toHaveTextContent('2 locations')
    expect(within(list).getByRole('button', { name: /^Device not recorded/ })).toHaveTextContent('Gale Guest')

    await user.click(phone)
    expect(phone).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('3 pins on the map')).toBeInTheDocument()
    const history = document.getElementById(phone.getAttribute('aria-controls')!)!
    const entries = within(history).getAllByRole('button')
    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveTextContent('Unlock Front Door')
    expect(entries[1]).toHaveTextContent('Lock Front Door')
    expect(entries[1]).toHaveTextContent('Failed')
    expect(within(history).getAllByRole('heading', { level: 3 })).toHaveLength(2)

    await user.click(entries[1])
    expect(screen.getByTestId('map')).toHaveAttribute('data-focus', '5')
    expect(entries[1]).toHaveAttribute('aria-pressed', 'true')

    await user.click(phone)
    expect(screen.getByText('2 pins on the map')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Device locations' })).toHaveAttribute('aria-current', 'page')
    await expectNoAxeViolations(container)
  })

  it('says when no device reported a location', async () => {
    mockFetch({ ...signedIn(owner), 'GET /api/v1/location/map?days=7': () => json(200, { data: mapData({ pins: [] }) }) })
    renderAt('/device-locations')

    expect(await screen.findByText('No locations in this period')).toBeInTheDocument()
  })

  it('is not offered without location history permission', async () => {
    mockFetch(signedIn(makeUser({ permissions: ['admin.incidents_view'] })))
    renderAt('/device-locations')

    expect(await screen.findByRole('heading', { level: 1, name: 'Not available to you' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Device locations' })).not.toBeInTheDocument()
  })
})

describe('signing in', () => {
  it('tells people that signing in shares their location', async () => {
    mockFetch({ 'GET /api/v1/auth/me': () => apiError(401, 'unauthenticated', 'Sign in.') })
    renderAt('/login')

    const button = await screen.findByRole('button', { name: 'Sign in' })
    expect(button).toHaveAccessibleDescription(/administrators can request your location/)
  })
})
