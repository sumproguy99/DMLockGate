import { api, ApiError, NETWORK_ERROR } from './client'
import type { AuditOutcome } from './system'
import type { Paginated } from './users'

/** AuditLogResource. The detail fields are present on GET /audit-logs/{event_id} only. */
export type AuditRecord = {
  event_id: string
  occurred_at: string
  action: string
  outcome: AuditOutcome
  actor_type: 'user' | 'system' | 'integration'
  actor: { id: number; name: string | null } | null
  target_user: { id: number; name: string | null } | null
  target_lock: { id: number; name: string | null } | null
  target_device_id: number | null
  reason: string | null
  metadata?: Record<string, unknown> | null
  correlation_id?: string | null
  session_ref?: string | null
  ip_address?: string | null
  user_agent?: string | null
  previous_hash?: string
  hash?: string
}

export type AuditFilters = {
  search?: string
  category?: string
  outcome?: string
  actor_user_id?: string
  target_user_id?: string
  target_lock_id?: string
  from?: string
  to?: string
  page?: string
}

function queryString(filters: AuditFilters): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      query.set(key, value)
    }
  }
  return query.toString()
}

export function listAuditLogs(filters: AuditFilters, signal?: AbortSignal): Promise<Paginated<AuditRecord>> {
  return api<Paginated<AuditRecord>>(`/audit-logs?${queryString(filters)}`, { signal })
}

export async function getAuditRecord(eventId: string, signal?: AbortSignal): Promise<AuditRecord> {
  return (await api<{ data: AuditRecord }>(`/audit-logs/${encodeURIComponent(eventId)}`, { signal })).data
}

/** The filtered records as CSV. The export itself is recorded in the audit log. */
export async function exportAuditLogs(filters: AuditFilters): Promise<{ blob: Blob; filename: string }> {
  const rest = { ...filters, page: undefined }
  let response: Response
  try {
    response = await fetch(`/api/v1/audit-logs/export?${queryString(rest)}`, {
      credentials: 'same-origin',
      headers: { Accept: 'text/csv, application/json' },
    })
  } catch {
    throw new ApiError(0, NETWORK_ERROR, 'LockGuard could not be reached. Check your connection and try again.')
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    throw new ApiError(response.status, payload?.error?.code ?? 'http_error', payload?.error?.message ?? 'The export could not be created.')
  }
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'lockguard-audit.csv'
  return { blob: await response.blob(), filename }
}
