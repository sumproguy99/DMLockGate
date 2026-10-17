import { UserPlus } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { fetchLocks } from '../../api/locks'
import { listRoles, listUsers, type ManagedUser } from '../../api/users'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { SearchField, SelectField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useLoaded } from '../../lib/useLoaded'
import { describeUserStatus } from '../../lib/users'

const FILTERS = ['search', 'status', 'role', 'lock_id', 'property_id', 'page'] as const

/** User management (project.md 34.6 B): a searchable, filterable list of accounts. */
export function UsersPage() {
  const me = useCurrentUser()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(FILTERS.map((name) => [name, params.get(name) ?? ''])) as Record<(typeof FILTERS)[number], string>
  const filterKey = FILTERS.map((name) => filters[name]).join('|')

  const users = useLoaded((signal) => listUsers({ ...filters, page: Number(filters.page) || 1 }, signal), filterKey)
  const roles = useLoaded(listRoles, 'roles')
  const locks = useLoaded(fetchLocks, 'locks')

  const properties = useMemo(() => {
    const byId = new Map<number, string>()
    for (const lock of locks.data ?? []) {
      if (lock.property) {
        byId.set(lock.property.id, lock.property.name)
      }
    }
    return [...byId].map(([id, name]) => ({ value: String(id), label: name }))
  }, [locks.data])

  const searchTimer = useRef<number | undefined>(undefined)

  function setFilter(name: (typeof FILTERS)[number], value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) {
          next.set(name, value)
        } else {
          next.delete(name)
        }
        if (name !== 'page') {
          next.delete('page')
        }
        return next
      },
      { replace: name === 'search' },
    )
  }

  const columns: Column<ManagedUser>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (user) => (
        <div className="min-w-0">
          <Link to={`/users/${user.id}`} className="font-medium text-primary-text hover:underline">
            {user.name}
          </Link>
          <p className="truncate text-caption text-text-muted">{user.email}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (user) => <StatusBadge {...describeUserStatus(user)} />,
    },
    {
      key: 'roles',
      header: 'Roles',
      cell: (user) => (user.roles?.length ? user.roles.map((r) => r.name).join(', ') : <span className="text-text-muted">None</span>),
      className: 'hidden md:table-cell',
    },
    {
      key: 'mfa',
      header: 'Two-step',
      cell: (user) => (user.mfa_enabled ? <StatusBadge tone="success" label="On" /> : <StatusBadge tone="warning" label="Off" />),
      className: 'hidden lg:table-cell',
    },
    {
      key: 'last_login',
      header: 'Last sign-in',
      cell: (user) => (user.last_login_at ? <Timestamp iso={user.last_login_at} /> : <span className="text-text-muted">Never</span>),
      className: 'hidden lg:table-cell',
    },
  ]

  const page = users.data?.meta.current_page ?? 1

  return (
    <>
      <PageHeader
        title="Users"
        description="LockGuard accounts, their status and roles. Open a user to change their access."
        actions={
          hasAnyPermission(me, ['users.create']) && (
            <Button icon={UserPlus} onClick={() => navigate('/users/new')}>
              Add user
            </Button>
          )
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="sm:col-span-2 xl:col-span-1 xl:self-end">
          <SearchField
            label="Search users by name, username or email"
            placeholder="Search users"
            defaultValue={filters.search}
            onChange={(event) => {
              const value = event.target.value
              window.clearTimeout(searchTimer.current)
              searchTimer.current = window.setTimeout(() => setFilter('search', value.trim()), 300)
            }}
          />
        </div>
        <SelectField
          label="Status"
          value={filters.status}
          onChange={(event) => setFilter('status', event.target.value)}
          options={[
            { value: '', label: 'Any status' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'revoked', label: 'Revoked' },
          ]}
        />
        <SelectField
          label="Role"
          value={filters.role}
          onChange={(event) => setFilter('role', event.target.value)}
          options={[{ value: '', label: 'Any role' }, ...(roles.data ?? []).map((role) => ({ value: role.key, label: role.name }))]}
        />
        <SelectField
          label="Property"
          value={filters.property_id}
          onChange={(event) => setFilter('property_id', event.target.value)}
          options={[{ value: '', label: 'Any property' }, ...properties]}
        />
        <SelectField
          label="Lock"
          value={filters.lock_id}
          onChange={(event) => setFilter('lock_id', event.target.value)}
          options={[{ value: '', label: 'Any lock' }, ...(locks.data ?? []).map((lock) => ({ value: String(lock.id), label: lock.name }))]}
        />
      </div>

      {users.error != null && (
        <Banner
          tone="danger"
          title="Users could not be loaded"
          className="mb-4"
          action={
            <Button variant="secondary" size="sm" onClick={users.reload}>
              Try again
            </Button>
          }
        >
          {users.error instanceof Error ? users.error.message : 'Something went wrong.'}
        </Banner>
      )}

      <DataTable
        caption={users.data ? `Users (${users.data.meta.total})` : 'Users'}
        columns={columns}
        rows={users.data?.data ?? []}
        rowKey={(user) => user.id}
        loading={users.loading && !users.data}
        empty={<p className="px-4 py-6 text-text-muted">No users match these filters.</p>}
      />
      <Pagination
        className="mt-4"
        page={page}
        pageCount={users.data?.meta.last_page ?? 1}
        onPageChange={(next) => setFilter('page', String(next))}
      />
    </>
  )
}
