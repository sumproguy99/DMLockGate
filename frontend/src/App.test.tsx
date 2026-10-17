import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api/client'
import { AppRoutes } from './App'
import { USER_ADMIN_PERMISSIONS } from './app/navigation'
import { AuthProvider } from './auth/AuthProvider'
import { ToastProvider } from './components/ui/ToastProvider'
import { apiError, clearCookies, json, makeUser, mockFetch, signedIn } from './test/api'
import { expectNoAxeViolations } from './test/axe'

function renderApp(path = '/') {
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

const admin = makeUser({
  permissions: [...USER_ADMIN_PERMISSIONS, 'admin.integration_settings', 'lock.view_status', 'devices.view'],
})
const resident = makeUser({
  name: 'Riley Resident',
  roles: [{ key: 'resident', name: 'Resident' }],
  permissions: ['lock.view_status', 'lock.lock', 'lock.unlock'],
})

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token; path=/'
  try {
    localStorage.clear()
  } catch {
    // jsdom always has storage; the guard matches the app code.
  }
})

afterEach(() => {
  clearCookies()
  vi.unstubAllGlobals()
})

function navLinks() {
  return within(screen.getAllByRole('navigation', { name: 'Main' })[0])
    .getAllByRole('link')
    .map((link) => link.textContent)
}

describe('signing in', () => {
  it('sends a signed-out visitor to sign-in, then to the page they asked for', async () => {
    const fetch = mockFetch({
      'GET /api/v1/auth/me': () => apiError(401, 'unauthenticated', 'Sign in to continue.'),
      'POST /api/v1/auth/login': () => json(200, { data: { status: 'authenticated', user: admin } }),
    })
    const { container } = renderApp('/users')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { name: 'Sign in to DM LockGuard' })).toBeInTheDocument()
    await expectNoAxeViolations(container)

    await user.type(screen.getByRole('textbox', { name: /Email/ }), 'alex@example.test')
    await user.type(screen.getByLabelText(/^Password/), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument()
    const loginCall = fetch.mock.calls.find((call) => String(call[0]) === '/api/v1/auth/login')
    expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({ email: 'alex@example.test', password: 'secret' })
  })

  it('checks for empty fields before sending anything', async () => {
    const fetch = mockFetch({ 'GET /api/v1/auth/me': () => apiError(401, 'unauthenticated', 'Sign in to continue.') })
    renderApp('/login')

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }))

    expect(screen.getByRole('textbox', { name: /Email/ })).toHaveAccessibleDescription('Enter your email address.')
    expect(screen.getByLabelText(/^Password/)).toHaveAccessibleDescription('Enter your password.')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('shows field errors from the backend and other errors as a banner', async () => {
    let attempt = 0
    mockFetch({
      'GET /api/v1/auth/me': () => apiError(401, 'unauthenticated', 'Sign in to continue.'),
      'POST /api/v1/auth/login': () =>
        ++attempt === 1
          ? apiError(422, 'validation_failed', 'Some fields need attention.', { email: ['These credentials do not match our records.'] })
          : apiError(429, 'too_many_requests', 'Too many sign-in attempts. Try again in 1 minute(s).'),
    })
    renderApp('/login')
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox', { name: /Email/ }), 'alex@example.test')
    await user.type(screen.getByLabelText(/^Password/), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('These credentials do not match our records.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Too many sign-in attempts. Try again in 1 minute(s).')).toBeInTheDocument()
  })

  it('toggles password visibility without submitting', async () => {
    mockFetch({ 'GET /api/v1/auth/me': () => apiError(401, 'unauthenticated', 'Sign in to continue.') })
    renderApp('/login')

    const password = await screen.findByLabelText(/^Password/)
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(password).toHaveAttribute('type', 'password')
    await userEvent.click(toggle)
    expect(password).toHaveAttribute('type', 'text')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('asks for the MFA code when the account has one, and accepts a recovery code', async () => {
    const fetch = mockFetch({
      'GET /api/v1/auth/me': () => apiError(401, 'unauthenticated', 'Sign in to continue.'),
      'POST /api/v1/auth/login': () => json(200, { data: { status: 'mfa_required' } }),
      'POST /api/v1/auth/mfa/verify': ({ body }) =>
        (body as { recovery_code?: string }).recovery_code === 'abcd-efgh'
          ? json(200, { data: { status: 'authenticated', user: admin } })
          : apiError(422, 'validation_failed', 'Some fields need attention.', { code: ['That code is not valid.'] }),
    })
    renderApp('/login')
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox', { name: /Email/ }), 'alex@example.test')
    await user.type(screen.getByLabelText(/^Password/), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await user.type(await screen.findByRole('textbox', { name: /Authentication code/ }), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText('That code is not valid.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use a recovery code' }))
    await user.type(screen.getByRole('textbox', { name: /Recovery code/ }), 'abcd-efgh')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    const verifyBodies = fetch.mock.calls
      .filter((call) => String(call[0]) === '/api/v1/auth/mfa/verify')
      .map((call) => JSON.parse(String(call[1]?.body)))
    expect(verifyBodies).toEqual([{ code: '123456' }, { recovery_code: 'abcd-efgh' }])
  })

  it('returns to sign-in with a notice when the MFA step expired', async () => {
    mockFetch({
      'GET /api/v1/auth/me': () => apiError(401, 'unauthenticated', 'Sign in to continue.'),
      'POST /api/v1/auth/login': () => json(200, { data: { status: 'mfa_required' } }),
      'POST /api/v1/auth/mfa/verify': () =>
        apiError(401, 'mfa_session_expired', 'The sign-in attempt expired. Enter your email and password again.'),
    })
    renderApp('/login')
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox', { name: /Email/ }), 'alex@example.test')
    await user.type(screen.getByLabelText(/^Password/), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await user.type(await screen.findByRole('textbox', { name: /Authentication code/ }), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByText('The sign-in attempt expired. Enter your email and password again.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Email/ })).toBeInTheDocument()
  })

  it('offers a retry when LockGuard cannot be reached', async () => {
    let up = false
    const handlers = signedIn(admin)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (!up) {
          throw new TypeError('Failed to fetch')
        }
        return handlers[`GET ${String(input)}`]({ body: undefined, headers: {} })
      }),
    )
    renderApp('/')

    expect(await screen.findByText('LockGuard is unreachable')).toBeInTheDocument()
    up = true
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })
})

