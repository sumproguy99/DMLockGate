import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagedUser, PermissionInfo, PermissionPreview, Role } from '../../api/users'
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

const admin = makeUser({
  id: 1,
  name: 'Ada Admin',
  permissions: [
    'users.create',
    'users.edit',
    'users.suspend',
    'users.reactivate',
    'users.revoke',
    'users.assign_roles',
    'users.modify_permissions',
    'devices.revoke_sessions',
    'access.grants_create',
    'access.grants_revoke',
    'devices.view',
    'lock.view_status',
  ],
})

function managed(overrides: Partial<ManagedUser> = {}): ManagedUser {
  return {
    id: 2,
    name: 'Rhea Resident',
    username: null,
    email: 'rhea@example.test',
    status: 'active',
    status_changed_at: null,
    account_expires_at: null,
    is_active: true,
    mfa_enabled: false,
    mfa_required: false,
    created_at: '2026-10-01T10:00:00Z',
    last_login_at: null,
    last_access_event_at: null,
    admin_notes: null,
    roles: [{ key: 'resident', name: 'Resident' }],
    permission_overrides: [],
    locks: [],
    ...overrides,
  }
}

const roles: Role[] = [
  { key: 'resident', name: 'Resident', description: 'Lives here.', is_system: true, permissions: ['lock.lock', 'lock.unlock'] },
  { key: 'temporary_guest', name: 'Temporary guest', description: 'Visits.', is_system: true, permissions: ['lock.lock'] },
]

const catalog: PermissionInfo[] = [
  { key: 'lock.lock', group: 'lock', label: 'Request locking', description: 'Lock a door.', sensitive: false },
  { key: 'lock.unlock', group: 'lock', label: 'Request unlocking', description: 'Unlock a door.', sensitive: true },
  { key: 'users.create', group: 'users', label: 'Create users', description: 'Add accounts.', sensitive: false },
]

function preview(overrides: Partial<PermissionPreview> = {}): PermissionPreview {
  return {
    permissions: catalog.map((p) => ({
      key: p.key,
      group: p.group,
      label: p.label,
      sensitive: p.sensitive,
      granted: p.group === 'lock',
      granting_roles: p.group === 'lock' ? ['resident'] : [],
      override: null,
      reason: '',
    })),
    changes: { gained: [], lost: [], sensitive_gained: [] },
    violations: { roles: [], permissions: [] },
    target_problem: null,
    can_save: true,
    ...overrides,
  }
}

const page = (users: ManagedUser[]) => json(200, { data: users, meta: { current_page: 1, last_page: 1, total: users.length } })

function adminSession(extra: Record<string, Parameters<typeof mockFetch>[0][string]> = {}) {
  return mockFetch({
    ...signedIn(admin),
    'GET /api/v1/roles': () => json(200, { data: roles }),
    'GET /api/v1/permissions': () => json(200, { data: catalog }),
    'POST /api/v1/permission-preview': () => json(200, { data: preview() }),
    'GET /api/v1/users/2': () => json(200, { data: managed() }),
    'GET /api/v1/users/2/security-history': () => json(200, { data: [], next_cursor: null }),
    ...extra,
  })
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token; path=/'
})

afterEach(() => {
  clearCookies()
  vi.unstubAllGlobals()
})

const posted = (fetch: ReturnType<typeof mockFetch>, method: string, path: string) =>
  fetch.mock.calls
    .filter((call) => String(call[0]) === path && call[1]?.method === method)
    .map((call) => JSON.parse(String(call[1]?.body ?? 'null')) as unknown)

describe('the user list', () => {
  it('lists users with status and roles, and filters through the backend', async () => {
    const fetch = adminSession({
      'GET /api/v1/users?page=1': () => page([managed(), managed({ id: 3, name: 'Sam Suspended', status: 'suspended', roles: [] })]),
      'GET /api/v1/users?status=suspended&page=1': () => page([managed({ id: 3, name: 'Sam Suspended', status: 'suspended', roles: [] })]),
    })
    const { container } = renderAt('/users')
    const user = userEvent.setup()

    const table = await screen.findByRole('table', { name: 'Users (2)' })
    expect(within(table).getByRole('link', { name: 'Rhea Resident' })).toHaveAttribute('href', '/users/2')
    expect(within(table).getByText('Suspended')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add user' })).toBeInTheDocument()
    await expectNoAxeViolations(container)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'suspended')
    expect(await screen.findByRole('table', { name: 'Users (1)' })).toBeInTheDocument()
    expect(fetch.mock.calls.some((call) => String(call[0]) === '/api/v1/users?status=suspended&page=1')).toBe(true)
  })
})

