import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Device } from '../api/devices'
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

const security = makeUser({ id: 1, name: 'Sam Security', permissions: ['devices.view', 'devices.revoke'] })
const resident = makeUser({ id: 4, name: 'Riley Resident', permissions: ['lock.view_status'] })

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const device = (overrides: Partial<Device> = {}): Device => ({
  id: 'dev-riley',
  name: 'Pixel',
  status: 'trusted',
  current: false,
  browser: 'Chrome on Android',
  last_ip_address: '192.0.2.10',
  first_seen_at: minutesAgo(600),
  last_seen_at: minutesAgo(5),
  registered_at: null,
  trusted_at: minutesAgo(500),
  trusted_by: { id: 4, name: 'Riley Resident' },
  revoked_at: null,
  revoked_by: null,
  revoke_reason: null,
  reported_lost: false,
  user: { id: 4, name: 'Riley Resident', email: 'riley@example.test' },
  ...overrides,
})

const mine = device({ id: 'dev-sam', name: 'Edge on Windows', status: 'recognized', current: true, user: { id: 1, name: 'Sam Security', email: 'sam@example.test' } })

const page = (devices: Device[]) => ({ data: devices, meta: { current_page: 1, last_page: 1, total: devices.length } })
const own = (devices: Device[]) => ({ data: devices, meta: { current_recognized: true, unlock_requires_trusted: false } })

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token; path=/'
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearCookies()
})

describe('Devices', () => {
  it('shows a person only their own devices', async () => {
    mockFetch({ ...signedIn(resident), 'GET /api/v1/auth/devices': () => json(200, own([device({ current: true, user: undefined })])) })
    const { container } = renderAt('/devices')

    expect(await screen.findByRole('heading', { level: 2, name: 'Your devices' })).toBeInTheDocument()
    expect(await screen.findByText('Pixel')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: "Everyone's devices" })).not.toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('lets a security administrator revoke someone else’s device with a reason, but not their own here', async () => {
    let revoked = false
    const fetch = mockFetch({
      ...signedIn(security),
      'GET /api/v1/auth/devices': () => json(200, own([{ ...mine, user: undefined }])),
      'GET /api/v1/devices?page=1': () => json(200, page([revoked ? device({ status: 'revoked', revoked_at: minutesAgo(0), revoked_by: { id: 1, name: 'Sam Security' }, revoke_reason: 'Phone replaced' }) : device(), mine])),
      'POST /api/v1/devices/dev-riley/revoke': () => {
        revoked = true
        return json(200, { data: device({ status: 'revoked' }), meta: { signed_out: null } })
      },
    })
    const { container } = renderAt('/devices')
    const user = userEvent.setup()

    const everyone = (await screen.findByRole('heading', { level: 2, name: "Everyone's devices" })).closest('section')!
    expect(await within(everyone).findByText('Riley Resident · riley@example.test')).toBeInTheDocument()
    expect(within(everyone).queryByRole('button', { name: 'Actions for Edge on Windows' })).not.toBeInTheDocument()
    await expectNoAxeViolations(container)

    await user.click(within(everyone).getByRole('button', { name: 'Actions for Pixel' }))
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Revoke' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Revoke “Pixel”?' })
    expect(dialog).toHaveTextContent('can no longer sign in to this account or send lock commands')
    await user.type(within(dialog).getByLabelText(/^Reason/), 'Phone replaced')
    await user.click(within(dialog).getByRole('button', { name: 'Revoke device' }))

    expect(await screen.findByText('Pixel revoked')).toBeInTheDocument()
    expect(await within(everyone).findByText(/Phone replaced/)).toBeInTheDocument()
    const sent = fetch.mock.calls.find((call) => String(call[0]) === '/api/v1/devices/dev-riley/revoke')
    expect(sent?.[1]?.body).toBe(JSON.stringify({ reason: 'Phone replaced', lost: false }))
  })
})