describe('the signed-in shell', () => {
  it('shows only the navigation this user may use', async () => {
    mockFetch(signedIn(resident))
    renderApp('/')

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    expect(navLinks()).toEqual(['Dashboard', 'Locks'])
  })

  it('shows administrators every built screen', async () => {
    mockFetch(signedIn(admin))
    const { container } = renderApp('/')

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    expect(navLinks()).toEqual(['Dashboard', 'Users', 'Roles and permissions', 'Properties', 'Locks'])
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Alex Admin')).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('explains, rather than shows, a page the user may not open', async () => {
    mockFetch(signedIn(resident))
    renderApp('/users')

    expect(await screen.findByRole('heading', { level: 1, name: 'Not available to you' })).toBeInTheDocument()
  })

  it('navigates, highlights the current page and moves focus to the content', async () => {
    mockFetch(signedIn(admin))
    renderApp('/')
    const user = userEvent.setup()

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    await user.click(screen.getByRole('link', { name: 'Locks' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Locks' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Locks' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('main')).toHaveFocus()
    expect(document.title).toBe('Locks · DM LockGuard')
  })

  it('collapses the sidebar to icons, keeps link names, and remembers it', async () => {
    mockFetch(signedIn(admin))
    const { unmount } = renderApp('/')
    const user = userEvent.setup()

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()
    unmount()

    renderApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens the navigation drawer and closes it after following a link', async () => {
    mockFetch(signedIn(admin))
    renderApp('/')
    const user = userEvent.setup()

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const drawer = screen.getByRole('dialog', { name: 'DM LockGuard' })
    await user.click(within(drawer).getByRole('link', { name: 'Properties' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Properties' })).toBeInTheDocument()
  })

  it('signs out from the account menu', async () => {
    mockFetch({
      ...signedIn(admin),
      'POST /api/v1/auth/logout': () => json(204, null),
    })
    renderApp('/')
    const user = userEvent.setup()

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    await user.click(screen.getByRole('button', { name: 'Account menu for Alex Admin' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in to DM LockGuard' })).toBeInTheDocument()
  })

  it('returns to sign-in with a notice when the session expires mid-use', async () => {
    mockFetch({
      ...signedIn(admin),
      'GET /api/v1/locks': () => apiError(401, 'unauthenticated', 'Sign in to continue.'),
    })
    renderApp('/')

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    await api('/locks').catch(() => {})

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in to DM LockGuard' })).toBeInTheDocument())
    expect(screen.getByText('Your session ended. Sign in again to continue.')).toBeInTheDocument()
  })

  it('has a skip link to the main content', async () => {
    mockFetch(signedIn(admin))
    renderApp('/')

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main')
  })

  it('shows a not-found page for unknown addresses', async () => {
    mockFetch(signedIn(admin))
    renderApp('/nowhere')

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })
})