describe('a user page', () => {
  it('suspends a user with a reason', async () => {
    const fetch = adminSession({
      'POST /api/v1/users/2/suspend': () => json(200, { data: managed({ status: 'suspended', is_active: false }) }),
    })
    const { container } = renderAt('/users/2')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { level: 1, name: 'Rhea Resident' })).toBeInTheDocument()
    await expectNoAxeViolations(container)
    await user.click(screen.getByRole('button', { name: 'Suspend' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Suspend Rhea Resident?' })
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }))
    expect(within(dialog).getByText(/Give a short reason/)).toBeInTheDocument()

    await user.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Moved out')
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(posted(fetch, 'POST', '/api/v1/users/2/suspend')).toEqual([{ reason: 'Moved out' }])
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })

  it('asks for identity before revoking, then retries', async () => {
    let attempts = 0
    const fetch = adminSession({
      'POST /api/v1/users/2/revoke': () =>
        ++attempts === 1
          ? apiError(403, 'step_up_required', 'Confirm your identity to continue.')
          : json(200, { data: managed({ status: 'revoked', is_active: false }) }),
      'POST /api/v1/auth/confirm': () => json(200, { data: { confirmed_until: '2026-10-17T20:00:00Z' } }),
    })
    renderAt('/users/2')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Revoke' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Revoke Rhea Resident permanently?' })
    await user.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Left the property')
    await user.click(within(dialog).getByRole('button', { name: 'Revoke permanently' }))

    const stepUp = await screen.findByRole('dialog', { name: "Confirm it's you" })
    await user.type(within(stepUp).getByLabelText(/^Password/), 'secret')
    await user.click(within(stepUp).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(screen.getAllByText('Revoked').length).toBeGreaterThan(0))
    expect(posted(fetch, 'POST', '/api/v1/users/2/revoke')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
  })

  it('cancelling the identity check leaves the account unchanged and says nothing failed', async () => {
    adminSession({
      'POST /api/v1/users/2/sessions/revoke': () => apiError(403, 'step_up_required', 'Confirm your identity to continue.'),
    })
    renderAt('/users/2')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Sign out everywhere' }))
    const dialog = screen.getByRole('alertdialog')
    await user.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Shared laptop')
    await user.click(within(dialog).getByRole('button', { name: 'Sign out everywhere' }))
    await user.click(within(await screen.findByRole('dialog', { name: "Confirm it's you" })).getByRole('button', { name: 'Cancel' }))

    expect(within(screen.getByRole('alertdialog')).queryByText('That did not work')).not.toBeInTheDocument()
  })

  it('resets a lost authenticator for someone else, only with the security-policy permission', async () => {
    adminSession({ 'GET /api/v1/users/2': () => json(200, { data: managed({ mfa_enabled: true }) }) })
    const first = renderAt('/users/2')
    expect(await screen.findByRole('heading', { level: 1, name: 'Rhea Resident' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset two-step sign-in' })).not.toBeInTheDocument()
    first.unmount()
    vi.unstubAllGlobals()

    const securityAdmin = makeUser({ ...admin, permissions: [...admin.permissions, 'admin.security_policies'] })
    const fetch = mockFetch({
      ...signedIn(securityAdmin),
      'GET /api/v1/users/2': () => json(200, { data: managed({ mfa_enabled: true }) }),
      'GET /api/v1/users/2/security-history': () => json(200, { data: [], next_cursor: null }),
      'POST /api/v1/users/2/mfa/reset': () => json(200, { data: managed({ mfa_enabled: false }) }),
    })
    renderAt('/users/2')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Reset two-step sign-in' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Reset two-step sign-in for Rhea Resident?' })
    expect(within(dialog).getByText(/can sign in with their password alone until they set up a new authenticator/)).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Lost phone and codes')
    await user.click(within(dialog).getByRole('button', { name: 'Reset two-step sign-in' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(posted(fetch, 'POST', '/api/v1/users/2/mfa/reset')).toEqual([{ reason: 'Lost phone and codes' }])
    expect(await screen.findByText('Two-step sign-in reset')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset two-step sign-in' })).not.toBeInTheDocument()
  })

  it('creates a registration code for a person bound to one device and shows it once', async () => {
    let created = false
    const fetch = mockFetch({
      ...signedIn(makeUser({ ...admin, permissions: [...admin.permissions, 'devices.enroll'] })),
      'GET /api/v1/roles': () => json(200, { data: roles }),
      'GET /api/v1/permissions': () => json(200, { data: catalog }),
      'GET /api/v1/users/2': () => json(200, { data: managed() }),
      'GET /api/v1/users/2/security-history': () => json(200, { data: [], next_cursor: null }),
      'GET /api/v1/users/2/devices': () =>
        json(200, { data: [], meta: { bound: true, registration_code_expires_at: created ? '2026-11-03T12:00:00.000Z' : null } }),
      'POST /api/v1/users/2/device-codes': () => {
        created = true
        return json(201, { data: { code: 'ABCD-EFGH', expires_at: '2026-11-03T12:00:00.000Z' } })
      },
    })
    const { container } = renderAt('/users/2')
    const user = userEvent.setup()

    expect(await screen.findByText('No registered device')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create registration code' }))

    const dialog = await screen.findByRole('dialog', { name: 'Registration code' })
    expect(within(dialog).getByText('ABCD-EFGH')).toBeInTheDocument()
    await expectNoAxeViolations(container)
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))

    expect(await screen.findByText(/An unused code is waiting/)).toBeInTheDocument()
    expect(posted(fetch, 'POST', '/api/v1/users/2/device-codes')).toHaveLength(1)
  })

  it('does not offer to change your own account', async () => {
    adminSession({ 'GET /api/v1/users/1': () => json(200, { data: managed({ id: 1, name: 'Ada Admin' }) }) })
    renderAt('/users/1')

    expect(await screen.findByText('This is your own account')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument()
  })

  it('previews a role change and saves only when the backend says it can be saved', async () => {
    let allowed = false
    const fetch = adminSession({
      'POST /api/v1/permission-preview': ({ body }) => {
        const roles = (body as { roles: string[] }).roles
        return json(
          200,
          {
            data: roles.includes('temporary_guest')
              ? preview({
                  can_save: allowed,
                  changes: { gained: [], lost: [], sensitive_gained: [] },
                  violations: { roles: allowed ? [] : ['temporary_guest'], permissions: [] },
                })
              : preview(),
          },
        )
      },
      'PUT /api/v1/users/2/roles': () => json(200, { data: managed({ roles: [roles[0], { key: 'temporary_guest', name: 'Temporary guest' }] }) }),
    })
    renderAt('/users/2')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('tab', { name: 'Roles and permissions' }))
    await user.click(await screen.findByRole('checkbox', { name: /Temporary guest/ }))
    expect(await screen.findByText("You can't grant this")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save access' })).toBeDisabled()

    allowed = true
    await user.click(screen.getByRole('checkbox', { name: /Temporary guest/ }))
    await user.click(screen.getByRole('checkbox', { name: /Temporary guest/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save access' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Save access' }))

    await waitFor(() => expect(posted(fetch, 'PUT', '/api/v1/users/2/roles')).toEqual([{ roles: ['resident', 'temporary_guest'] }]))
  })

  it('gives and removes lock access', async () => {
    const fetch = adminSession({
      'GET /api/v1/users/2': () =>
        json(200, { data: managed({ locks: [{ id: 5, name: 'Garage', property: { id: 1, name: 'Home' }, valid_from: null, valid_until: null }] }) }),
      'GET /api/v1/locks': () =>
        json(200, {
          data: [
            { id: 5, name: 'Garage' },
            { id: 6, name: 'Front Door' },
          ],
        }),
      'PUT /api/v1/locks/6/access/2': () => json(200, { data: {} }),
      'DELETE /api/v1/locks/5/access/2': () => json(204, null),
    })
    renderAt('/users/2')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('tab', { name: 'Lock access' }))
    expect(await screen.findByText('Garage')).toBeInTheDocument()
    await user.selectOptions(await screen.findByRole('combobox', { name: /Lock/ }), '6')
    await user.click(screen.getByRole('button', { name: 'Give access' }))
    await waitFor(() => expect(posted(fetch, 'PUT', '/api/v1/locks/6/access/2')).toEqual([{ valid_from: null, valid_until: null }]))

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Remove access to Garage?' })
    await user.click(within(confirm).getByRole('button', { name: 'Remove access' }))
    await waitFor(() => expect(fetch.mock.calls.some((c) => String(c[0]) === '/api/v1/locks/5/access/2' && c[1]?.method === 'DELETE')).toBe(true))
  })
})

describe('adding a user', () => {
  it('checks the form, creates the user and opens their page', async () => {
    const fetch = adminSession({
      'POST /api/v1/users': () => json(201, { data: managed() }),
    })
    const { container } = renderAt('/users/new')
    const user = userEvent.setup()

    await screen.findByRole('checkbox', { name: /Resident/ })
    await expectNoAxeViolations(container)
    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Rhea Resident')
    await user.type(screen.getByRole('textbox', { name: /Email/ }), 'rhea@example.test')
    await user.type(screen.getByLabelText(/^First password/), 'correct-horse-42')
    await user.type(screen.getByLabelText(/^Repeat the password/), 'different-42')
    await user.click(screen.getByRole('button', { name: 'Create user' }))
    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/^Repeat the password/))
    await user.type(screen.getByLabelText(/^Repeat the password/), 'correct-horse-42')
    await user.click(screen.getByRole('checkbox', { name: /Resident/ }))
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Rhea Resident' })).toBeInTheDocument()
    expect(posted(fetch, 'POST', '/api/v1/users')).toEqual([
      expect.objectContaining({ name: 'Rhea Resident', email: 'rhea@example.test', roles: ['resident'], username: null }),
    ])
  })
})

describe('roles', () => {
  it('shows what each role includes, grouped by area', async () => {
    const { container } = (adminSession(), renderAt('/roles'))
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { level: 2, name: 'Resident' })).toBeInTheDocument()
    expect(screen.getByText('Lock control · 2 of 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Temporary guest/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'Temporary guest' })).toBeInTheDocument()
    expect(screen.getByText('Lock control · 1 of 2')).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })
})
