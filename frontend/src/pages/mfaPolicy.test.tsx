import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../api/auth'
import type { SecurityPolicy } from '../api/settings'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/ToastProvider'
import { apiError, clearCookies, json, makeUser, mockFetch, signedIn } from '../test/api'
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

const superAdmin = makeUser({
  name: 'Dana Admin',
  roles: [{ key: 'super_administrator', name: 'Super Administrator' }],
  permissions: ['admin.security_policies', 'admin.notifications'],
  mfa_required: true,
  mfa_setup_required: true,
})

function policy(overrides: Partial<SecurityPolicy> = {}): SecurityPolicy {
  return {
    mfa_required_roles: ['super_administrator', 'security_administrator'],
    roles: [
      { key: 'super_administrator', name: 'Super Administrator', mfa_required: true, members: 1, members_without_mfa: 0 },
      { key: 'security_administrator', name: 'Security Administrator', mfa_required: true, members: 0, members_without_mfa: 0 },
      { key: 'property_manager', name: 'Property Manager', mfa_required: false, members: 2, members_without_mfa: 2 },
    ],
    updated_at: null,
    updated_by: null,
    ...overrides,
  }
}

function sent(fetch: ReturnType<typeof mockFetch>, method: string, path: string) {
  return fetch.mock.calls.filter(([url, init]) => String(url) === path && (init?.method ?? 'GET') === method)
}

beforeEach(() => {
  clearCookies()
  document.cookie = 'XSRF-TOKEN=test-token; path=/'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('two-step sign-in required by role', () => {
  it('shows only the setup screen until the authenticator is set up, then the app', async () => {
    let me: CurrentUser = superAdmin
    const fetch = mockFetch({
      ...signedIn(superAdmin),
      'GET /api/v1/auth/me': () => json(200, { data: me }),
      'POST /api/v1/auth/mfa': () => json(201, { data: { secret: 'JBSWY3DPEHPK3PXP', otpauth_uri: 'otpauth://totp/LockGuard:dana?secret=JBSWY3DPEHPK3PXP' } }),
      'POST /api/v1/auth/mfa/confirm': () => {
        me = { ...superAdmin, mfa_enabled: true, mfa_setup_required: false }
        return json(200, { data: { mfa_enabled: true, recovery_codes: ['aaaa-1111', 'bbbb-2222'] } })
      },
    })
    const { container } = renderAt('/')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { level: 1, name: 'Set up two-step sign-in' })).toBeInTheDocument()
    expect(screen.getByText(/Super Administrator must sign in with a code/)).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(sent(fetch, 'GET', '/api/v1/dashboard')).toHaveLength(0)
    await expectNoAxeViolations(container)

    await user.click(screen.getByRole('button', { name: 'Set up two-step verification' }))
    await user.type(await screen.findByLabelText(/^Code from the app/), '123456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    expect(await screen.findByText('aaaa-1111')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'I have saved them' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Set up two-step sign-in' })).not.toBeInTheDocument())
    await waitFor(() => expect(sent(fetch, 'GET', '/api/v1/dashboard').length).toBeGreaterThan(0))
  })

  it('can sign out from the setup screen', async () => {
    mockFetch({
      ...signedIn(superAdmin),
      'POST /api/v1/auth/logout': () => json(204, null),
    })
    renderAt('/')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('switches to the setup screen when the server starts requiring it mid-session', async () => {
    const admin = { ...superAdmin, mfa_required: false, mfa_setup_required: false }
    mockFetch({
      ...signedIn(admin),
      'GET /api/v1/dashboard': () => apiError(403, 'mfa_setup_required', 'Your role must use two-step sign-in. Set up an authenticator app to carry on.'),
    })
    renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Set up two-step sign-in' })).toBeInTheDocument()
  })

  it('moves a required authenticator to a new phone by going straight to setup', async () => {
    let me = makeUser({ permissions: ['lock.view_status'], mfa_enabled: true, mfa_required: true })
    const fetch = mockFetch({
      ...signedIn(me),
      'GET /api/v1/auth/me': () => json(200, { data: me }),
      'GET /api/v1/auth/sessions': () => json(200, { data: { listed: true, sessions: [], api_clients: 0 } }),
      'DELETE /api/v1/auth/mfa': () => {
        me = { ...me, mfa_enabled: false, mfa_setup_required: true }
        return json(204, null)
      },
    })
    renderAt('/m/account')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Move to a new phone' }))
    expect(screen.queryByRole('button', { name: 'Remove authenticator app' })).not.toBeInTheDocument()
    const dialog = await screen.findByRole('alertdialog', { name: 'Move two-step sign-in to a new phone?' })
    await user.click(within(dialog).getByRole('button', { name: 'Remove and set up again' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Set up two-step sign-in' })).toBeInTheDocument()
    expect(sent(fetch, 'DELETE', '/api/v1/auth/mfa')).toHaveLength(1)
  })
})

describe('Settings > Security policy', () => {
  const admin = { ...superAdmin, mfa_enabled: true, mfa_setup_required: false }

  it('lists the roles and saves the chosen ones after an identity check', async () => {
    const fetch = mockFetch({
      ...signedIn(admin),
      'GET /api/v1/settings/security': () => json(200, { data: policy() }),
      'PUT /api/v1/settings/security': ({ body }) =>
        json(200, { data: policy({ mfa_required_roles: (body as { mfa_required_roles: string[] }).mfa_required_roles, updated_at: '2026-11-11T12:00:00.000Z', updated_by: 'Dana Admin' }) }),
    })
    const { container } = renderAt('/settings/security')
    const user = userEvent.setup()

    const manager = await screen.findByRole('checkbox', { name: 'Property Manager' })
    expect(screen.getByRole('checkbox', { name: 'Super Administrator' })).toBeChecked()
    expect(manager).not.toBeChecked()
    expect(screen.getByText('2 people have this role; 2 of them have not set up two-step sign-in.')).toBeInTheDocument()
    await expectNoAxeViolations(container)

    await user.click(manager)
    expect(screen.getByText(/2 people in the roles you added have no authenticator app yet/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save security policy' }))

    await waitFor(() => expect(sent(fetch, 'PUT', '/api/v1/settings/security')).toHaveLength(1))
    expect(JSON.parse(String(sent(fetch, 'PUT', '/api/v1/settings/security')[0][1]?.body))).toEqual({
      mfa_required_roles: ['super_administrator', 'security_administrator', 'property_manager'],
    })
    expect(await screen.findByText('Security policy saved')).toBeInTheDocument()
  })

  it('warns when no administrator role would need two-step sign-in', async () => {
    mockFetch({
      ...signedIn(admin),
      'GET /api/v1/settings/security': () => json(200, { data: policy() }),
    })
    renderAt('/settings/security')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('checkbox', { name: 'Super Administrator' }))
    await user.click(screen.getByRole('checkbox', { name: 'Security Administrator' }))
    expect(screen.getByText('Administrators would not need two-step sign-in')).toBeInTheDocument()
  })

  it('is listed under Settings only for people who manage security policies', async () => {
    mockFetch({ ...signedIn(admin), 'GET /api/v1/settings/security': () => json(200, { data: policy() }) })
    renderAt('/settings/security')

    const nav = await screen.findByRole('navigation', { name: /main/i })
    expect(within(nav).getByRole('link', { name: 'Security policy' })).toBeInTheDocument()
  })
})
