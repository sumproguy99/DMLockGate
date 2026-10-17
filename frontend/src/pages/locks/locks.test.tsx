import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../../api/auth'
import type { LockRequest, LockSummary } from '../../api/locks'
import { AppRoutes } from '../../App'
import { AuthProvider } from '../../auth/AuthProvider'
import { ToastProvider } from '../../components/ui/ToastProvider'
import { apiError, clearCookies, emptyDashboard, json, makeUser, mockFetch, signedIn } from '../../test/api'
import { expectNoAxeViolations } from '../../test/axe'

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

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const admin = makeUser({
  permissions: ['admin.integration_settings', 'devices.view', 'lock.view_status', 'lock.view_history', 'users.suspend'],
})
const resident = makeUser({ permissions: ['lock.view_status'] })

function lock(overrides: Partial<LockSummary> = {}): LockSummary {
  return {
    id: 1,
    name: 'Front Door',
    property: { id: 1, name: 'Home' },
    vendor: 'eufy',
    model: 'T85D0',
    external_id: 'T85D0ABC1234',
    firmware_version: '1.2.3',
    registration_status: 'active',
    commands_enabled: false,
    connection_status: 'connected',
    reported_state: 'locked',
    state_freshness: 'current',
    state_observed_at: ago(1),
    state_source: 'poll',
    battery_level: 64,
    battery_observed_at: ago(1),
    last_communication_at: ago(1),
    last_error: null,
    last_error_at: null,
    ...overrides,
  }
}

const request: LockRequest = {
  id: 'r1',
  lock_id: 1,
  user_id: 9,
  action: 'unlock',
  channel: 'remote',
  status: 'unknown_result',
  status_message: 'The lock did not confirm in time. Check the door before trying again.',
  is_final: true,
  requested_at: ago(30),
  expires_at: ago(29),
  completed_at: ago(29),
  decision: { decision: 'allow', reason_code: 'authorized', reason: 'All checks passed.' },
  command: null,
}

function session(user: CurrentUser, extra: Parameters<typeof mockFetch>[0] = {}) {
  return mockFetch({
    ...signedIn(user),
    'GET /api/v1/locks': () => json(200, { data: [lock()] }),
    'GET /api/v1/locks/1': () => json(200, { data: lock() }),
    'GET /api/v1/locks/1/history': () =>
      json(200, { data: { states: [{ state: 'locked', source: 'push', observed_at: ago(1), battery_level: 64, external_actor: null }], requests: [request] } }),
    'GET /api/v1/dashboard': () => json(200, { data: { ...emptyDashboard, last_requests: [request] } }),
    'GET /api/v1/properties': () => json(200, { data: [{ id: 1, name: 'Home', address: null, timezone: 'America/New_York', locks_count: 1 }] }),
    ...extra,
  })
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token; path=/'
})

afterEach(() => {
  clearCookies()
  vi.unstubAllGlobals()
})

const bodies = (fetch: ReturnType<typeof mockFetch>, method: string, path: string) =>
  fetch.mock.calls.filter((c) => String(c[0]) === path && c[1]?.method === method).map((c) => JSON.parse(String(c[1]?.body)) as unknown)

