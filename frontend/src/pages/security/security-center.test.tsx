import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppNotification } from '../../api/notifications'
import type { SecurityAlert, SecurityIncident } from '../../api/security'
import { AppRoutes } from '../../App'
import { AuthProvider } from '../../auth/AuthProvider'
import { ToastProvider } from '../../components/ui/ToastProvider'
import { clearCookies, json, makeUser, mockFetch, signedIn } from '../../test/api'
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

const handler = makeUser({ name: 'Sam Security', permissions: ['admin.incidents_view', 'admin.incidents_manage'] })
const auditor = makeUser({ permissions: ['admin.incidents_view'] })
const resident = makeUser({ permissions: ['lock.view_status'] })

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const alert = (overrides: Partial<SecurityAlert> = {}): SecurityAlert => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  rule: 'failed_sign_ins',
  rule_label: 'Repeated failed sign-ins',
  category: 'security_incident',
  is_condition: false,
  severity: 'high',
  status: 'open',
  title: 'Repeated failed sign-ins for Riley Resident',
  description: '5 failed sign-in or identity checks in the last 15 minutes.',
  occurrences: 5,
  first_seen_at: minutesAgo(10),
  last_seen_at: minutesAgo(2),
  subject_user: { id: 4, name: 'Riley Resident' },
  subject_lock: null,
  subject_ip: '192.0.2.10',
  incident: null,
  acknowledged_by: null,
  acknowledged_at: null,
  resolved_by: null,
  resolved_at: null,
  resolution: null,
  resolution_note: null,
  last_event_id: null,
  ...overrides,
})

const offline = alert({
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  rule: 'lock_offline',
  rule_label: 'Lock offline',
  category: 'lock_connectivity',
  is_condition: true,
  title: 'Front Door is offline',
  description: 'The lock is not reporting to LockGuard.',
  occurrences: 1,
  subject_user: null,
  subject_lock: { id: 1, name: 'Front Door' },
  subject_ip: null,
})

const incident = (overrides: Partial<SecurityIncident> = {}): SecurityIncident => ({
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  title: 'Repeated failed sign-ins for Riley Resident',
  description: null,
  severity: 'high',
  status: 'new',
  opened_by: null,
  opened_at: minutesAgo(9),
  resolved_at: null,
  closed_at: null,
  updated_at: minutesAgo(9),
  alert_count: 1,
  alerts: [alert()],
  history: [{ at: minutesAgo(9), actor: null, from_status: null, to_status: 'new', note: 'Opened by the alert engine for: Repeated failed sign-ins' }],
  ...overrides,
})

const page = <T,>(rows: T[]) => json(200, { data: rows, meta: { current_page: 1, last_page: 1, total: rows.length } })

const notification = (overrides: Partial<AppNotification> = {}): AppNotification => ({
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  type: 'security_alert',
  category: 'security_incident',
  severity: 'high',
  title: 'Repeated failed sign-ins for Riley Resident',
  description: '5 failed sign-in or identity checks in the last 15 minutes.',
  alert_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  lock_id: null,
  mandatory: true,
  created_at: minutesAgo(2),
  read_at: null,
  ...overrides,
})

const notificationPage = (rows: AppNotification[], unread: number) =>
  json(200, { data: rows, meta: { current_page: 1, last_page: 1, per_page: 30, total: rows.length, unread_count: unread } })

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token; path=/'
})

afterEach(() => {
  clearCookies()
  vi.unstubAllGlobals()
})

