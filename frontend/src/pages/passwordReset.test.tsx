import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui/ToastProvider'
import { apiError, clearCookies, json, mockFetch } from '../test/api'
import { expectNoAxeViolations } from '../test/axe'

const TOKEN = 'b'.repeat(64)
const SENT = 'If that email belongs to a LockGuard account that can reset its password, a reset link is on its way.'
const signedOut = { 'GET /api/v1/auth/me': () => apiError(401, 'unauthenticated', 'Sign in to continue.') }

/** The JSON body of the first request sent to that method and path. */
function sentBody(fetch: ReturnType<typeof mockFetch>, method: string, path: string): unknown {
  const call = fetch.mock.calls.find(([url, init]) => String(url) === path && (init?.method ?? 'GET') === method)
  return call ? JSON.parse(String(call[1]?.body)) : undefined
}

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

beforeEach(() => {
  clearCookies()
  document.cookie = 'XSRF-TOKEN=test-token; path=/'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('forgot password', () => {
  it('is linked from the sign-in page', async () => {
    mockFetch(signedOut)
    renderAt('/login')

    expect(await screen.findByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/forgot-password')
  })

  it('sends the email and shows the same answer for every address', async () => {
    const fetch = mockFetch({
      ...signedOut,
      'POST /api/v1/auth/password/forgot': () => json(202, { data: { status: 'requested', message: SENT } }),
    })
    const user = userEvent.setup()
    const { container } = renderAt('/forgot-password')

    await user.click(await screen.findByRole('button', { name: 'Email me a reset link' }))
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/Email/), 'pat@example.test')
    await user.click(screen.getByRole('button', { name: 'Email me a reset link' }))

    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(screen.getByText(SENT)).toBeInTheDocument()
    expect(sentBody(fetch, 'POST', '/api/v1/auth/password/forgot')).toEqual({ email: 'pat@example.test' })
    await expectNoAxeViolations(container)
  })

  it('says when too many links were asked for', async () => {
    mockFetch({
      ...signedOut,
      'POST /api/v1/auth/password/forgot': () => apiError(429, 'too_many_requests', 'Too many requests. Try again later.'),
    })
    const user = userEvent.setup()
    renderAt('/forgot-password')

    await user.type(await screen.findByLabelText(/Email/), 'pat@example.test')
    await user.click(screen.getByRole('button', { name: 'Email me a reset link' }))

    expect(await screen.findByText('Could not send the link')).toBeInTheDocument()
  })
})

describe('reset password', () => {
  it('sets the new password from the emailed link and sends people to sign in', async () => {
    const fetch = mockFetch({
      ...signedOut,
      'POST /api/v1/auth/password/reset': () => json(200, { data: { status: 'reset', signed_out: { browser_logins: 1, api_clients: 0 } } }),
    })
    const user = userEvent.setup()
    const { container } = renderAt(`/reset-password#token=${TOKEN}&email=pat%40example.test`)

    expect(await screen.findByText('pat@example.test')).toBeInTheDocument()
    await expectNoAxeViolations(container)

    await user.type(screen.getByLabelText(/^New password/), 'short')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(screen.getByText('Your password needs at least 12 characters.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/^New password/))
    await user.type(screen.getByLabelText(/^New password/), 'brand-new-staple-77')
    await user.type(screen.getByLabelText(/Type the password again/), 'brand-new-staple-77')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(await screen.findByText('Your new password is set')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(sentBody(fetch, 'POST', '/api/v1/auth/password/reset')).toEqual({
      email: 'pat@example.test',
      token: TOKEN,
      password: 'brand-new-staple-77',
      password_confirmation: 'brand-new-staple-77',
    })
  })

  it('offers a new link when the link has expired or was used', async () => {
    mockFetch({
      ...signedOut,
      'POST /api/v1/auth/password/reset': () =>
        apiError(422, 'validation_failed', 'Some fields need attention.', {
          token: ['This reset link is not valid or has expired. Ask for a new one.'],
        }),
    })
    const user = userEvent.setup()
    renderAt(`/reset-password#token=${TOKEN}&email=pat%40example.test`)

    await user.type(await screen.findByLabelText(/^New password/), 'brand-new-staple-77')
    await user.type(screen.getByLabelText(/Type the password again/), 'brand-new-staple-77')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(await screen.findByText('This link no longer works')).toBeInTheDocument()
    expect(screen.getByText(/not valid or has expired/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ask for a new link' })).toHaveAttribute('href', '/forgot-password')
  })

  it('explains a link that is missing its token', async () => {
    mockFetch(signedOut)
    renderAt('/reset-password')

    await waitFor(() => expect(screen.getByText('The reset link is missing a part')).toBeInTheDocument())
  })
})
