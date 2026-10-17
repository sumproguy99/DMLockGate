import { vi } from 'vitest'
import type { CurrentUser } from '../api/auth'

type Handler = (request: { body: unknown; headers: Record<string, string> }) => Response | Promise<Response>

export function json(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function apiError(status: number, code: string, message: string, fields?: Record<string, string[]>): Response {
  return json(status, { error: { code, message, ...(fields ? { fields } : {}) } })
}

/**
 * Replaces fetch with handlers keyed by "METHOD /path" (for example "POST /api/v1/auth/login").
 * Unhandled requests fail the test loudly. Returns the mock to inspect calls.
 */
export function mockFetch(handlers: Record<string, Handler>) {
  const mock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${String(input)}`
    const handler = handlers[key]
    if (!handler) {
      throw new Error(`Unexpected request: ${key}`)
    }
    return handler({
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

export function makeUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 1,
    name: 'Alex Admin',
    username: null,
    email: 'alex@example.test',
    status: 'active',
    account_expires_at: null,
    mfa_enabled: false,
    last_login_at: null,
    roles: [{ key: 'owner', name: 'Owner' }],
    permissions: [],
    ...overrides,
  }
}

/** Clears every cookie jsdom holds, so CSRF state does not leak between tests. */
export function clearCookies() {
  for (const cookie of document.cookie.split('; ')) {
    const name = cookie.split('=')[0]
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    }
  }
}
