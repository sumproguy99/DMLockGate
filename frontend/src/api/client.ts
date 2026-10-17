/**
 * The LockGuard API client. The app and the API share one origin (the Vite proxy in development),
 * so authentication is Sanctum's session cookie plus its CSRF cookie, never a token in storage.
 */

/** An error in the API's standard shape: { error: { code, message, fields?, details? } }. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** Validation messages by field, for 422 responses. */
  readonly fields: Record<string, string[]>

  constructor(status: number, code: string, message: string, fields: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }

  /** The first validation message for a field, if any. */
  field(name: string): string | null {
    return this.fields[name]?.[0] ?? null
  }
}

/** The network or server could not be reached at all, or did not answer in time. */
export const NETWORK_ERROR = 'network_error'

/** How long a request may take before it is reported as a network error. */
export const REQUEST_TIMEOUT_MS = 20_000

type Listener = (error: ApiError) => void
const unauthenticatedListeners = new Set<Listener>()

/**
 * Called when any request comes back 401, so the app can return to sign-in with a "session
 * expired" message. Returns an unsubscribe function.
 */
export function onUnauthenticated(listener: Listener): () => void {
  unauthenticatedListeners.add(listener)
  return () => unauthenticatedListeners.delete(listener)
}

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

/** Sets the XSRF-TOKEN cookie. Needed before the first state-changing request of a session. */
export async function refreshCsrfCookie(): Promise<void> {
  try {
    await fetch('/sanctum/csrf-cookie', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  } catch {
    throw new ApiError(0, NETWORK_ERROR, 'LockGuard could not be reached. Check your connection and try again.')
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** Do not notify unauthenticated listeners on 401 (the session check on start-up). */
  quiet401?: boolean
}

async function send(path: string, { method = 'GET', body, signal }: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (method !== 'GET') {
    const token = readCookie('XSRF-TOKEN')
    if (token) {
      headers['X-XSRF-TOKEN'] = token
    }
  }

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  try {
    return await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (error) {
    if (signal?.aborted) {
      throw error
    }
    throw new ApiError(
      0,
      NETWORK_ERROR,
      timeout.aborted
        ? 'LockGuard did not respond in time. Check your connection and try again.'
        : 'LockGuard could not be reached. Check your connection and try again.',
    )
  }
}

async function toError(response: Response): Promise<ApiError> {
  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string; fields?: Record<string, string[]> }
  } | null

  return new ApiError(
    response.status,
    payload?.error?.code ?? 'http_error',
    payload?.error?.message ?? 'The request could not be completed.',
    payload?.error?.fields ?? {},
  )
}

/**
 * Calls /api/v1{path} and returns the parsed JSON body (undefined for 204). State-changing
 * requests get the CSRF header; a missing or expired CSRF cookie (419) is refreshed once and the
 * request retried.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  if (method !== 'GET' && readCookie('XSRF-TOKEN') === null) {
    await refreshCsrfCookie()
  }

  let response = await send(path, options)
  if (response.status === 419) {
    await refreshCsrfCookie()
    response = await send(path, options)
  }

  if (!response.ok) {
    const error = await toError(response)
    if (error.status === 401 && !options.quiet401) {
      unauthenticatedListeners.forEach((listener) => listener(error))
    }
    throw error
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}
