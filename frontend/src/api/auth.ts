import { api } from './client'

/** UserResource for the signed-in user. permissions are the effective permission keys. */
export type CurrentUser = {
  id: number
  name: string
  username: string | null
  email: string
  status: string | null
  account_expires_at: string | null
  mfa_enabled: boolean
  last_login_at: string | null
  roles: Array<{ key: string; name: string }>
  permissions: string[]
}

export type LoginResult = { status: 'authenticated'; user: CurrentUser } | { status: 'mfa_required' }

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const { data } = await api<{ data: CurrentUser }>('/auth/me', { quiet401: true })
  return data
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const { data } = await api<{ data: LoginResult }>('/auth/login', { method: 'POST', body: { email, password } })
  return data
}

/** Second sign-in step: an authenticator code, or a one-time recovery code. */
export async function verifyMfa(input: { code: string } | { recovery_code: string }): Promise<CurrentUser> {
  const { data } = await api<{ data: { status: 'authenticated'; user: CurrentUser } }>('/auth/mfa/verify', {
    method: 'POST',
    body: input,
  })
  return data.user
}

/**
 * Step-up: prove identity again (password, plus an authenticator code when two-step verification is
 * on) before a sensitive action. Lasts for the server's configured window.
 */
export async function confirmIdentity(input: { password: string; code?: string }): Promise<void> {
  await api<unknown>('/auth/confirm', { method: 'POST', body: input })
}

export async function logout(): Promise<void> {
  await api<void>('/auth/logout', { method: 'POST' })
}

/** One place the signed-in user is signed in. The session id itself is never sent. */
export type OwnSession = {
  current: boolean
  /** "Chrome on Android", or null when the browser is not recognized. */
  device: string | null
  ip_address: string | null
  last_active_at: string
}

/** listed is false when the server keeps sessions where it cannot list them. */
export type OwnSessions = { listed: boolean; sessions: OwnSession[]; api_clients: number }

export async function fetchOwnSessions(signal?: AbortSignal): Promise<OwnSessions> {
  return (await api<{ data: OwnSessions }>('/auth/sessions', { signal })).data
}

/** Signs out every other browser and API client. This one stays signed in. */
export async function signOutOtherSessions(): Promise<{ browser_logins: number; api_clients: number }> {
  return (await api<{ data: { signed_out: { browser_logins: number; api_clients: number } } }>('/auth/sessions/others', { method: 'DELETE' }))
    .data.signed_out
}

/** Starts authenticator setup. Needs a recent identity check (step-up). */
export async function startMfaSetup(): Promise<{ secret: string; otpauth_uri: string }> {
  return (await api<{ data: { secret: string; otpauth_uri: string } }>('/auth/mfa', { method: 'POST' })).data
}

/** Finishes setup with a code from the app. The recovery codes are shown only now. */
export async function confirmMfaSetup(code: string): Promise<{ recovery_codes: string[] }> {
  return (await api<{ data: { mfa_enabled: boolean; recovery_codes: string[] } }>('/auth/mfa/confirm', { method: 'POST', body: { code } })).data
}

export async function removeMfa(): Promise<void> {
  await api<void>('/auth/mfa', { method: 'DELETE' })
}
