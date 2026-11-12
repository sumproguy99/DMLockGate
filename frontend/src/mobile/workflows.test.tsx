import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityFeedItem } from '../api/activity'
import type { CurrentUser } from '../api/auth'
import type { Device } from '../api/devices'
import type { LockRequest, LockSummary } from '../api/locks'
import type { SharedLocation } from '../api/location'
import type { SystemHealth } from '../api/system'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { commandTiming } from '../components/locks/useLockCommand'
import { ToastProvider } from '../components/ui/ToastProvider'
import { deriveAlerts } from '../lib/alerts'
import { apiError, clearCookies, json, makeUser, mockFetch, quietHealth, signedIn } from '../test/api'
import { expectNoAxeViolations } from '../test/axe'

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

const resident = makeUser({
  id: 7,
  name: 'Riley Resident',
  roles: [{ key: 'resident', name: 'Resident' }],
  permissions: ['lock.view_status', 'lock.lock', 'lock.unlock', 'lock.remote_unlock', 'lock.view_history'],
})

function lock(overrides: Partial<LockSummary> = {}): LockSummary {
  return {
    id: 1,
    name: 'Front Door',
    property: { id: 1, name: 'Home' },
    vendor: 'eufy',
    model: 'T85D0',
    external_id: 'T85D0X0000FB9',
    firmware_version: '1.2.3',
    registration_status: 'active',
    commands_enabled: true,
    connection_status: 'connected',
    reported_state: 'locked',
    state_freshness: 'current',
    state_observed_at: minutesAgo(1),
    state_source: 'push',
    battery_level: 80,
    battery_observed_at: minutesAgo(1),
    last_communication_at: minutesAgo(1),
    last_error: null,
    last_error_at: null,
    your_access: { granted: true, reason: null },
    ...overrides,
  }
}

function lockRequest(overrides: Partial<LockRequest> = {}): LockRequest {
  return {
    id: 'req-1',
    lock_id: 1,
    user_id: 7,
    action: 'lock',
    channel: 'remote',
    status: 'queued',
    status_message: 'Approved. Sending to the lock.',
    is_final: false,
    requested_at: minutesAgo(0),
    expires_at: minutesAgo(-1),
    completed_at: null,
    decision: { decision: 'allow', reason_code: 'authorized', reason: 'All checks passed.' },
    command: null,
    ...overrides,
  }
}

function session(user: CurrentUser, { locks = [lock()], health = quietHealth }: { locks?: LockSummary[]; health?: SystemHealth } = {}) {
  return {
    ...signedIn(user),
    'GET /api/v1/locks': () => json(200, { data: locks }),
    'GET /api/v1/system/health': () => json(200, { data: health }),
    'GET /api/v1/location/requests/pending': () => json(200, { data: [] }),
    'GET /api/v1/notifications?': () => json(200, { data: [], meta: { current_page: 1, last_page: 1, per_page: 30, total: 0, unread_count: 0 } }),
    'GET /api/v1/location/mine': () => json(200, { data: { notice_version: '2026-10-21', retention_days: 30, shared: [] } }),
  }
}

/** The browser's Geolocation API, answering with a position or refusing as a blocked permission does. */
function stubGeolocation(answer: 'position' | 'denied') {
  const getCurrentPosition = vi.fn((ok: PositionCallback, fail?: PositionErrorCallback | null) => {
    if (answer === 'position') {
      ok({ coords: { latitude: 35.2271, longitude: -80.8431, accuracy: 12 }, timestamp: Date.now() } as GeolocationPosition)
    } else {
      fail?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'denied' } as GeolocationPositionError)
    }
  })
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition, watchPosition: vi.fn() } })
  return getCurrentPosition
}

function phone(overrides: Partial<Device> = {}): Device {
  return {
    id: 'dev-phone',
    name: 'Chrome on Android',
    status: 'recognized',
    current: true,
    browser: 'Chrome on Android',
    last_ip_address: '192.0.2.10',
    first_seen_at: minutesAgo(600),
    last_seen_at: minutesAgo(1),
    registered_at: null,
    trusted_at: null,
    trusted_by: null,
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    reported_lost: false,
    ...overrides,
  }
}

const laptop = (overrides: Partial<Device> = {}): Device =>
  phone({ id: 'dev-laptop', name: 'Edge on Windows', browser: 'Edge on Windows', current: false, last_seen_at: minutesAgo(90), ...overrides })

