import { api } from './client'
import type { Paginated } from './users'

export type AlertSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved'
export type IncidentStatus = 'new' | 'acknowledged' | 'investigating' | 'contained' | 'resolved' | 'closed'

type Person = { id: number; name: string | null }

/** SecurityAlertResource. context is present on the detail only. */
export type SecurityAlert = {
  id: string
  rule: string
  rule_label: string
  category: string
  /** Condition alerts resolve themselves when the problem clears and cannot be resolved by hand. */
  is_condition: boolean
  severity: AlertSeverity
  status: AlertStatus
  title: string
  description: string
  occurrences: number
  first_seen_at: string
  last_seen_at: string
  subject_user: Person | null
  subject_lock: Person | null
  subject_ip: string | null
  incident: { id: string; title: string; status: IncidentStatus } | null
  acknowledged_by: Person | null
  acknowledged_at: string | null
  resolved_by: Person | null
  resolved_at: string | null
  resolution: 'manual' | 'cleared' | 'quiet' | 'incident' | null
  resolution_note: string | null
  last_event_id: string | null
  context?: Record<string, unknown> | null
}

/** SecurityIncidentResource. alerts and history are present on the detail only. */
export type SecurityIncident = {
  id: string
  title: string
  description: string | null
  severity: AlertSeverity
  status: IncidentStatus
  opened_by: Person | null
  opened_at: string
  resolved_at: string | null
  closed_at: string | null
  updated_at: string
  alert_count: number
  alerts?: SecurityAlert[]
  history?: {
    at: string
    actor: Person | null
    from_status: IncidentStatus | null
    to_status: IncidentStatus | null
    note: string | null
  }[]
}

export type AlertFilters = { status?: string; severity?: string; search?: string; page?: string }
export type IncidentFilters = { status?: string; severity?: string; page?: string }

function queryString(filters: Record<string, string | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      query.set(key, value)
    }
  }
  return query.toString()
}

export function listAlerts(filters: AlertFilters, signal?: AbortSignal): Promise<Paginated<SecurityAlert>> {
  return api<Paginated<SecurityAlert>>(`/security/alerts?${queryString(filters)}`, { signal })
}

export async function getAlert(id: string, signal?: AbortSignal): Promise<SecurityAlert> {
  return (await api<{ data: SecurityAlert }>(`/security/alerts/${encodeURIComponent(id)}`, { signal })).data
}

export async function acknowledgeAlert(id: string): Promise<SecurityAlert> {
  return (await api<{ data: SecurityAlert }>(`/security/alerts/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' })).data
}

export async function resolveAlert(id: string, note: string | null): Promise<SecurityAlert> {
  return (await api<{ data: SecurityAlert }>(`/security/alerts/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: { note } })).data
}

export function listIncidents(filters: IncidentFilters, signal?: AbortSignal): Promise<Paginated<SecurityIncident>> {
  return api<Paginated<SecurityIncident>>(`/security/incidents?${queryString(filters)}`, { signal })
}

export async function getIncident(id: string, signal?: AbortSignal): Promise<SecurityIncident> {
  return (await api<{ data: SecurityIncident }>(`/security/incidents/${encodeURIComponent(id)}`, { signal })).data
}

export async function openIncident(input: { title: string; severity: AlertSeverity; description?: string; alert_ids?: string[] }): Promise<SecurityIncident> {
  return (await api<{ data: SecurityIncident }>('/security/incidents', { method: 'POST', body: input })).data
}

export async function changeIncidentStatus(id: string, status: IncidentStatus, note: string | null): Promise<SecurityIncident> {
  return (await api<{ data: SecurityIncident }>(`/security/incidents/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status, note } })).data
}
