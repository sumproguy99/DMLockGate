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

export async function logout(): Promise<void> {
  await api<void>('/auth/logout', { method: 'POST' })
}