const ownDevices = (devices: Device[]) => ({ data: devices, meta: { current_recognized: true, unlock_requires_trusted: false } })

const calls = (fetch: ReturnType<typeof mockFetch>, method: string, path: string) =>
  fetch.mock.calls.filter((call) => String(call[0]) === path && (call[1]?.method ?? 'GET') === method)

const lockCard = async (name = 'Front Door') => (await screen.findByRole('heading', { level: 2, name })).closest('article')!

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token; path=/'
  localStorage.clear()
  commandTiming.pollMs = 5
})

afterEach(() => {
  clearCookies()
  vi.unstubAllGlobals()
  commandTiming.pollMs = 1500
})

describe('mobile Home', () => {
  it('greets the user and shows each lock with Lock and Unlock and the connection', async () => {
    mockFetch(session(resident))
    const { container } = renderAt('/m')

    expect(await screen.findByRole('heading', { level: 1, name: /, Riley$/ })).toBeInTheDocument()
    const card = await lockCard()
    expect(within(card).getByText('Locked')).toBeInTheDocument()
    expect(within(card).getByText(/Lock reported locked/)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Lock Front Door' })).toBeEnabled()
    expect(within(card).getByRole('button', { name: 'Unlock Front Door' })).toBeEnabled()
    expect(within(card).getByRole('link', { name: 'Details for Front Door' })).toHaveAttribute('href', '/m/locks/1')
    expect(screen.getByRole('heading', { level: 2, name: 'Connection' }).closest('section')).toHaveTextContent('Eufy connected')
    expect(screen.getByRole('link', { name: 'Notifications, nothing new' })).toBeInTheDocument()
    expect(document.title).toBe('Home · DM LockGuard')
    await expectNoAxeViolations(container)
  })

  it('shows Locking while the command is on its way and only then the confirmed result', async () => {
    const polls = [lockRequest({ status: 'submitted', status_message: 'Sent. Waiting for the lock to report its new state.' })]
    let reported: LockSummary['reported_state'] = 'unlocked'
    // The lock "reports" only once the test has seen the in-between state, however slow the run.
    let report = () => {}
    const reportedByLock = new Promise<void>((resolve) => (report = resolve))
    const fetch = mockFetch({
      ...session(resident),
      'GET /api/v1/locks': () => json(200, { data: [lock({ reported_state: reported })] }),
      'POST /api/v1/locks/1/commands': () => json(202, { data: lockRequest() }),
      'GET /api/v1/lock-requests/req-1': async () => {
        const next = polls.shift()
        if (next) return json(200, { data: next })
        await reportedByLock
        reported = 'locked'
        return json(200, { data: lockRequest({ status: 'confirmed_success', status_message: 'Confirmed by the lock.', is_final: true }) })
      },
    })
    renderAt('/m')
    const user = userEvent.setup()

    const card = await lockCard()
    expect(within(card).getByText('Unlocked')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Lock Front Door' }))

    expect(await within(card).findByText('Locking…')).toBeInTheDocument()
    expect(within(card).getByText('Still unlocked until the lock reports its new state.')).toBeInTheDocument()
    report()
    expect(await within(card).findByText('Confirmed')).toBeInTheDocument()
    expect(await within(card).findByText('Locked')).toBeInTheDocument()
    expect(calls(fetch, 'POST', '/api/v1/locks/1/commands')).toHaveLength(1)
  })

  it('asks before unlocking and sends nothing when cancelled', async () => {
    const fetch = mockFetch(session(resident))
    renderAt('/m')
    const user = userEvent.setup()

    const card = await lockCard()
    await user.click(within(card).getByRole('button', { name: 'Unlock Front Door' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Unlock Front Door?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(calls(fetch, 'POST', '/api/v1/locks/1/commands')).toHaveLength(0)
  })

  it('reports an unknown outcome with guidance and does not send again', async () => {
    const fetch = mockFetch({
      ...session(resident),
      'POST /api/v1/locks/1/commands': () =>
        json(202, {
          data: lockRequest({
            action: 'unlock',
            status: 'unknown_result',
            status_message: 'The lock did not confirm. Check the door before trying again.',
            is_final: true,
          }),
        }),
    })
    renderAt('/m')
    const user = userEvent.setup()

    const card = await lockCard()
    await user.click(within(card).getByRole('button', { name: 'Unlock Front Door' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Unlock' }))

    expect(await within(card).findByText('Outcome unknown')).toBeInTheDocument()
    expect(within(card).getByText('The lock did not confirm. Check the door before trying again.')).toBeInTheDocument()
    expect(within(card).getByText('Locked')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 30))
    expect(calls(fetch, 'POST', '/api/v1/locks/1/commands')).toHaveLength(1)
  })

  it.each([
    [{ state_freshness: 'stale' as const }, 'State stale'],
    [{ reported_state: 'unknown' as const, state_freshness: 'unknown' as const }, 'State unknown'],
    [{ connection_status: 'disconnected' as const }, 'Device unavailable'],
    [{ reported_state: 'jammed' as const }, 'Jammed'],
  ])('distinguishes %o as "%s"', async (overrides, label) => {
    mockFetch(session(resident, { locks: [lock(overrides)] }))
    renderAt('/m')

    expect(within(await lockCard()).getByText(label)).toBeInTheDocument()
  })

  it('hides the controls the user may not use and explains turned-off commands', async () => {
    const guest = makeUser({ ...resident, permissions: ['lock.view_status', 'lock.lock', 'lock.unlock'] })
    mockFetch(session(guest, { locks: [lock({ commands_enabled: false })] }))
    renderAt('/m')

    const card = await lockCard()
    expect(within(card).getByRole('button', { name: 'Lock Front Door' })).toBeDisabled()
    expect(within(card).queryByRole('button', { name: 'Unlock Front Door' })).not.toBeInTheDocument()
    expect(within(card).getByText('Commands are turned off for this lock.')).toBeInTheDocument()
  })

  it('disables the controls and says why when the user has no grant for the lock', async () => {
    const fetch = mockFetch(session(resident, { locks: [lock({ your_access: { granted: false, reason: 'You have not been given access to this lock.' } })] }))
    renderAt('/m')

    const card = await lockCard()
    expect(within(card).getByRole('button', { name: 'Lock Front Door' })).toBeDisabled()
    expect(within(card).getByRole('button', { name: 'Unlock Front Door' })).toBeDisabled()
    expect(within(card).getByText('You have not been given access to this lock.')).toBeInTheDocument()
    expect(calls(fetch, 'POST', '/api/v1/locks/1/commands')).toHaveLength(0)
  })

  it('shows what needs attention at the top, with a count on the bell', async () => {
    mockFetch(session(resident, { locks: [lock({ reported_state: 'jammed' }), lock({ id: 2, name: 'Back Door', battery_level: 20 })] }))
    renderAt('/m')

    const alerts = (await screen.findByRole('heading', { level: 2, name: 'Needs attention' })).closest('section')!
    expect(within(alerts).getByText('Front Door is jammed')).toBeInTheDocument()
    expect(within(alerts).getByText('Back Door: battery 20%')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Notifications, 2 need attention' })).toHaveAttribute('href', '/m/notifications')
  })
})

describe('alerts', () => {
  it('come from the locks and the integration, most severe first', () => {
    const alerts = deriveAlerts(
      [lock({ battery_level: 22 }), lock({ id: 2, name: 'Back Door', connection_status: 'disconnected' })],
      { integration: { ...quietHealth.integration, status: 'degraded', degraded_reason: 'commands_failing' } },
    )

    expect(alerts.map((a) => [a.id, a.severity])).toEqual([
      ['disconnected-2', 'critical'],
      ['integration', 'warning'],
      ['battery-1', 'warning'],
    ])
  })

  it('ignore locks that are not registered for use', () => {
    expect(deriveAlerts([lock({ registration_status: 'disabled', reported_state: 'jammed' })], null)).toEqual([])
  })
})

describe('mobile lock controls', () => {
  it('shows the lock large with its device details and recent requests', async () => {
    mockFetch({
      ...session(resident, { locks: [lock({ last_error: 'The Eufy bridge did not send the command (not_sent).', last_error_at: minutesAgo(3) })] }),
      'GET /api/v1/locks/1/history': () =>
        json(200, { data: { states: [], requests: [lockRequest({ status: 'failed', status_message: 'Could not be delivered.', is_final: true })] } }),
    })
    const { container } = renderAt('/m/locks/1')

    expect(await screen.findByRole('heading', { level: 1, name: 'Front Door' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lock Front Door' })).toBeInTheDocument()
    expect(screen.getByText('••••0FB9')).toBeInTheDocument()
    expect(screen.getByText('1.2.3')).toBeInTheDocument()
    expect(screen.getByText(/did not send the command/)).toBeInTheDocument()
    const recent = (await screen.findByRole('heading', { level: 2, name: 'Recent requests' })).closest('section')!
    expect(await within(recent).findByText('Lock: Failed')).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('says so when the lock is not one of yours', async () => {
    mockFetch(session(resident))
    renderAt('/m/locks/99')

    expect(await screen.findByRole('heading', { level: 1, name: 'Lock not found' })).toBeInTheDocument()
  })
})

function feedItem(overrides: Partial<ActivityFeedItem> = {}): ActivityFeedItem {
  return {
    id: 'a-1',
    kind: 'request',
    occurred_at: minutesAgo(2),
    lock: { id: 1, name: 'Front Door' },
    actor: 'You',
    outcome: 'success',
    request: { action: 'unlock', status: 'confirmed_success', status_message: 'Confirmed by the lock.', integration_responded: true },
    report: null,
    ...overrides,
  }
}

describe('mobile Activity', () => {
  it('lists requests and lock reports, filters them, and loads older ones', async () => {
    const report = feedItem({ id: 'report-9', kind: 'report', actor: 'Reported by the lock', outcome: 'failure', request: null, report: { state: 'jammed', source: 'push' } })
    const fetch = mockFetch({
      ...session(resident),
      'GET /api/v1/activity': () => json(200, { data: [report, feedItem({ actor: 'Another user' })], next_before: '2026-10-18T10:00:00.000Z' }),
      'GET /api/v1/activity?before=2026-10-18T10%3A00%3A00.000Z': () =>
        json(200, { data: [feedItem({ id: 'a-old', request: { action: 'lock', status: 'denied', status_message: 'Denied.', integration_responded: false } })], next_before: null }),
      'GET /api/v1/activity?type=requests&outcome=denied': () => json(200, { data: [], next_before: null }),
    })
    const { container } = renderAt('/m/activity')
    const user = userEvent.setup()

    expect(await screen.findByText('Jammed')).toBeInTheDocument()
    expect(screen.getByText('Unlock request: Confirmed')).toBeInTheDocument()
    expect(screen.getByText(/Another user/)).toBeInTheDocument()
    await expectNoAxeViolations(container)

    await user.click(screen.getByRole('button', { name: 'Load older activity' }))
    expect(await screen.findByText('Lock request: Denied')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load older activity' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Requests' }))
    await user.selectOptions(screen.getByLabelText('Result'), 'denied')
    expect(await screen.findByText('Nothing to show')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Requests' })).toHaveAttribute('aria-pressed', 'true')
    expect(calls(fetch, 'GET', '/api/v1/activity?type=requests&outcome=denied')).toHaveLength(1)
  })

  it('offers a retry when activity cannot be loaded', async () => {
    mockFetch({ ...session(resident), 'GET /api/v1/activity': () => apiError(500, 'server_error', 'Server error.') })
    renderAt('/m/activity')

    expect(await screen.findByText('Activity could not be loaded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('mobile Devices and Notifications', () => {
  it('lists the locks with links to their controls and the phones signed in to the account', async () => {
    mockFetch({ ...session(resident), 'GET /api/v1/auth/devices': () => json(200, ownDevices([phone(), laptop()])) })
    const { container } = renderAt('/m/devices')

    expect(await screen.findByRole('link', { name: /Front Door/ })).toHaveAttribute('href', '/m/locks/1')
    const devices = (await screen.findByRole('heading', { level: 2, name: 'Your devices' })).closest('section')!
    expect(await within(devices).findByText('Edge on Windows')).toBeInTheDocument()
    expect(within(devices).getByText('This device')).toBeInTheDocument()
    expect(within(devices).getByText('This device is not trusted')).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('trusts this phone after the identity check', async () => {
    let trusted = false
    let attempts = 0
    mockFetch({
      ...session(resident),
      'GET /api/v1/auth/devices': () => json(200, ownDevices([phone(trusted ? { status: 'trusted', trusted_at: minutesAgo(0) } : {})])),
      'POST /api/v1/auth/devices/current/trust': () => {
        if (++attempts === 1) {
          return apiError(403, 'step_up_required', 'Confirm your identity to continue.')
        }
        trusted = true
        return json(200, { data: phone({ status: 'trusted' }) })
      },
      'POST /api/v1/auth/confirm': () => json(200, { data: { confirmed_until: minutesAgo(-10) } }),
    })
    renderAt('/m/devices')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Trust this device' }))
    const stepUp = await screen.findByRole('dialog', { name: "Confirm it's you" })
    await user.type(within(stepUp).getByLabelText(/^Password/), 'secret')
    await user.click(within(stepUp).getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('This device is now trusted')).toBeInTheDocument()
    expect(await screen.findByText('Trusted')).toBeInTheDocument()
    expect(screen.queryByText('This device is not trusted')).not.toBeInTheDocument()
  })

  it('reports another device lost after saying what that does', async () => {
    const fetch = mockFetch({
      ...session(resident),
      'GET /api/v1/auth/devices': () => json(200, ownDevices([phone(), laptop()])),
      'POST /api/v1/auth/devices/dev-laptop/revoke': () =>
        json(200, { data: laptop({ status: 'revoked', reported_lost: true }), meta: { signed_out: { browser_logins: 2, api_clients: 0 } } }),
    })
    renderAt('/m/devices')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Actions for Edge on Windows' }))
    await user.click(screen.getByRole('menuitem', { name: 'Report lost' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Report “Edge on Windows” lost?' })
    expect(dialog).toHaveTextContent('every other sign-in on your account also ends now')
    await user.click(within(dialog).getByRole('button', { name: 'Report lost' }))

    expect(await screen.findByText('Edge on Windows reported lost. 2 sign-ins ended.')).toBeInTheDocument()
    expect(calls(fetch, 'POST', '/api/v1/auth/devices/dev-laptop/revoke')[0][1]?.body).toBe(JSON.stringify({ lost: true }))
    expect(screen.queryByRole('button', { name: 'Actions for Chrome on Android' })).toBeInTheDocument()
  })

  it('lists every alert with its severity, or says nothing needs attention', async () => {
    mockFetch(session(resident, { locks: [lock({ connection_status: 'disconnected' })] }))
    const { container } = renderAt('/m/notifications')

    expect(await screen.findByText('Front Door is offline')).toBeInTheDocument()
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the lock' })).toHaveAttribute('href', '/m/locks/1')
    await expectNoAxeViolations(container)
  })

  it('says nothing needs attention when all is well', async () => {
    mockFetch(session(resident))
    renderAt('/m/notifications')

    expect(await screen.findByText('Your locks and the lock integration are reporting normally.')).toBeInTheDocument()
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument()
  })

  it('lists stored notifications with read status and marks one read', async () => {
    let read = false
    const stored = () => ({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      type: 'security_alert',
      category: 'battery_warning',
      severity: 'medium',
      title: 'Front Door: battery 20%',
      description: 'Replace or charge the lock battery soon.',
      alert_id: null,
      lock_id: 1,
      mandatory: false,
      created_at: minutesAgo(30),
      read_at: read ? minutesAgo(0) : null,
    })
    mockFetch({
      ...session(resident),
      'GET /api/v1/notifications/summary': () => json(200, { data: { unread_count: read ? 0 : 1 } }),
      'GET /api/v1/notifications?': () => json(200, { data: [stored()], meta: { current_page: 1, last_page: 1, per_page: 30, total: 1, unread_count: read ? 0 : 1 } }),
      'POST /api/v1/notifications/dddddddd-dddd-4ddd-8ddd-dddddddddddd/read': () => {
        read = true
        return json(200, { data: stored() })
      },
    })
    const { container } = renderAt('/m/notifications')
    const user = userEvent.setup()

    expect(await screen.findByRole('link', { name: 'Notifications, 1 unread' })).toBeInTheDocument()
    const item = (await screen.findByText('Front Door: battery 20%')).closest('li')!
    expect(within(item).getByText('Unread')).toBeInTheDocument()
    expect(within(item).getByRole('link', { name: 'Open the lock' })).toHaveAttribute('href', '/m/locks/1')
    await expectNoAxeViolations(container)

    await user.click(within(item).getByRole('button', { name: /Mark read/ }))
    expect(await screen.findByRole('link', { name: 'Notifications, nothing new' })).toBeInTheDocument()
    expect(within(screen.getByText('Front Door: battery 20%').closest('li')!).getByText('Read')).toBeInTheDocument()
  })
})

describe('mobile Account security', () => {
  const sessions = {
    listed: true,
    sessions: [
      { current: true, device: 'Chrome on Android', ip_address: '192.0.2.10', last_active_at: minutesAgo(0) },
      { current: false, device: 'Edge on Windows', ip_address: '192.0.2.20', last_active_at: minutesAgo(60) },
    ],
    api_clients: 0,
  }

  it('lists where the account is signed in and signs out the others after confirming', async () => {
    const fetch = mockFetch({
      ...session(resident),
      'GET /api/v1/auth/sessions': () => json(200, { data: sessions }),
      'DELETE /api/v1/auth/sessions/others': () => json(200, { data: { signed_out: { browser_logins: 1, api_clients: 0 } } }),
    })
    const { container } = renderAt('/m/account')
    const user = userEvent.setup()

    expect(await screen.findByText('Edge on Windows')).toBeInTheDocument()
    expect(screen.getByText('This device')).toBeInTheDocument()
    await expectNoAxeViolations(container)

    await user.click(screen.getByRole('button', { name: 'Sign out everywhere else' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Sign out everywhere else?' })
    expect(dialog).toHaveTextContent('(1)')
    await user.click(within(dialog).getByRole('button', { name: 'Sign out others' }))

    expect(await screen.findByText('1 other sign-in ended. This phone is still signed in.')).toBeInTheDocument()
    expect(calls(fetch, 'DELETE', '/api/v1/auth/sessions/others')).toHaveLength(1)
  })

  it('sets up two-step verification after an identity check and shows the recovery codes once', async () => {
    let started = 0
    let me = resident
    const fetch = mockFetch({
      ...session(resident),
      'GET /api/v1/auth/me': () => json(200, { data: me }),
      'GET /api/v1/auth/sessions': () => json(200, { data: sessions }),
      'POST /api/v1/auth/mfa': () =>
        ++started === 1
          ? apiError(403, 'step_up_required', 'Confirm your identity to continue.')
          : json(201, { data: { secret: 'JBSWY3DPEHPK3PXP', otpauth_uri: 'otpauth://totp/LockGuard:riley?secret=JBSWY3DPEHPK3PXP' } }),
      'POST /api/v1/auth/confirm': () => json(200, { data: { confirmed_until: minutesAgo(-10) } }),
      'POST /api/v1/auth/mfa/confirm': () => {
        me = { ...resident, mfa_enabled: true }
        return json(200, { data: { mfa_enabled: true, recovery_codes: ['aaaa-1111', 'bbbb-2222'] } })
      },
    })
    // A phone: the otpauth:// link opens the authenticator app on the same device.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)', media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }))
    renderAt('/m/account')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Set up two-step verification' }))
    const stepUp = await screen.findByRole('dialog', { name: "Confirm it's you" })
    await user.type(within(stepUp).getByLabelText(/^Password/), 'secret')
    await user.click(within(stepUp).getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('link', { name: 'Open in authenticator app' })).toHaveAttribute('href', 'otpauth://totp/LockGuard:riley?secret=JBSWY3DPEHPK3PXP')
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Code from the app/), '123456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))

    expect(await screen.findByText('aaaa-1111')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'I have saved them' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Two-step verification' }).closest('section')).toHaveTextContent('On'))
    expect(calls(fetch, 'POST', '/api/v1/auth/mfa/confirm').map((c) => JSON.parse(String(c[1]?.body)))).toEqual([{ code: '123456' }])
  })
})

function sharedEntry(overrides: Partial<SharedLocation> & Pick<SharedLocation, 'id' | 'at' | 'kind'>): SharedLocation {
  return {
    accuracy_meters: 12,
    lock: null,
    action: null,
    requested_by: null,
    device: null,
    latitude: 35.2271,
    longitude: -80.8431,
    captured_at: overrides.at,
    ...overrides,
  }
}

describe('mobile Location, Help and More', () => {
  it('shows what is recorded and every time the location was shared, without asking for a location', async () => {
    const getCurrentPosition = stubGeolocation('position')
    mockFetch({
      ...session(resident),
      'GET /api/v1/location/mine': () =>
        json(200, {
          data: {
            notice_version: '2026-10-21',
            retention_days: 30,
            shared: [
              sharedEntry({ id: 1, at: minutesAgo(5), kind: 'location_request', accuracy_meters: 18, requested_by: 'Dana Admin' }),
              sharedEntry({ id: 2, at: minutesAgo(60), kind: 'lock_request', accuracy_meters: 9, lock: 'Front Door', action: 'unlock', device: 'Riley iPhone' }),
            ],
          },
        }),
    })
    const { container } = renderAt('/m/location')

    expect(await screen.findByRole('heading', { level: 1, name: 'Location and proximity' })).toBeInTheDocument()
    expect(screen.getByText('This browser cannot say')).toBeInTheDocument()
    expect(screen.getByText('On, as agreed when you signed in')).toBeInTheDocument()
    expect(await screen.findByText('Dana Admin asked for your location')).toBeInTheDocument()
    expect(screen.getByText('Unlock request for Front Door')).toBeInTheDocument()
    expect(screen.getByText('Why automatic unlocking is not available')).toBeInTheDocument()
    expect(getCurrentPosition).not.toHaveBeenCalled()
    await expectNoAxeViolations(container)
  })

  it('shows the location timeline by day, with where, why and from which device', async () => {
    mockFetch({
      ...session(resident),
      'GET /api/v1/location/mine': () =>
        json(200, {
          data: {
            notice_version: '2026-10-21',
            retention_days: 30,
            shared: [
              sharedEntry({ id: 1, at: minutesAgo(5), kind: 'location_request', requested_by: 'Dana Admin', device: 'Riley iPhone' }),
              sharedEntry({ id: 2, at: minutesAgo(60 * 30), kind: 'lock_request', lock: 'Front Door', action: 'lock' }),
            ],
          },
        }),
    })
    const { container } = renderAt('/m/location')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('link', { name: 'Timeline' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Location timeline' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2)
    const first = screen.getAllByRole('listitem')[0]
    expect(first).toHaveTextContent('Dana Admin asked for your location')
    expect(first).toHaveTextContent('Riley iPhone')
    expect(within(first).getByRole('link')).toHaveAttribute('href', 'https://www.openstreetmap.org/?mlat=35.22710&mlon=-80.84310#map=17/35.22710/-80.84310')
    expect(screen.getByText('Lock request for Front Door')).toBeInTheDocument()
    expect(screen.getByText(/Device not recorded/)).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('opens help topics', async () => {
    mockFetch(session(resident))
    const { container } = renderAt('/m/help')
    const user = userEvent.setup()

    await user.click(await screen.findByText('A command says "Outcome unknown"'))
    expect(screen.getByText(/LockGuard never repeats a command by itself/)).toBeVisible()
    await expectNoAxeViolations(container)
  })

  it('links to every other mobile screen from More', async () => {
    mockFetch(session(resident))
    renderAt('/m/more')

    const nav = await screen.findByRole('navigation', { name: 'More' })
    expect(within(nav).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/m/notifications', '/m/account', '/m/location', '/m/help'])
  })
})

describe('location sharing from the phone', () => {
  it('sends where the phone was with a lock request, after the command and without delaying it', async () => {
    stubGeolocation('position')
    const fetch = mockFetch({
      ...session(resident),
      'POST /api/v1/locks/1/commands': () => json(202, { data: lockRequest() }),
      'GET /api/v1/lock-requests/req-1': () => json(200, { data: lockRequest({ status: 'confirmed_success', is_final: true }) }),
      'POST /api/v1/lock-requests/req-1/location': () => json(201, { data: { recorded: true } }),
    })
    renderAt('/m')
    const user = userEvent.setup()

    await user.click(within(await lockCard()).getByRole('button', { name: 'Lock Front Door' }))

    await waitFor(() => expect(calls(fetch, 'POST', '/api/v1/lock-requests/req-1/location')).toHaveLength(1))
    const order = fetch.mock.calls.map((call) => String(call[0]))
    expect(order.indexOf('/api/v1/locks/1/commands')).toBeLessThan(order.indexOf('/api/v1/lock-requests/req-1/location'))
    expect(JSON.parse(String(calls(fetch, 'POST', '/api/v1/lock-requests/req-1/location')[0][1]?.body))).toMatchObject({
      latitude: 35.2271,
      longitude: -80.8431,
      accuracy: 12,
    })
  })

  it('pins a denied request too', async () => {
    stubGeolocation('position')
    const fetch = mockFetch({
      ...session(resident),
      'POST /api/v1/locks/1/commands': () =>
        json(403, { error: { code: 'lock_access_expired', message: 'Your access has ended.', details: { request_id: 'req-9' } } }),
      'POST /api/v1/lock-requests/req-9/location': () => json(201, { data: { recorded: true } }),
    })
    renderAt('/m')
    const user = userEvent.setup()

    await user.click(within(await lockCard()).getByRole('button', { name: 'Lock Front Door' }))

    expect(await screen.findByText('Your access has ended.')).toBeInTheDocument()
    await waitFor(() => expect(calls(fetch, 'POST', '/api/v1/lock-requests/req-9/location')).toHaveLength(1))
  })

  it('still sends the command when the browser blocks location', async () => {
    stubGeolocation('denied')
    const fetch = mockFetch({
      ...session(resident),
      'POST /api/v1/locks/1/commands': () => json(202, { data: lockRequest() }),
      'GET /api/v1/lock-requests/req-1': () => json(200, { data: lockRequest({ status: 'confirmed_success', is_final: true }) }),
    })
    renderAt('/m')
    const user = userEvent.setup()

    await user.click(within(await lockCard()).getByRole('button', { name: 'Lock Front Door' }))

    expect(await screen.findByText('Confirmed')).toBeInTheDocument()
    expect(calls(fetch, 'POST', '/api/v1/locks/1/commands')).toHaveLength(1)
    expect(fetch.mock.calls.some((call) => String(call[0]).endsWith('/location'))).toBe(false)
  })

  it("answers an administrator's location request silently while the app is open", async () => {
    stubGeolocation('position')
    let pending = [{ id: 'loc-1', expires_at: minutesAgo(-2) }]
    const fetch = mockFetch({
      ...session(resident),
      'GET /api/v1/location/requests/pending': () => {
        const open = pending
        pending = []
        return json(200, { data: open })
      },
      'POST /api/v1/location/requests/loc-1/respond': () => json(200, { data: { status: 'fulfilled' } }),
    })
    renderAt('/m')

    await waitFor(() => expect(calls(fetch, 'POST', '/api/v1/location/requests/loc-1/respond')).toHaveLength(1))
    expect(JSON.parse(String(calls(fetch, 'POST', '/api/v1/location/requests/loc-1/respond')[0][1]?.body))).toMatchObject({ latitude: 35.2271, accuracy: 12 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('answers that it cannot share from a plain-HTTP address, and says so on the Location screen', async () => {
    const getCurrentPosition = stubGeolocation('position')
    vi.stubGlobal('isSecureContext', false)
    let pending = [{ id: 'loc-3', expires_at: minutesAgo(-2) }]
    const fetch = mockFetch({
      ...session(resident),
      'GET /api/v1/location/requests/pending': () => {
        const open = pending
        pending = []
        return json(200, { data: open })
      },
      'POST /api/v1/location/requests/loc-3/respond': () => json(200, { data: { status: 'unavailable' } }),
    })
    renderAt('/m/location')

    expect(await screen.findByText('This address cannot share your location')).toBeInTheDocument()
    await waitFor(() => expect(calls(fetch, 'POST', '/api/v1/location/requests/loc-3/respond')).toHaveLength(1))
    expect(JSON.parse(String(calls(fetch, 'POST', '/api/v1/location/requests/loc-3/respond')[0][1]?.body))).toEqual({ unavailable: 'unsupported' })
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('answers that it cannot when the browser blocks location', async () => {
    stubGeolocation('denied')
    let pending = [{ id: 'loc-2', expires_at: minutesAgo(-2) }]
    const fetch = mockFetch({
      ...session(resident),
      'GET /api/v1/location/requests/pending': () => {
        const open = pending
        pending = []
        return json(200, { data: open })
      },
      'POST /api/v1/location/requests/loc-2/respond': () => json(200, { data: { status: 'unavailable' } }),
    })
    renderAt('/m')

    await waitFor(() => expect(calls(fetch, 'POST', '/api/v1/location/requests/loc-2/respond')).toHaveLength(1))
    expect(JSON.parse(String(calls(fetch, 'POST', '/api/v1/location/requests/loc-2/respond')[0][1]?.body))).toEqual({ unavailable: 'permission_denied' })
  })
})
