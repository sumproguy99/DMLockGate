import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import { readViewPreference } from '../app/view-preference'
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

/** Makes the browser report a phone-sized (or larger) screen. */
function screenIsPhone(phone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: phone, media: query, addEventListener() {}, removeEventListener() {} }))
}

const resident = makeUser({
  name: 'Riley Resident',
  roles: [{ key: 'resident', name: 'Resident' }],
  permissions: ['lock.view_status', 'lock.lock', 'lock.unlock'],
})

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token; path=/'
  localStorage.clear()
})

afterEach(() => {
  clearCookies()
  vi.unstubAllGlobals()
})

describe('the mobile web app', () => {
  it('opens on a phone and shows only the tabs this person may use', async () => {
    screenIsPhone(true)
    mockFetch(signedIn(resident))
    const { container } = renderAt('/')

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Home', 'Devices', 'More'])
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText('Eufy connected')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Account and more for Riley Resident' })).toHaveAttribute('href', '/m/more')
    await expectNoAxeViolations(container)
  })

  it('opens the desktop dashboard on a larger screen', async () => {
    screenIsPhone(false)
    mockFetch(signedIn(resident))
    renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('moves between tabs and refuses a tab without permission', async () => {
    mockFetch(signedIn(resident))
    renderAt('/m')
    const user = userEvent.setup()

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    await user.click(within(nav).getByRole('link', { name: 'Devices' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Devices' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveFocus()

    await user.click(within(nav).getByRole('link', { name: 'More' }))
    expect(screen.getByRole('heading', { level: 1, name: 'More' })).toBeInTheDocument()
  })

  it('does not show Activity to a person without history permission', async () => {
    mockFetch(signedIn(resident))
    renderAt('/m/activity')

    expect(await screen.findByRole('heading', { level: 1, name: 'Not available to you' })).toBeInTheDocument()
  })

  it('shows the account and switches to the desktop view, remembered for this browser', async () => {
    screenIsPhone(true)
    mockFetch(signedIn(makeUser({ ...resident, mfa_enabled: true })))
    const { container } = renderAt('/m/more')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { level: 1, name: 'More' })).toBeInTheDocument()
    expect(screen.getByText('alex@example.test')).toBeInTheDocument()
    expect(screen.getByText('Resident')).toBeInTheDocument()
    expect(screen.getByText('On')).toBeInTheDocument()
    await expectNoAxeViolations(container)

    await user.click(screen.getByRole('button', { name: 'Use the desktop view' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(readViewPreference()).toBe('desktop')
  })

  it('switches from the desktop account menu to the mobile view', async () => {
    screenIsPhone(false)
    mockFetch(signedIn(resident))
    renderAt('/')
    const user = userEvent.setup()

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    await user.click(screen.getByRole('button', { name: 'Account menu for Riley Resident' }))
    await user.click(screen.getByRole('menuitem', { name: 'Mobile view' }))

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(readViewPreference()).toBe('mobile')
  })

  it('signs out from More', async () => {
    mockFetch({ ...signedIn(resident), 'POST /api/v1/auth/logout': () => json(204, null) })
    renderAt('/m/more')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to DM LockGuard' })).toBeInTheDocument()
  })

  it('shows its own not-found page for an unknown mobile address', async () => {
    mockFetch(signedIn(resident))
    renderAt('/m/nowhere')

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Dashboard')
  })
})
