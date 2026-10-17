import type { AccessRequestStatus, ConnectionStatus, ReportedLockState, StateFreshness } from '../lib/lockguard'
import { api } from './client'

/** LockResource: a lock with its latest REPORTED state. */
export type LockSummary = {
  id: number
  name: string
  property?: { id: number; name: string }
  vendor: string
  model: string | null
  external_id: string
  firmware_version: string | null
  registration_status: string
  commands_enabled: boolean
  connection_status: ConnectionStatus
  reported_state: ReportedLockState
  state_freshness: StateFreshness
  state_observed_at: string | null
  state_source: string | null
  battery_level: number | null
  battery_observed_at: string | null
  last_communication_at: string | null
  last_error: string | null
  last_error_at: string | null
}

export type LockAction = 'lock' | 'unlock'

/** AccessRequestResource: one lock or unlock request, with decision, command and confirmation kept apart. */
export type LockRequest = {
  id: string
  lock_id: number
  user_id: number
  action: LockAction
  channel: string
  status: AccessRequestStatus
  status_message: string
  is_final: boolean
  requested_at: string
  expires_at: string
  completed_at: string | null
  decision: { decision: string; reason_code: string; reason: string } | null
  command: {
    submitted_at: string | null
    integration_result: string | null
    integration_latency_ms: number | null
    integration_error: string | null
    confirmation: string | null
    confirmation_source: string | null
    confirmed_at: string | null
  } | null
}

export async function fetchLocks(signal?: AbortSignal): Promise<LockSummary[]> {
  const { data } = await api<{ data: LockSummary[] }>('/locks', { signal })
  return data
}

/**
 * Ask for a lock or unlock. 202 means accepted for processing, never that the door moved. Sending
 * the same idempotency key again returns the same request instead of creating a second one.
 */
export async function requestLockCommand(lockId: number, action: LockAction, idempotencyKey: string): Promise<LockRequest> {
  const { data } = await api<{ data: LockRequest }>(`/locks/${lockId}/commands`, {
    method: 'POST',
    body: { action, idempotency_key: idempotencyKey },
  })
  return data
}

export async function fetchLockRequest(id: string, signal?: AbortSignal): Promise<LockRequest> {
  const { data } = await api<{ data: LockRequest }>(`/lock-requests/${encodeURIComponent(id)}`, { signal })
  return data
}

/**
 * A fresh idempotency key. crypto.getRandomValues works on plain-HTTP LAN addresses too, where
 * crypto.randomUUID is unavailable.
 */
export function newIdempotencyKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function fetchLock(id: number, signal?: AbortSignal): Promise<LockSummary> {
  return (await api<{ data: LockSummary }>(`/locks/${id}`, { signal })).data
}

/** One reported state, as the lock or the scheduled sync recorded it. */
export type LockStateEvent = {
  state: ReportedLockState
  source: string
  observed_at: string
  battery_level: number | null
  external_actor: string | null
}

export async function fetchLockHistory(id: number, signal?: AbortSignal): Promise<{ states: LockStateEvent[]; requests: LockRequest[] }> {
  return (await api<{ data: { states: LockStateEvent[]; requests: LockRequest[] } }>(`/locks/${id}/history`, { signal })).data
}

export type LockChanges = Partial<{ name: string; commands_enabled: boolean; registration_status: 'active' | 'disabled' }>

export async function updateLock(id: number, changes: LockChanges): Promise<LockSummary> {
  return (await api<{ data: LockSummary }>(`/locks/${id}`, { method: 'PATCH', body: changes })).data
}

export type NewLock = { property_id: number; name: string; model: string | null; external_id: string }

/** Register a lock LockGuard does not know yet. Commands start turned off. */
export async function registerLock(input: NewLock): Promise<LockSummary> {
  return (await api<{ data: LockSummary }>('/locks', { method: 'POST', body: input })).data
}

export type Property = { id: number; name: string; address: string | null; timezone: string; locks_count: number }

export async function fetchProperties(signal?: AbortSignal): Promise<Property[]> {
  return (await api<{ data: Property[] }>('/properties', { signal })).data
}

export async function createProperty(input: { name: string; address: string | null; timezone?: string }): Promise<Property> {
  return (await api<{ data: Property }>('/properties', { method: 'POST', body: input })).data
}
