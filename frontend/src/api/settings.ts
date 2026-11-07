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
