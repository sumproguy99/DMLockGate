import { api } from './client'
import type { Paginated } from './users'

export type DeviceStatus = 'recognized' | 'trusted' | 'revoked'

type Person = { id: number; name: string | null }

/** A browser or phone a person signs in from. The cookie that identifies it is never sent. */
export type Device = {
  id: string
  name: string
  status: DeviceStatus
  /** Whether it is the device making this request. */
  current: boolean
  browser: string | null
  last_ip_address: string | null
  first_seen_at: string
  last_seen_at: string
  /** When it was registered with a one-time code (device binding), or null. */
  registered_at: string | null
  trusted_at: string | null
  trusted_by: Person | null
  revoked_at: string | null
  revoked_by: Person | null
  revoke_reason: string | null
  reported_lost: boolean
  /** Present in lists across accounts. */
  user?: { id: number; name: string; email: string }
}

export type SignedOut = { browser_logins: number; api_clients: number }

export type OwnDevices = { devices: Device[]; currentRecognized: boolean; unlockRequiresTrusted: boolean }

export async function fetchOwnDevices(signal?: AbortSignal): Promise<OwnDevices> {
  const response = await api<{ data: Device[]; meta: { current_recognized: boolean; unlock_requires_trusted: boolean } }>('/auth/devices', {
    signal,
  })
  return {
    devices: response.data,
    currentRecognized: response.meta.current_recognized,
    unlockRequiresTrusted: response.meta.unlock_requires_trusted,
  }
}

/** Trusts the device in hand. Needs a recent identity check (step-up). */
export async function trustThisDevice(): Promise<Device> {
  return (await api<{ data: Device }>('/auth/devices/current/trust', { method: 'POST' })).data
}

export async function renameOwnDevice(id: string, name: string): Promise<Device> {
  return (await api<{ data: Device }>(`/auth/devices/${id}`, { method: 'PATCH', body: { name } })).data
}

/** Revokes another of the person's devices. Reporting it lost also signs out every other session. */
export async function revokeOwnDevice(id: string, lost: boolean): Promise<{ device: Device; signedOut: SignedOut | null }> {
  const response = await api<{ data: Device; meta: { signed_out: SignedOut | null } }>(`/auth/devices/${id}/revoke`, {
    method: 'POST',
    body: { lost },
  })
  return { device: response.data, signedOut: response.meta.signed_out }
}

export type DeviceFilters = { status?: string; search?: string; page?: number }

export function listDevices(filters: DeviceFilters, signal?: AbortSignal): Promise<Paginated<Device>> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      query.set(key, String(value))
    }
  }
  return api<Paginated<Device>>(`/devices?${query}`, { signal })
}

/**
 * bound: the person can only use LockGuard on the one device registered to them.
 * registrationCodeExpiresAt: when their unused registration code expires, or null.
 */
export type UserDevices = { devices: Device[]; bound: boolean; registrationCodeExpiresAt: string | null }

export async function fetchUserDevices(userId: number, signal?: AbortSignal): Promise<UserDevices> {
  const response = await api<{ data: Device[]; meta?: { bound?: boolean; registration_code_expires_at?: string | null } }>(
    `/users/${userId}/devices`,
    { signal },
  )
  return {
    devices: response.data,
    bound: response.meta?.bound ?? false,
    registrationCodeExpiresAt: response.meta?.registration_code_expires_at ?? null,
  }
}

/**
 * A one-time code that registers the one device a bound person's account works on. Replaces any
 * unused code. Needs devices.enroll and a recent identity check. The code is only in this response.
 */
export async function createRegistrationCode(userId: number): Promise<{ code: string; expires_at: string }> {
  return (await api<{ data: { code: string; expires_at: string } }>(`/users/${userId}/device-codes`, { method: 'POST' })).data
}

/** Trusts someone else's device. Needs devices.enroll and a recent identity check. */
export async function trustDevice(id: string): Promise<Device> {
  return (await api<{ data: Device }>(`/devices/${id}/trust`, { method: 'POST' })).data
}

export async function renameDevice(id: string, name: string): Promise<Device> {
  return (await api<{ data: Device }>(`/devices/${id}`, { method: 'PATCH', body: { name } })).data
}

/** Revokes someone else's device. A lost device also signs its owner out everywhere. */
export async function revokeDevice(id: string, reason: string, lost: boolean): Promise<{ device: Device; signedOut: SignedOut | null }> {
  const response = await api<{ data: Device; meta: { signed_out: SignedOut | null } }>(`/devices/${id}/revoke`, {
    method: 'POST',
    body: { reason, lost },
  })
  return { device: response.data, signedOut: response.meta.signed_out }
}
