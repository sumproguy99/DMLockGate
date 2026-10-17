import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../api/auth'
import type { LockRequest, LockSummary } from '../api/locks'
import type { Dashboard, SystemHealth } from '../api/system'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { commandTiming } from '../components/locks/useLockCommand'
import { ToastProvider } from '../components/ui/ToastProvider'
import { apiError, clearCookies, emptyDashboard, json, makeUser, mockFetch, signedIn } from '../test/api'
import { expectNoAxeViolations } from '../test/axe'

function renderDashboard() {
  return render(
    <ToastProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
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

const admin = makeUser({
  permissions: ['users.create', 'users.suspend', 'admin.integration_settings', 'admin.incidents_view', 'devices.view', 'lock.view_status', 'lock.view_history'],
})

function lock(overrides: Partial<LockSummary> = {}): LockSummary {
  return {
    id: 1,
    name: 'Front Door',
    property: { id: 1, name: 'Home' },
    vendor: 'eufy',
    model: 'T85D0',
    external_id: 'T85D0X',
    firmware_version: null,
    registration_status: 'active',
    commands_enabled: true,
    connection_status: 'connected',
    reported_state: 'locked',
    state_freshness: 'current',
    state_observed_at: minutesAgo(1),
    state_source: 'poll',
    battery_level: 80,
    battery_observed_at: minutesAgo(1),
    last_communication_at: minutesAgo(1),
    last_error: null,
    last_error_at: null,
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

const confirmed = (overrides: Partial<LockRequest> = {}) =>
  lockRequest({
    status: 'confirmed_success',
    status_message: 'Confirmed by the lock.',
    is_final: true,
    command: {
      submitted_at: minutesAgo(0),
      integration_result: 'acknowledged',
      integration_latency_ms: 3000,
      integration_error: null,
      confirmation: 'confirmed',
      confirmation_source: 'poll',
      confirmed_at: minutesAgo(0),
    },
    ...overrides,
  })

function session(user: CurrentUser, { locks = [lock()], dashboard = emptyDashboard, health }: { locks?: LockSummary[]; dashboard?: Dashboard; health?: SystemHealth } = {}) {
  return {
    ...signedIn(user),
    'GET /api/v1/locks': () => json(200, { data: locks }),
    'GET /api/v1/dashboard': () => json(200, { data: dashboard }),
    ...(health ? { 'GET /api/v1/system/health': () => json(200, { data: health }) } : {}),
  }
}

const postedBodies = (fetch: ReturnType<typeof mockFetch>, path: string) =>
  fetch.mock.calls
    .filter((call) => String(call[0]) === path && call[1]?.method === 'POST')
    .map((call) => JSON.parse(String(call[1]?.body)) as Record<string, string>)

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token; path=/'
  commandTiming.pollMs = 5
})

afterEach(() => {
  clearCookies()
  vi.unstubAllGlobals()
  commandTiming.pollMs = 1500
})

describe('the dashboard', () => {
  it('shows a resident their lock, its last request and their own activity, and nothing administrative', async () => {
    const mine = confirmed({ requested_at: minutesAgo(5) })
    mockFetch(
      session(resident, {
        dashboard: {
          ...emptyDashboard,
          last_requests: [mine],
          activity: [
            {
              id: 'req-1',
              kind: 'request',
              occurred_at: minutesAgo(5),
              action: 'lock.request',
              outcome: 'success',
              actor: 'You',
              lock: 'Front Door',
              detail: 'Confirmed by the lock.',
              request: { action: 'lock', status: 'confirmed_success', integration_responded: true },
            },
          ],
        },
      }),
    )
    const { container } = renderDashboard()

    const card = (await screen.findByRole('heading', { level: 3, name: 'Front Door' })).closest('article')!
    expect(within(card).getByText('Locked')).toBeInTheDocument()
    expect(within(card).getByText('Battery 80%')).toBeInTheDocument()
    expect(within(card).getByText('Last request: Lock')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Lock' })).toBeEnabled()
    expect(within(card).getByRole('button', { name: 'Unlock' })).toBeEnabled()

    expect(screen.getByRole('heading', { name: 'Eufy integration' })).toBeInTheDocument()
    expect(screen.getAllByText('Eufy connected')).toHaveLength(2)
    expect(screen.getByText('Lock request: Confirmed')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'System health' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Security' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Users and access' })).not.toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('shows administrators diagnostics, every subsystem, security counts and user counts', async () => {
    mockFetch(
      session(admin, {
        locks: [],
        health: {
          integration: {
            status: 'degraded',
            checked_at: minutesAgo(0),
            last_sync_at: minutesAgo(20),
            details: { degraded_reason: 'cloud_errors', cloud_failures: 3, cloud_ok_at: minutesAgo(30), cloud_last_error: 'HTTP 503', locks_visible: 2 },
          },
          subsystems: [
            { key: 'database', status: 'ok', summary: 'Connected.' },
            { key: 'state_sync', status: 'warning', summary: 'No successful state sync in the last 15 minutes.' },
            { key: 'notifications', status: 'not_implemented', summary: 'Notifications are not built yet.' },
          ],
        },
        dashboard: {
          ...emptyDashboard,
          users: { active: 4, active_without_mfa: 1, suspended: 1, revoked: 0, expired: 2, temporary_access: 3, expiring_access: 1, expiring_within_days: 7 },
          security: {
            window_hours: 24,
            failed_sign_ins: 5,
            failed_mfa: 0,
            failed_step_ups: 1,
            denied_commands: 2,
            unresolved_commands: 1,
            recent: [
              { id: 'e1', kind: 'audit', occurred_at: minutesAgo(3), action: 'auth.login', outcome: 'failure', actor: 'Unknown account', lock: null, detail: 'Invalid credentials.' },
            ],
          },
          activity: [],
        },
      }),
    )
    const { container } = renderDashboard()

    expect(await screen.findByRole('heading', { name: 'System health' })).toBeInTheDocument()
    expect(screen.getAllByText('Eufy degraded')).toHaveLength(2)
    expect(screen.getByText('Repeated Eufy cloud errors')).toBeInTheDocument()
    expect(screen.getByText('HTTP 503')).toBeInTheDocument()
    expect(screen.getByText('Not built yet')).toBeInTheDocument()
    expect(screen.getByText('No successful state sync in the last 15 minutes.')).toBeInTheDocument()

    const security = screen.getByRole('heading', { name: 'Security' }).closest('section')!
    expect(within(security).getByText('Failed sign-ins').nextSibling).toHaveTextContent('5')
    expect(within(security).getByText('Sign-in failed')).toBeInTheDocument()

    const users = screen.getByRole('heading', { name: 'Users and access' }).closest('section')!
    expect(within(users).getByText('Active').nextSibling).toHaveTextContent('4')
    expect(within(users).getByRole('link', { name: 'Manage users' })).toHaveAttribute('href', '/users')

    expect(screen.getByText('No locks to show')).toBeInTheDocument()
    expect(screen.getByText('No activity yet')).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('says plainly when a lock report is old', async () => {
    mockFetch(session(resident, { locks: [lock({ state_freshness: 'stale', state_observed_at: minutesAgo(90) })] }))
    renderDashboard()

    expect(await screen.findByText('Locked (stale)')).toBeInTheDocument()
    expect(screen.getByText(/It may have changed since/)).toBeInTheDocument()
  })

  it('reports an unreachable bridge in the header and the panel', async () => {
    mockFetch(
      session(resident, {
        health: { integration: { status: 'unreachable', checked_at: minutesAgo(0), last_sync_at: null } },
      }),
    )
    renderDashboard()

    await screen.findByRole('heading', { name: 'Eufy integration' })
    expect(screen.getAllByText('Eufy bridge offline')).toHaveLength(2)
    expect(screen.getByText('None recorded')).toBeInTheDocument()
  })

  it('offers a retry when the dashboard cannot be loaded', async () => {
    let up = false
    mockFetch({
      ...session(resident),
      'GET /api/v1/locks': () => (up ? json(200, { data: [lock()] }) : apiError(500, 'server_error', 'The server had a problem.')),
    })
    renderDashboard()

    expect(await screen.findByText('The dashboard could not be loaded')).toBeInTheDocument()
    up = true
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Front Door' })).toBeInTheDocument()
  })
})

describe('lock commands', () => {
  it('follows a lock request through each stage until the lock confirms it', async () => {
    const polls = [
      lockRequest({ status: 'submitted', status_message: 'Sent. Waiting for the lock to report its new state.', command: { ...confirmed().command!, confirmation: null, confirmed_at: null } }),
      confirmed(),
    ]
    let lockLoads = 0
    const fetch = mockFetch({
      ...session(resident),
      'GET /api/v1/locks': () => {
        lockLoads++
        return json(200, { data: [lock({ reported_state: 'unlocked' })] })
      },
      'POST /api/v1/locks/1/commands': () => json(202, { data: lockRequest() }),
      'GET /api/v1/lock-requests/req-1': () => json(200, { data: polls.shift() ?? confirmed() }),
    })
    renderDashboard()
    const user = userEvent.setup()

    const card = (await screen.findByRole('heading', { level: 3, name: 'Front Door' })).closest('article')!
    expect(within(card).getByText('Unlocked')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Lock' }))

    expect(await within(card).findByText('Confirmed')).toBeInTheDocument()
    expect(within(card).getByText('Physical state confirmed').closest('li')).toHaveTextContent('(done)')
    const [body] = postedBodies(fetch, '/api/v1/locks/1/commands')
    expect(body.action).toBe('lock')
    expect(body.idempotency_key).toMatch(/^[0-9a-f]{32}$/)
    await waitFor(() => expect(lockLoads).toBe(2))
  })

  it('asks before unlocking, then for identity when the policy requires it, and sends a fresh request', async () => {
    let attempts = 0
    const fetch = mockFetch({
      ...session(resident),
      'POST /api/v1/locks/1/commands': () =>
        ++attempts === 1
          ? apiError(403, 'step_up_required', 'Confirm your identity before unlocking remotely.')
          : json(202, { data: confirmed({ action: 'unlock' }) }),
      'POST /api/v1/auth/confirm': () => json(200, { data: { confirmed_until: minutesAgo(-10) } }),
    })
    renderDashboard()
    const user = userEvent.setup()

    const card = (await screen.findByRole('heading', { level: 3, name: 'Front Door' })).closest('article')!
    await user.click(within(card).getByRole('button', { name: 'Unlock' }))

    const confirm = screen.getByRole('alertdialog', { name: 'Unlock Front Door?' })
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(postedBodies(fetch, '/api/v1/locks/1/commands')).toHaveLength(0)
    await user.click(within(confirm).getByRole('button', { name: 'Unlock' }))

    const stepUp = await screen.findByRole('dialog', { name: "Confirm it's you" })
    await user.click(within(stepUp).getByRole('button', { name: 'Confirm' }))
    expect(within(stepUp).getByText('Enter your password.')).toBeInTheDocument()
    await user.type(within(stepUp).getByLabelText(/^Password/), 'secret')
    await user.click(within(stepUp).getByRole('button', { name: 'Confirm' }))

    expect(await within(card).findByText('Confirmed')).toBeInTheDocument()
    expect(postedBodies(fetch, '/api/v1/auth/confirm')).toEqual([{ password: 'secret' }])
    const [first, second] = postedBodies(fetch, '/api/v1/locks/1/commands')
    expect(first.action).toBe('unlock')
    expect(second.action).toBe('unlock')
    expect(second.idempotency_key).not.toBe(first.idempotency_key)
  })

  it('cancelling the unlock confirmation sends nothing', async () => {
    const fetch = mockFetch(session(resident))
    renderDashboard()
    const user = userEvent.setup()

    const card = (await screen.findByRole('heading', { level: 3, name: 'Front Door' })).closest('article')!
    await user.click(within(card).getByRole('button', { name: 'Unlock' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(postedBodies(fetch, '/api/v1/locks/1/commands')).toHaveLength(0)
  })

  it('explains a refusal from the backend', async () => {
    mockFetch({
      ...session(resident),
      'POST /api/v1/locks/1/commands': () => apiError(403, 'no_lock_access', 'You have not been given access to this lock.'),
    })
    renderDashboard()
    const user = userEvent.setup()

    const card = (await screen.findByRole('heading', { level: 3, name: 'Front Door' })).closest('article')!
    await user.click(within(card).getByRole('button', { name: 'Lock' }))

    expect(await within(card).findByText('Lock not sent')).toBeInTheDocument()
    expect(within(card).getByText('You have not been given access to this lock.')).toBeInTheDocument()
  })

  it('reports a final failure from the integration honestly', async () => {
    mockFetch({
      ...session(resident),
      'POST /api/v1/locks/1/commands': () =>
        json(202, { data: lockRequest({ status: 'unknown_result', is_final: true, status_message: 'The lock did not confirm in time. Check the door before trying again.' }) }),
    })
    renderDashboard()
    const user = userEvent.setup()

    const card = (await screen.findByRole('heading', { level: 3, name: 'Front Door' })).closest('article')!
    await user.click(within(card).getByRole('button', { name: 'Lock' }))

    expect(await within(card).findByText('Outcome unknown')).toBeInTheDocument()
    expect(within(card).getByText('The lock did not confirm in time. Check the door before trying again.')).toBeInTheDocument()
  })

  it('checks again with the same key when the send got no answer, so it cannot create a second command', async () => {
    let attempts = 0
    const fetch = mockFetch({
      ...session(resident),
      'POST /api/v1/locks/1/commands': () => {
        if (++attempts === 1) {
          throw new TypeError('Failed to fetch')
        }
        return json(202, { data: confirmed() })
      },
    })
    renderDashboard()
    const user = userEvent.setup()

    const card = (await screen.findByRole('heading', { level: 3, name: 'Front Door' })).closest('article')!
    await user.click(within(card).getByRole('button', { name: 'Lock' }))
    expect(await within(card).findByText('No answer from LockGuard')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Check again' }))

    expect(await within(card).findByText('Confirmed')).toBeInTheDocument()
    const [first, second] = postedBodies(fetch, '/api/v1/locks/1/commands')
    expect(second.idempotency_key).toBe(first.idempotency_key)
  })

  it('disables commands the lock does not accept, and hides those the user may not use', async () => {
    mockFetch(
      session(makeUser({ permissions: ['lock.view_status', 'lock.lock'] }), {
        locks: [lock({ commands_enabled: false })],
      }),
    )
    renderDashboard()

    const card = (await screen.findByRole('heading', { level: 3, name: 'Front Door' })).closest('article')!
    expect(within(card).getByRole('button', { name: 'Lock' })).toBeDisabled()
    expect(within(card).queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument()
    expect(within(card).getByText('Commands are turned off for this lock.')).toBeInTheDocument()
  })
})
