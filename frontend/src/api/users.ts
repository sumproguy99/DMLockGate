import { api } from './client'

export type UserStatus = 'active' | 'suspended' | 'revoked'
export type PermissionEffect = 'allow' | 'deny'

/** ManagedUserResource. roles, permission_overrides and locks are present on the detail endpoint. */
export type ManagedUser = {
  id: number
  name: string
  username: string | null
  email: string
  status: UserStatus
  status_changed_at: string | null
  account_expires_at: string | null
  is_active: boolean
  mfa_enabled: boolean
  created_at: string | null
  last_login_at: string | null
  last_access_event_at: string | null
  admin_notes: string | null
  roles?: Array<{ key: string; name: string }>
  permission_overrides?: Array<{ permission: string; effect: PermissionEffect; reason: string | null }>
  locks?: Array<{
    id: number
    name: string
    property: { id: number; name: string } | null
    valid_from: string | null
    valid_until: string | null
  }>
}

export type Role = { key: string; name: string; description: string | null; is_system: boolean; permissions: string[] }

export type PermissionInfo = { key: string; group: string; label: string; description: string; sensitive: boolean }

/** One permission as it would resolve: why it is granted or not. */
export type PermissionDecision = {
  key: string
  group: string
  label: string
  sensitive: boolean
  granted: boolean
  granting_roles: string[]
  override: PermissionEffect | null
  reason: string
}

export type PermissionPreview = {
  permissions: PermissionDecision[]
  changes: { gained: string[]; lost: string[]; sensitive_gained: string[] } | null
  violations: { roles: string[]; permissions: string[] }
  target_problem: { code: string; message: string } | null
  can_save: boolean
}

export type SecurityEvent = {
  event_id: string
  occurred_at: string
  action: string
  outcome: 'success' | 'denied' | 'failure' | 'info'
  actor: { id: number; name: string } | null
  target_user_id: number | null
  reason: string | null
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
}

export type Paginated<T> = { data: T[]; meta: { current_page: number; last_page: number; total: number } }

export type UserFilters = {
  search?: string
  status?: string
  role?: string
  lock_id?: string
  property_id?: string
  page?: number
}

export type Override = { permission: string; effect: PermissionEffect; reason?: string | null }

export function listUsers(filters: UserFilters, signal?: AbortSignal): Promise<Paginated<ManagedUser>> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      query.set(key, String(value))
    }
  }
  return api<Paginated<ManagedUser>>(`/users?${query}`, { signal })
}

export async function getUser(id: number, signal?: AbortSignal): Promise<ManagedUser> {
  return (await api<{ data: ManagedUser }>(`/users/${id}`, { signal })).data
}

export type NewUser = {
  name: string
  username: string | null
  email: string
  password: string
  password_confirmation: string
  account_expires_at: string | null
  admin_notes: string | null
  roles: string[]
}

export async function createUser(input: NewUser): Promise<ManagedUser> {
  return (await api<{ data: ManagedUser }>('/users', { method: 'POST', body: input })).data
}

export type ProfileChanges = Partial<Pick<ManagedUser, 'name' | 'username' | 'email' | 'account_expires_at' | 'admin_notes'>>

export async function updateUser(id: number, changes: ProfileChanges): Promise<ManagedUser> {
  return (await api<{ data: ManagedUser }>(`/users/${id}`, { method: 'PATCH', body: changes })).data
}

export async function setUserRoles(id: number, roles: string[]): Promise<ManagedUser> {
  return (await api<{ data: ManagedUser }>(`/users/${id}/roles`, { method: 'PUT', body: { roles } })).data
}

export async function setUserOverrides(id: number, overrides: Override[]): Promise<ManagedUser> {
  return (await api<{ data: ManagedUser }>(`/users/${id}/permissions`, { method: 'PUT', body: { overrides } })).data
}

export type StatusChange = 'suspend' | 'reactivate' | 'revoke'

export async function changeUserStatus(id: number, change: StatusChange, reason: string): Promise<ManagedUser> {
  return (await api<{ data: ManagedUser }>(`/users/${id}/${change}`, { method: 'POST', body: { reason } })).data
}

export async function signOutEverywhere(id: number, reason: string): Promise<{ browser_logins: number; api_clients: number }> {
  return (await api<{ data: { signed_out: { browser_logins: number; api_clients: number } } }>(`/users/${id}/sessions/revoke`, {
    method: 'POST',
    body: { reason },
  })).data.signed_out
}

export async function getSecurityHistory(id: number, cursor?: string | null, signal?: AbortSignal) {
  return api<{ data: SecurityEvent[]; next_cursor: string | null }>(
    `/users/${id}/security-history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    { signal },
  )
}

export async function listRoles(signal?: AbortSignal): Promise<Role[]> {
  return (await api<{ data: Role[] }>('/roles', { signal })).data
}

export async function listPermissions(signal?: AbortSignal): Promise<PermissionInfo[]> {
  return (await api<{ data: PermissionInfo[] }>('/permissions', { signal })).data
}

export async function previewPermissions(input: { user_id?: number; roles: string[]; overrides: Override[] }, signal?: AbortSignal): Promise<PermissionPreview> {
  return (await api<{ data: PermissionPreview }>('/permission-preview', { method: 'POST', body: input, signal })).data
}

export async function grantLockAccess(lockId: number, userId: number, window: { valid_from: string | null; valid_until: string | null }): Promise<void> {
  await api(`/locks/${lockId}/access/${userId}`, { method: 'PUT', body: window })
}

export async function removeLockAccess(lockId: number, userId: number): Promise<void> {
  await api(`/locks/${lockId}/access/${userId}`, { method: 'DELETE' })
}
