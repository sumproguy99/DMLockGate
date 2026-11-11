import { api } from './client'

export type MailSecurity = 'starttls' | 'tls' | 'none'

/** The Email settings as the server shows them: never the password, only whether one is saved. */
export type EmailSettings = {
  configured: boolean
  enabled: boolean
  host: string
  port: number
  security: MailSecurity
  username: string
  password_set: boolean
  from_address: string
  from_name: string
  updated_at: string | null
  updated_by: string | null
  /** The mailer from the server's .env, used while these settings are off. */
  fallback_mailer: string
}

/** password: undefined keeps the saved one, '' removes it. */
export type EmailSettingsInput = {
  enabled: boolean
  host: string
  port: number
  security: MailSecurity
  username: string | null
  password?: string
  from_address: string
  from_name: string
}

export async function getEmailSettings(signal?: AbortSignal): Promise<EmailSettings> {
  return (await api<{ data: EmailSettings }>('/settings/email', { signal })).data
}

export async function saveEmailSettings(input: EmailSettingsInput): Promise<EmailSettings> {
  return (await api<{ data: EmailSettings }>('/settings/email', { method: 'PUT', body: input })).data
}

export async function sendTestEmail(to: string): Promise<{ sent: boolean; error: string | null; mailer: string }> {
  return (await api<{ data: { sent: boolean; error: string | null; mailer: string } }>('/settings/email/test', { method: 'POST', body: { to } })).data
}

export type AlertEmailSeverity = 'low' | 'medium' | 'high' | 'critical'

/** One alert email and how its delivery went. */
export type AlertEmailDelivery = {
  id: number
  user: string | null
  recipient: string
  severity: AlertEmailSeverity
  title: string
  alert_id: string | null
  mandatory: boolean
  status: 'queued' | 'retrying' | 'sent' | 'failed' | 'skipped'
  attempts: number
  /** The mailer that sent it; 'log' or 'array' means it was never really delivered. */
  mailer: string | null
  last_error: string | null
  created_at: string
  sent_at: string | null
}

/** The limits everyone's notification preferences work within, and recent alert emails. */
export type NotificationSettings = {
  email_enabled: boolean
  email_min_severity: AlertEmailSeverity
  required_categories: string[]
  categories: { category: string; label: string; description: string }[]
  updated_at: string | null
  updated_by: string | null
  /** Whether Email settings are saved and turned on. */
  mail_configured: boolean
  fallback_mailer: string
  retry: { tries: number; backoff_seconds: number[] }
  recent_deliveries: AlertEmailDelivery[]
}

export type NotificationSettingsInput = Pick<NotificationSettings, 'email_enabled' | 'email_min_severity' | 'required_categories'>

export async function getNotificationSettings(signal?: AbortSignal): Promise<NotificationSettings> {
  return (await api<{ data: NotificationSettings }>('/settings/notifications', { signal })).data
}

export async function saveNotificationSettings(input: NotificationSettingsInput): Promise<NotificationSettings> {
  return (await api<{ data: NotificationSettings }>('/settings/notifications', { method: 'PUT', body: input })).data
}
/** One role in the security policy, with how many of its members have no authenticator yet. */
export type SecurityPolicyRole = {
  key: string
  name: string
  mfa_required: boolean
  members: number
  members_without_mfa: number
}

/** The security policy: which roles must use two-step sign-in. */
export type SecurityPolicy = {
  mfa_required_roles: string[]
  roles: SecurityPolicyRole[]
  updated_at: string | null
  updated_by: string | null
}

export async function getSecurityPolicy(signal?: AbortSignal): Promise<SecurityPolicy> {
  return (await api<{ data: SecurityPolicy }>('/settings/security', { signal })).data
}

export async function saveSecurityPolicy(input: { mfa_required_roles: string[] }): Promise<SecurityPolicy> {
  return (await api<{ data: SecurityPolicy }>('/settings/security', { method: 'PUT', body: input })).data
}
