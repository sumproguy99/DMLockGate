import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditRecord } from '../../api/audit'
import { AppRoutes } from '../../App'
import { AuthProvider } from '../../auth/AuthProvider'
import { ToastProvider } from '../../components/ui/ToastProvider'
import { apiError, clearCookies, json, makeUser, mockFetch, signedIn } from '../../test/api'
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

const auditor = makeUser({ permissions: ['admin.incidents_view', 'admin.reports_export', 'lock.view_status'] })

const record = (overrides: Partial<AuditRecord> = {}): AuditRecord => ({
  event_id: '11111111-1111-4111-8111-111111111111',
  occurred_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  action: 'auth.login',
  outcome: 'failure',
  actor_type: 'system',
  actor: null,
  target_user: { id: 4, name: 'Sam Target' },
  target_lock: null,
  target_device_id: null,
  reason: 'Invalid credentials.',
  ...overrides,
})

const page = (records: AuditRecord[]) => json(200, { data: records, meta: { current_page: 1, last_page: 1, total: records.length } })

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token; path=/'
})

afterEach(() => {
  clearCookies()
  vi.unstubAllGlobals()
})

describe('the audit log', () => {
  it('lists events, filters by outcome and by person, and shows the full record', async () => {
    const fetch = mockFetch({
      ...signedIn(auditor),
      'GET /api/v1/audit-logs?': () => page([record(), record({ event_id: '22222222-2222-4222-8222-222222222222', action: 'user.suspended', outcome: 'success', actor_type: 'user', actor: { id: 1, name: 'Ada Admin' }, reason: 'Moved out' })]),
      'GET /api/v1/audit-logs?outcome=failure': () => page([record()]),
      'GET /api/v1/audit-logs?outcome=failure&target_user_id=4': () => page([record()]),
      'GET /api/v1/audit-logs/11111111-1111-4111-8111-111111111111': () =>
        json(200, { data: { ...record(), metadata: { email: 'sam@example.test' }, ip_address: '192.0.2.10', user_agent: 'Firefox', hash: 'abc123', previous_hash: '000' } }),
    })
    const { container } = renderAt('/audit')
    const user = userEvent.setup()

    const table = await screen.findByRole('table', { name: 'Audit events (2)' })
    expect(within(table).getByText('Sign-in failed')).toBeInTheDocument()
    expect(within(table).getByText('User suspended')).toBeInTheDocument()
    expect(within(table).getByText('Not signed in')).toBeInTheDocument()
    await expectNoAxeViolations(container)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Outcome' }), 'failure')
    expect(await screen.findByRole('table', { name: 'Audit events (1)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Sam Target, show only events affecting this person/ }))
    expect(await screen.findByText(/Affecting Sam Target/)).toBeInTheDocument()
    await waitFor(() => expect(fetch.mock.calls.some((c) => String(c[0]) === '/api/v1/audit-logs?outcome=failure&target_user_id=4')).toBe(true))

    await user.click(screen.getByRole('button', { name: 'Details of Sign-in failed' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign-in failed' })
    expect(await within(dialog).findByText('192.0.2.10')).toBeInTheDocument()
    expect(within(dialog).getByText(/sam@example.test/)).toBeInTheDocument()
    expect(within(dialog).getByText('abc123')).toBeInTheDocument()
  })

  it('exports the filtered events as CSV', async () => {
    const create = vi.fn(() => 'blob:csv')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const fetch = mockFetch({
      ...signedIn(auditor),
      'GET /api/v1/audit-logs?category=lock': () => page([]),
      'GET /api/v1/audit-logs/export?category=lock': () =>
        new Response('occurred_at,event_id\n', { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=lockguard-audit-1.csv' } }),
    })
    renderAt('/audit?category=lock')
    const user = userEvent.setup()

    await screen.findByText('No events match these filters')
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    expect(await screen.findByText('Export downloaded')).toBeInTheDocument()
    expect(click).toHaveBeenCalledOnce()
    expect(fetch.mock.calls.some((c) => String(c[0]) === '/api/v1/audit-logs/export?category=lock')).toBe(true)
  })

  it('reports a refused export', async () => {
    mockFetch({
      ...signedIn(auditor),
      'GET /api/v1/audit-logs?': () => page([]),
      'GET /api/v1/audit-logs/export?': () => apiError(429, 'too_many_requests', 'Too many exports. Wait a minute.'),
    })
    renderAt('/audit')
    const user = userEvent.setup()

    await screen.findByText('No events match these filters')
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(await screen.findByText('Too many exports. Wait a minute.')).toBeInTheDocument()
  })

  it('is not available without the incidents permission', async () => {
    mockFetch(signedIn(makeUser({ permissions: ['lock.view_status'] })))
    renderAt('/audit')

    expect(await screen.findByRole('heading', { level: 1, name: 'Not available to you' })).toBeInTheDocument()
  })
})

describe('system health', () => {
  it('shows integration diagnostics and every subsystem', async () => {
    mockFetch({
      ...signedIn(auditor),
      'GET /api/v1/system/health': () =>
        json(200, {
          data: {
            integration: { status: 'unreachable', checked_at: new Date().toISOString(), last_sync_at: null, details: { error: 'The Eufy bridge is not reachable.' } },
            subsystems: [
              { key: 'queue', status: 'warning', summary: '2 job(s) waiting more than two minutes.' },
              { key: 'notifications', status: 'not_implemented', summary: 'Notifications are not built yet.' },
            ],
          },
        }),
    })
    const { container } = renderAt('/system')

    expect(await screen.findByText('The Eufy bridge is not reachable.')).toBeInTheDocument()
    expect(screen.getAllByText('Eufy bridge offline').length).toBeGreaterThan(0)
    expect(screen.getByText('Background jobs')).toBeInTheDocument()
    expect(screen.getByText('Not built yet')).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })
})
