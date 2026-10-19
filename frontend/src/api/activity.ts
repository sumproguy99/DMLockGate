import type { AccessRequestStatus, ReportedLockState } from '../lib/lockguard'
import type { AuditOutcome } from './system'
import { api } from './client'
import type { LockAction } from './locks'

/**
 * GET /activity: one lock request, or one state change a lock reported. Other people are only ever
 * "Another user"; a report's actor says whether the lock sent it or the scheduled check found it.
 */
export type ActivityFeedItem = {
  id: string
  kind: 'request' | 'report'
  occurred_at: string
  lock: { id: number; name: string | null } | null
  actor: string
  outcome: AuditOutcome
  request: {
    action: LockAction
    status: AccessRequestStatus
    status_message: string
    integration_responded: boolean
  } | null
  report: { state: ReportedLockState; source: string } | null
}

export type ActivityType = 'all' | 'requests' | 'reports'
export type ActivityOutcome = 'success' | 'failure' | 'denied' | 'pending'

export type ActivityFilters = { type?: ActivityType; outcome?: ActivityOutcome; before?: string }

export type ActivityPage = { items: ActivityFeedItem[]; nextBefore: string | null }

export async function fetchActivity(filters: ActivityFilters, signal?: AbortSignal): Promise<ActivityPage> {
  const query = new URLSearchParams()
  if (filters.type && filters.type !== 'all') query.set('type', filters.type)
  if (filters.outcome) query.set('outcome', filters.outcome)
  if (filters.before) query.set('before', filters.before)
  const suffix = query.toString() ? `?${query}` : ''
  const { data, next_before } = await api<{ data: ActivityFeedItem[]; next_before: string | null }>(`/activity${suffix}`, { signal })

  return { items: data, nextBefore: next_before }
}
