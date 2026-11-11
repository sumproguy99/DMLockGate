import { api } from './client'
import type { AlertSeverity } from './security'

/**
 * One of the signed-in user's in-app notifications (NotificationController). mandatory: sent because
 * they handle security incidents, so no preference can turn it off.
 */
export type AppNotification = {
  id: string
  type: string
  category: 'security_incident' | 'lock_connectivity' | 'battery_warning' | 'integration_failure' | string
  severity: AlertSeverity
  title: string
  description: string
  alert_id: string | null
  lock_id: number | null
  mandatory: boolean
  /** Whether it was also emailed: queued, retrying, sent, failed or skipped. null: not emailed. */
  email_status: EmailStatus | null
  created_at: string
  read_at: string | null
}

export type NotificationPage = {
  data: AppNotification[]
  meta: { current_page: number; last_page: number; per_page: number; total: number; unread_count: number }
}

export function listNotifications(options: { unread?: boolean; page?: number } = {}, signal?: AbortSignal): Promise<NotificationPage> {
  const query = new URLSearchParams()
  if (options.unread) {
    query.set('unread', '1')
  }
  if (options.page && options.page > 1) {
    query.set('page', String(options.page))
  }
  return api<NotificationPage>(`/notifications?${query.toString()}`, { signal })
}

export async function fetchUnreadCount(signal?: AbortSignal): Promise<number> {
  return (await api<{ data: { unread_count: number } }>('/notifications/summary', { signal })).data.unread_count
}

export async function markNotificationRead(id: string): Promise<AppNotification> {
  return (await api<{ data: AppNotification }>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' })).data
}

export async function markAllNotificationsRead(): Promise<number> {
  return (await api<{ data: { marked: number } }>('/notifications/read-all', { method: 'POST' })).data.marked
}

export type EmailStatus = 'queued' | 'retrying' | 'sent' | 'failed' | 'skipped'

/** One notification category with this person's choices. in_app_required: an administrator keeps it on in the app. */
export type CategoryPreference = {
  category: string
  label: string
  description: string
  in_app: boolean
  email: boolean
  in_app_required: boolean
}

export type NotificationPreferences = {
  categories: CategoryPreference[]
  /** The address alert emails go to. */
  email: string
  /** Whether an administrator has alert email turned on. */
  email_enabled: boolean
  /** Alerts below this severity are only shown in the app. */
  email_min_severity: 'low' | 'medium' | 'high' | 'critical'
  /** Incident handlers always get security alerts in the app, and High and Critical ones by email. */
  handles_incidents: boolean
}

export async function getNotificationPreferences(signal?: AbortSignal): Promise<NotificationPreferences> {
  return (await api<{ data: NotificationPreferences }>('/notifications/preferences', { signal })).data
}

export async function saveNotificationPreferences(preferences: Record<string, { in_app: boolean; email: boolean }>): Promise<NotificationPreferences> {
  return (await api<{ data: NotificationPreferences }>('/notifications/preferences', { method: 'PUT', body: { preferences } })).data
}