describe('the Security Center', () => {
  it('lists alerts that need attention and lets an incident handler acknowledge one', async () => {
    let acknowledged = false
    const fetch = mockFetch({
      ...signedIn(handler),
      'GET /api/v1/security/alerts?status=active': () =>
        page(acknowledged ? [alert({ status: 'acknowledged', acknowledged_by: { id: 1, name: 'Sam Security' } }), offline] : [alert(), offline]),
      'POST /api/v1/security/alerts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/acknowledge': () => {
        acknowledged = true
        return json(200, { data: alert({ status: 'acknowledged' }) })
      },
    })
    const { container } = renderAt('/security')
    const user = userEvent.setup()

    const card = (await screen.findByRole('heading', { name: 'Repeated failed sign-ins for Riley Resident' })).closest('article')!
    expect(within(card).getByText('High')).toBeInTheDocument()
    expect(within(card).getByText('Open')).toBeInTheDocument()
    expect(within(card).getByText('Seen 5 times')).toBeInTheDocument()
    expect(within(card).getByText(/Account: Riley Resident/)).toBeInTheDocument()
    await expectNoAxeViolations(container)

    const offlineCard = screen.getByRole('heading', { name: 'Front Door is offline' }).closest('article')!
    expect(within(offlineCard).queryByRole('button', { name: /Resolve/ })).not.toBeInTheDocument()
    expect(within(offlineCard).getByText('Resolves itself when the problem clears.')).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: /Acknowledge/ }))
    expect(await screen.findByText('Alert acknowledged')).toBeInTheDocument()
    expect(await screen.findByText('Acknowledged by Sam Security')).toBeInTheDocument()
    expect(fetch.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(1)
  })

  it('resolves an event alert with a note', async () => {
    let body: unknown
    mockFetch({
      ...signedIn(handler),
      'GET /api/v1/security/alerts?status=active': () => page(body ? [] : [alert()]),
      'POST /api/v1/security/alerts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/resolve': (request) => {
        body = request.body
        return json(200, { data: alert({ status: 'resolved' }) })
      },
    })
    renderAt('/security')
    const user = userEvent.setup()

    await screen.findByRole('heading', { name: 'Repeated failed sign-ins for Riley Resident' })
    await user.click(screen.getByRole('button', { name: /^Resolve/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Resolve this alert' })
    await user.type(within(dialog).getByRole('textbox', { name: /What was found/ }), 'It was Riley with a new phone.')
    await user.click(within(dialog).getByRole('button', { name: 'Resolve' }))

    expect(await screen.findByText('Nothing needs attention')).toBeInTheDocument()
    expect(body).toEqual({ note: 'It was Riley with a new phone.' })
  })

  it('opens an incident from an alert and goes to it', async () => {
    let opened: unknown
    mockFetch({
      ...signedIn(handler),
      'GET /api/v1/security/alerts?status=active': () => page([alert()]),
      'POST /api/v1/security/incidents': (request) => {
        opened = request.body
        return json(201, { data: incident({ opened_by: { id: 1, name: 'Sam Security' } }) })
      },
      'GET /api/v1/security/incidents/cccccccc-cccc-4ccc-8ccc-cccccccccccc': () => json(200, { data: incident({ opened_by: { id: 1, name: 'Sam Security' } }) }),
    })
    renderAt('/security')
    const user = userEvent.setup()

    await screen.findByRole('heading', { name: 'Repeated failed sign-ins for Riley Resident' })
    await user.click(screen.getByRole('button', { name: /Open incident for/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Open an incident' })
    expect(within(dialog).getByRole('textbox', { name: /Title/ })).toHaveValue('Repeated failed sign-ins for Riley Resident')
    await user.click(within(dialog).getByRole('button', { name: 'Open incident' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Repeated failed sign-ins for Riley Resident' })).toBeInTheDocument()
    expect(opened).toMatchObject({ severity: 'high', alert_ids: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] })
  })

  it('shows an auditor the alerts without any actions', async () => {
    mockFetch({
      ...signedIn(auditor),
      'GET /api/v1/security/alerts?status=active': () => page([alert()]),
    })
    renderAt('/security')

    const card = (await screen.findByRole('heading', { name: 'Repeated failed sign-ins for Riley Resident' })).closest('article')!
    expect(within(card).getByRole('button', { name: /Details/ })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /Acknowledge|Resolve|Open incident/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open incident' })).not.toBeInTheDocument()
  })

  it('opens the alert named in the address, as notifications link to it', async () => {
    mockFetch({
      ...signedIn(handler),
      'GET /api/v1/security/alerts?status=active': () => page([alert()]),
      'GET /api/v1/security/alerts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': () =>
        json(200, { data: alert({ last_event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', context: { ip_address: '192.0.2.10' } }) }),
    })
    renderAt('/security?alert=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    const dialog = await screen.findByRole('dialog', { name: 'Repeated failed sign-ins for Riley Resident' })
    expect(await within(dialog).findByText('192.0.2.10')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Find it in the audit log' })).toHaveAttribute('href', '/audit?search=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
  })

  it('lists open incidents and the security events', async () => {
    mockFetch({
      ...signedIn(handler),
      'GET /api/v1/security/alerts?status=active': () => page([]),
      'GET /api/v1/security/incidents?status=active': () => page([incident()]),
      'GET /api/v1/audit-logs?outcome=failure': () =>
        page([
          {
            event_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            occurred_at: minutesAgo(3),
            action: 'auth.login',
            outcome: 'failure',
            actor_type: 'system',
            actor: null,
            target_user: { id: 4, name: 'Riley Resident' },
            target_lock: null,
            target_device_id: null,
            reason: 'Invalid credentials.',
          },
        ]),
    })
    const { container } = renderAt('/security')
    const user = userEvent.setup()
    await screen.findByText('Nothing needs attention')

    await user.click(screen.getByRole('tab', { name: 'Incidents' }))
    const table = await screen.findByRole('table', { name: 'Incidents (1)' })
    expect(within(table).getByRole('link', { name: 'Repeated failed sign-ins for Riley Resident' })).toHaveAttribute('href', '/security/incidents/cccccccc-cccc-4ccc-8ccc-cccccccccccc')
    expect(within(table).getByText('by the alert engine')).toBeInTheDocument()
    await expectNoAxeViolations(container)

    await user.click(screen.getByRole('tab', { name: 'Security events' }))
    const events = await screen.findByRole('table', { name: 'All failures (1)' })
    expect(within(events).getByText('Sign-in failed')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in the audit log' })).toHaveAttribute('href', '/audit?outcome=failure')
  })

  it('is not offered to people without incident access', async () => {
    mockFetch(signedIn(resident))
    renderAt('/security')

    expect(await screen.findByRole('heading', { level: 1, name: 'Not available to you' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Security center' })).not.toBeInTheDocument()
  })
})

describe('an incident', () => {
  it('shows its alerts and history and moves to a new status with a note', async () => {
    let posted: unknown
    mockFetch({
      ...signedIn(handler),
      'GET /api/v1/security/incidents/cccccccc-cccc-4ccc-8ccc-cccccccccccc': () => json(200, { data: incident() }),
      'POST /api/v1/security/incidents/cccccccc-cccc-4ccc-8ccc-cccccccccccc/status': (request) => {
        posted = request.body
        return json(200, {
          data: incident({
            status: 'investigating',
            history: [
              ...incident().history!,
              { at: minutesAgo(0), actor: { id: 1, name: 'Sam Security' }, from_status: 'new', to_status: 'investigating', note: 'Calling Riley.' },
            ],
          }),
        })
      },
    })
    const { container } = renderAt('/security/incidents/cccccccc-cccc-4ccc-8ccc-cccccccccccc')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { level: 1, name: 'Repeated failed sign-ins for Riley Resident' })).toBeInTheDocument()
    expect(screen.getByText(/Opened by the alert engine for/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Alerts (1)' })).toBeInTheDocument()
    await expectNoAxeViolations(container)

    await user.selectOptions(screen.getByRole('combobox', { name: 'New status' }), 'investigating')
    await user.type(screen.getByRole('textbox', { name: /Note/ }), 'Calling Riley.')
    await user.click(screen.getByRole('button', { name: 'Save status' }))

    const history = (await screen.findByText('Calling Riley.')).closest('li')!
    expect(within(history).getByText('Sam Security')).toBeInTheDocument()
    expect(within(history).getByText('Investigating')).toBeInTheDocument()
    expect(posted).toEqual({ status: 'investigating', note: 'Calling Riley.' })
  })

  it('says a closed incident is final and offers no status change', async () => {
    mockFetch({
      ...signedIn(handler),
      'GET /api/v1/security/incidents/cccccccc-cccc-4ccc-8ccc-cccccccccccc': () => json(200, { data: incident({ status: 'closed', closed_at: minutesAgo(1) }) }),
    })
    renderAt('/security/incidents/cccccccc-cccc-4ccc-8ccc-cccccccccccc')

    expect(await screen.findByText(/This incident is closed and can no longer change/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save status' })).not.toBeInTheDocument()
  })
})

describe('the notification center', () => {
  it('shows the unread count on the bell, lists notifications and marks them read', async () => {
    let read = false
    const fetch = mockFetch({
      ...signedIn(handler),
      'GET /api/v1/notifications/summary': () => json(200, { data: { unread_count: read ? 0 : 1 } }),
      'GET /api/v1/notifications?': () => notificationPage([notification({ read_at: read ? minutesAgo(0) : null })], read ? 0 : 1),
      'POST /api/v1/notifications/dddddddd-dddd-4ddd-8ddd-dddddddddddd/read': () => {
        read = true
        return json(200, { data: notification({ read_at: minutesAgo(0) }) })
      },
    })
    const { container } = renderAt('/notifications')
    const user = userEvent.setup()

    expect(await screen.findByRole('link', { name: 'Notifications, 1 unread' })).toHaveAttribute('href', '/notifications')
    const item = (await screen.findByText('Repeated failed sign-ins for Riley Resident')).closest('li')!
    expect(within(item).getByText('Unread')).toBeInTheDocument()
    expect(within(item).getByText(/cannot be turned off/)).toBeInTheDocument()
    expect(within(item).getByRole('link', { name: 'View the alert' })).toHaveAttribute('href', '/security?alert=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    await expectNoAxeViolations(container)

    await user.click(within(item).getByRole('button', { name: /Mark read/ }))
    expect(await screen.findByRole('link', { name: 'Notifications, none unread' })).toBeInTheDocument()
    expect(await screen.findByText('Read')).toBeInTheDocument()
    expect(fetch.mock.calls.some((c) => String(c[0]).endsWith('/read') && c[1]?.method === 'POST')).toBe(true)
  })

  it('marks everything read at once and hides the alert link from people without incident access', async () => {
    let cleared = false
    mockFetch({
      ...signedIn(resident),
      'GET /api/v1/notifications/summary': () => json(200, { data: { unread_count: cleared ? 0 : 2 } }),
      'GET /api/v1/notifications?': () =>
        notificationPage(
          [
            notification({ mandatory: false, category: 'battery_warning', severity: 'medium', title: 'Front Door: battery 20%', lock_id: 1, read_at: cleared ? minutesAgo(0) : null }),
            notification({ id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2', mandatory: false, title: 'Failed sign-in attempts on your account', read_at: cleared ? minutesAgo(0) : null }),
          ],
          cleared ? 0 : 2,
        ),
      'POST /api/v1/notifications/read-all': () => {
        cleared = true
        return json(200, { data: { marked: 2 } })
      },
    })
    renderAt('/notifications')
    const user = userEvent.setup()

    const battery = (await screen.findByText('Front Door: battery 20%')).closest('li')!
    expect(within(battery).getByText('Battery')).toBeInTheDocument()
    expect(within(battery).getByRole('link', { name: 'Open the lock' })).toHaveAttribute('href', '/locks/1')
    expect(screen.queryByRole('link', { name: 'View the alert' })).not.toBeInTheDocument()

    expect(within(battery).getByText('Unread')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mark all read' }))
    await waitFor(() => expect(screen.getAllByText('Read')).toHaveLength(2))
    expect(screen.getByText('Everything has been read.')).toBeInTheDocument()
  })
})
