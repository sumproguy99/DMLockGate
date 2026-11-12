import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../api/auth'
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

function sent(fetch: ReturnType<typeof mockFetch>, method: string, path: string) {
  return fetch.mock.calls.filter(([url, init]) => String(url) === path && (init?.method ?? 'GET') === method)
}

const changed = { data: { status: 'changed', signed_out: { browser_logins: 1, api_clients: 0 } } }

async function fillIn(current: string, password: string, again = password) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText(/^Current password/), current)
  await user.type(screen.getByLabelText(/^New password/), password)
  await user.type(screen.getByLabelText(/^Type the new password again/), again)
  await user.click(screen.getByRole('button', { name: 'Change password' }))
}

beforeEach(() => {
  clearCookies()
  document.cookie = 'XSRF-TOKEN=test-token; path=/'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('choosing your own password', () => {
  it('shows only the new-password screen until an administrator-chosen password is replaced', async () => {
    const owes = makeUser({ permissions: ['lock.view_status'], password_change_required: true })
    let me: CurrentUser = owes
    const fetch = mockFetch({
      ...signedIn(owes),
      'GET /api/v1/auth/me': () => json(200, { data: me }),
      'PUT /api/v1/auth/password': () => {
        me = { ...owes, password_change_required: false }
        return json(200, changed)
      },
    })
    const { container } = renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Choose your own password' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(sent(fetch, 'GET', '/api/v1/dashboard')).toHaveLength(0)
    await expectNoAxeViolations(container)

    await fillIn('admin-chosen-pass-123', 'my-own-secret-pass-456')

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Choose your own password' })).not.toBeInTheDocument())
    expect(JSON.parse(String(sent(fetch, 'PUT', '/api/v1/auth/password')[0][1]?.body))).toEqual({
      current_password: 'admin-chosen-pass-123',
      password: 'my-own-secret-pass-456',
      password_confirmation: 'my-own-secret-pass-456',
    })
    await waitFor(() => expect(sent(fetch, 'GET', '/api/v1/dashboard').length).toBeGreaterThan(0))
  })

  it('comes before setting up two-step sign-in when both are owed', async () => {
    const owes = makeUser({ roles: [{ key: 'super_administrator', name: 'Super Administrator' }], password_change_required: true, mfa_required: true, mfa_setup_required: true })
    let me: CurrentUser = owes
    mockFetch({
      ...signedIn(owes),
      'GET /api/v1/auth/me': () => json(200, { data: me }),
      'PUT /api/v1/auth/password': () => {
        me = { ...owes, password_change_required: false }
        return json(200, changed)
      },
    })
    renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Choose your own password' })).toBeInTheDocument()
    await fillIn('admin-chosen-pass-123', 'my-own-secret-pass-456')
    expect(await screen.findByRole('heading', { level: 1, name: 'Set up two-step sign-in' })).toBeInTheDocument()
  })

  it('switches to the new-password screen when the server asks for it mid-session', async () => {
    mockFetch({
      ...signedIn(makeUser({ permissions: ['lock.view_status'] })),
      'GET /api/v1/dashboard': () => apiError(403, 'password_change_required', 'An administrator chose your password. Choose your own to carry on.'),
    })
    renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Choose your own password' })).toBeInTheDocument()
  })
})

describe('Account security: change password', () => {
  const account = {
    'GET /api/v1/auth/sessions': () => json(200, { data: { listed: true, sessions: [], api_clients: 0 } }),
  }

  it('changes the password and says how many other sessions ended', async () => {
    const fetch = mockFetch({ ...signedIn(makeUser()), ...account, 'PUT /api/v1/auth/password': () => json(200, changed) })
    renderAt('/m/account')

    await fillIn('old-password-123', 'new-password-456')

    expect(await screen.findByText('Password changed')).toBeInTheDocument()
    expect(screen.getByText('1 other session(s) were signed out.')).toBeInTheDocument()
    expect(sent(fetch, 'PUT', '/api/v1/auth/password')).toHaveLength(1)
    expect(screen.getByLabelText(/^Current password/)).toHaveValue('')
  })

  it('shows the server’s answer on the field and checks the two new passwords match first', async () => {
    const fetch = mockFetch({
      ...signedIn(makeUser()),
      ...account,
      'PUT /api/v1/auth/password': () =>
        json(422, { error: { code: 'validation_failed', message: 'Some fields need attention.', fields: { current_password: ['The current password is incorrect.'] } } }),
    })
    renderAt('/m/account')

    await fillIn('old-password-123', 'new-password-456', 'new-password-789')
    expect(await screen.findByText('The two passwords are not the same. Type it again.')).toBeInTheDocument()
    expect(sent(fetch, 'PUT', '/api/v1/auth/password')).toHaveLength(0)

    const user = userEvent.setup()
    await user.clear(screen.getByLabelText(/^Type the new password again/))
    await user.type(screen.getByLabelText(/^Type the new password again/), 'new-password-456')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('The current password is incorrect.')).toBeInTheDocument()
  })
})