describe('the lock list', () => {
  it('shows each lock with what it reported and its last command', async () => {
    session(admin, {
      'GET /api/v1/system/health': () => json(200, { data: { integration: { status: 'degraded', checked_at: ago(0), last_sync_at: ago(5) } } }),
    })
    const { container } = renderAt('/locks')

    const row = (await screen.findByRole('link', { name: 'Front Door' })).closest('tr')!
    expect(within(row).getByText('Locked')).toBeInTheDocument()
    expect(within(row).getByText('Unlock: Outcome unknown')).toBeInTheDocument()
    expect(within(row).getByText('Off')).toBeInTheDocument()
    expect(screen.getByText(/LockGuard refuses lock commands until it recovers/)).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('registers a lock with commands off and opens it', async () => {
    const fetch = session(admin, {
      'POST /api/v1/locks': () => json(201, { data: lock({ id: 1, name: 'Back Door' }) }),
      'GET /api/v1/locks/1': () => json(200, { data: lock({ name: 'Back Door' }) }),
    })
    renderAt('/locks')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Register lock' }))
    const dialog = screen.getByRole('dialog', { name: 'Register a lock' })
    await user.click(within(dialog).getByRole('button', { name: 'Register' }))
    expect(within(dialog).getByText("Enter the lock's serial number.")).toBeInTheDocument()

    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Home' })).toBeInTheDocument())
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Property/ }), '1')
    await user.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Back Door')
    await user.type(within(dialog).getByRole('textbox', { name: /Serial number/ }), 'T85D0BACK0001')
    await user.click(within(dialog).getByRole('button', { name: 'Register' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Back Door' })).toBeInTheDocument()
    expect(bodies(fetch, 'POST', '/api/v1/locks')).toEqual([{ property_id: 1, name: 'Back Door', model: null, external_id: 'T85D0BACK0001' }])
  })

  it('does not offer registration to people who cannot manage locks', async () => {
    session(resident)
    renderAt('/locks')

    await screen.findByRole('link', { name: 'Front Door' })
    expect(screen.queryByRole('button', { name: 'Register lock' })).not.toBeInTheDocument()
  })
})

describe('a lock page', () => {
  it('shows diagnostics with a masked serial, history, and who has access', async () => {
    session(admin, {
      'GET /api/v1/users?lock_id=1': () =>
        json(200, {
          data: [{ id: 9, name: 'Rhea Resident', status: 'active', account_expires_at: null }],
          meta: { current_page: 1, last_page: 1, total: 1 },
        }),
    })
    const { container } = renderAt('/locks/1')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { level: 1, name: 'Front Door' })).toBeInTheDocument()
    expect(screen.getByText('••••1234')).toBeInTheDocument()
    expect(screen.queryByText('T85D0ABC1234')).not.toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Rhea Resident' })).toHaveAttribute('href', '/users/9')
    expect(await screen.findByText('Unlock request: Outcome unknown')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Reported states' }))
    expect(screen.getByText(/Pushed by the lock/)).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('confirms before turning commands on, and asks for identity when required', async () => {
    let attempts = 0
    const fetch = session(admin, {
      'GET /api/v1/users?lock_id=1': () => apiError(403, 'forbidden', 'Not allowed.'),
      'PATCH /api/v1/locks/1': () =>
        ++attempts === 1 ? apiError(403, 'step_up_required', 'Confirm your identity to continue.') : json(200, { data: lock({ commands_enabled: true }) }),
      'POST /api/v1/auth/confirm': () => json(200, { data: {} }),
    })
    renderAt('/locks/1')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Turn on' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Turn on commands for Front Door?' })
    await user.click(within(confirm).getByRole('button', { name: 'Turn on commands' }))
    const stepUp = await screen.findByRole('dialog', { name: "Confirm it's you" })
    await user.type(within(stepUp).getByLabelText(/^Password/), 'secret')
    await user.click(within(stepUp).getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('button', { name: 'Turn off' })).toBeInTheDocument()
    expect(bodies(fetch, 'PATCH', '/api/v1/locks/1')).toEqual([{ commands_enabled: true }, { commands_enabled: true }])
  })

  it('shows a resident the lock without settings or the access list', async () => {
    session(resident)
    renderAt('/locks/1')

    expect(await screen.findByRole('heading', { level: 1, name: 'Front Door' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Who has access' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument()
  })

  it('explains a lock the user cannot see', async () => {
    session(resident, { 'GET /api/v1/locks/1': () => apiError(403, 'forbidden', 'This action is unauthorized.') })
    renderAt('/locks/1')

    expect(await screen.findByRole('heading', { level: 1, name: 'Lock not found' })).toBeInTheDocument()
  })
})

describe('properties', () => {
  it('lists properties and adds one', async () => {
    const fetch = session(admin, {
      'POST /api/v1/properties': () => json(201, { data: { id: 2, name: 'Cabin', address: null, timezone: 'UTC', locks_count: 0 } }),
    })
    renderAt('/properties')
    const user = userEvent.setup()

    expect(await screen.findByText('Home')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Cabin')
    await user.click(screen.getByRole('button', { name: 'Add property' }))

    await waitFor(() => expect(bodies(fetch, 'POST', '/api/v1/properties')).toEqual([expect.objectContaining({ name: 'Cabin', address: null })]))
  })
})
