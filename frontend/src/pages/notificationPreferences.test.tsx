import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationPreferences } from '../api/notifications'
import type { NotificationSettings } from '../api/settings'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/ToastProvider'
import { clearCookies, json, makeUser, mockFetch, signedIn } from '../test/api'
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

const resident = makeUser({ name: 'Riley Resident', email: 'riley@example.test', permissions: ['lock.view_status'] })
const admin = makeUser({ name: 'Dana Admin', permissions: ['admin.notifications'] })

function preferences(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    categories: [
      { category: 'security_incident', label: 'Security alerts', description: 'Failed sign-ins and more.', in_app: true, email: true, in_app_required: true },
      { category: 'battery_warning', label: 'Lock batteries', description: 'A lock battery running low.', in_app: true, email: true, in_app_required: false },
    ],
    email: 'riley@example.test',
    email_enabled: true,
    email_min_severity: 'medium',
    handles_incidents: false,
    ...overrides,
  }
}

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    email_enabled: true,
    email_min_severity: 'medium',
    required_categories: ['security_incident'],
    categories: [
      { category: 'security_incident', label: 'Security alerts', description: 'Failed sign-ins and more.' },
      { category: 'battery_warning', label: 'Lock batteries', description: 'A lock battery running low.' },
    ],
    updated_at: null,
    updated_by: null,
    mail_configured: true,
    fallback_mailer: 'log',
    retry: { tries: 3, backoff_seconds: [60, 300] },
    retention_days: { resolved_alerts_days: 180, closed_incidents_days: 365, read_notifications_days: 90, unread_notifications_days: 0, deliveries_days: 90 },
    recent_deliveries: [
      {
        id: 1,
        user: 'Riley Resident',
        recipient: 'riley@example.test',
        severity: 'high',
        title: 'Front Door is offline',
        alert_id: null,
        mandatory: false,
        status: 'failed',
        attempts: 3,
        mailer: null,
        last_error: 'Connection refused',
        created_at: '2026-11-11T12:00:00.000Z',
        sent_at: null,
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  clearCookies()
  document.cookie = 'XSRF-TOKEN=test-token; path=/'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('notification preferences', () => {
  it('saves a person’s choices and keeps a required category on in the app', async () => {
    let saved: unknown = null
    mockFetch({
      ...signedIn(resident),
      'GET /api/v1/notifications/preferences': () => json(200, { data: preferences() }),
      'PUT /api/v1/notifications/preferences': ({ body }) => {
        saved = body
        return json(200, { data: preferences() })
      },
    })
    const user = userEvent.setup()
    const { container } = renderAt('/notifications/preferences')

    expect(await screen.findByRole('heading', { level: 1, name: 'Notification preferences' })).toBeInTheDocument()
    const security = within(await screen.findByRole('group', { name: 'Security alerts' }))
    expect(security.getByRole('checkbox', { name: 'In LockGuard' })).toBeDisabled()
    expect(security.getByText('Required by your administrator.')).toBeInTheDocument()
    expect(screen.getByText('riley@example.test')).toBeInTheDocument()
    await expectNoAxeViolations(container)

    const battery = within(screen.getByRole('group', { name: 'Lock batteries' }))
    await user.click(battery.getByRole('checkbox', { name: 'By email' }))
    await user.click(screen.getByRole('button', { name: 'Save preferences' }))

    await waitFor(() =>
      expect(saved).toEqual({
        preferences: {
          security_incident: { in_app: true, email: true },
          battery_warning: { in_app: true, email: false },
        },
      }),
    )
    expect(await screen.findByText('Notification preferences saved')).toBeInTheDocument()
  })

  it('tells incident handlers what they cannot turn off, and says when email is off', async () => {
    mockFetch({
      ...signedIn(resident),
      'GET /api/v1/notifications/preferences': () => json(200, { data: preferences({ handles_incidents: true, email_enabled: false }) }),
    })
    renderAt('/notifications/preferences')

    expect(await screen.findByText('You handle security incidents')).toBeInTheDocument()
    expect(screen.getByText('Alert emails are turned off')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Lock batteries' })).getByRole('checkbox', { name: 'By email' })).toBeDisabled()
  })

  it('is linked from the notification center', async () => {
    mockFetch({
      ...signedIn(resident),
      'GET /api/v1/notifications': () => json(200, { data: [], meta: { current_page: 1, last_page: 1, per_page: 30, total: 0, unread_count: 0 } }),
      'GET /api/v1/notifications/summary': () => json(200, { data: { unread_count: 0 } }),
    })
    renderAt('/notifications')

    expect(await screen.findByRole('link', { name: 'Preferences' })).toHaveAttribute('href', '/notifications/preferences')
  })
})

describe('notification settings', () => {
  it('saves the limits and shows recent deliveries', async () => {
    let saved: unknown = null
    mockFetch({
      ...signedIn(admin),
      'GET /api/v1/settings/notifications': () => json(200, { data: settings() }),
      'PUT /api/v1/settings/notifications': ({ body }) => {
        saved = body
        return json(200, { data: settings({ updated_at: '2026-11-11T13:00:00.000Z', updated_by: 'Dana Admin' }) })
      },
    })
    const user = userEvent.setup()
    const { container } = renderAt('/settings/notifications')

    expect(await screen.findByRole('heading', { level: 1, name: 'Notification settings' })).toBeInTheDocument()
    expect(await screen.findByText('Front Door is offline')).toBeInTheDocument()
    expect(screen.getByText('Connection refused')).toBeInTheDocument()
    expect(screen.getByText('3 tries')).toBeInTheDocument()
    const kept = screen.getByRole('heading', { name: 'How long records are kept' }).closest('section') as HTMLElement
    expect(within(kept).getByText('180 days')).toBeInTheDocument()
    expect(within(kept).getByText('Kept for ever')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Notification settings' })).toHaveAttribute('aria-current', 'page')
    await expectNoAxeViolations(container)

    await user.selectOptions(screen.getByLabelText('Email alerts of'), 'high')
    await user.click(screen.getByRole('checkbox', { name: 'Lock batteries' }))
    await user.click(screen.getByRole('button', { name: 'Save notification settings' }))

    await waitFor(() => expect(saved).toEqual({ email_enabled: true, email_min_severity: 'high', required_categories: ['security_incident', 'battery_warning'] }))
    expect(await screen.findByText('Notification settings saved')).toBeInTheDocument()
  })

  it('warns when email is not set up', async () => {
    mockFetch({
      ...signedIn(admin),
      'GET /api/v1/settings/notifications': () => json(200, { data: settings({ mail_configured: false, recent_deliveries: [] }) }),
    })
    renderAt('/settings/notifications')

    expect(await screen.findByText('Email is not set up')).toBeInTheDocument()
    expect(screen.getByText('No alert emails yet.')).toBeInTheDocument()
  })
})
