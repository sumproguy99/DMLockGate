import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiError, clearCookies, json, mockFetch } from '../test/api'
import { api, ApiError, NETWORK_ERROR, onUnauthenticated } from './client'

afterEach(() => {
  clearCookies()
  vi.unstubAllGlobals()
})

describe('api client', () => {
  it('fetches the CSRF cookie before the first state-changing request and sends it back', async () => {
    const fetch = mockFetch({
      'GET /sanctum/csrf-cookie': () => {
        document.cookie = 'XSRF-TOKEN=abc%3D%3D; path=/'
        return json(204, null)
      },
      'POST /api/v1/things': ({ headers, body }) => json(200, { headers, body }),
    })

    const result = await api<{ headers: Record<string, string>; body: unknown }>('/things', {
      method: 'POST',
      body: { name: 'x' },
    })

    expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual(['/sanctum/csrf-cookie', '/api/v1/things'])
    expect(result.headers['X-XSRF-TOKEN']).toBe('abc==')
    expect(result.headers.Accept).toBe('application/json')
    expect(result.body).toEqual({ name: 'x' })
    expect(fetch.mock.calls[1][1]).toMatchObject({ credentials: 'same-origin' })
  })

  it('does not send the CSRF header on reads', async () => {
    document.cookie = 'XSRF-TOKEN=abc; path=/'
    mockFetch({ 'GET /api/v1/things': ({ headers }) => json(200, headers) })

    expect(await api<Record<string, string>>('/things')).not.toHaveProperty('X-XSRF-TOKEN')
  })

  it('refreshes an expired CSRF token once and retries', async () => {
    document.cookie = 'XSRF-TOKEN=old; path=/'
    let attempts = 0
    mockFetch({
      'GET /sanctum/csrf-cookie': () => {
        document.cookie = 'XSRF-TOKEN=new; path=/'
        return json(204, null)
      },
      'POST /api/v1/things': ({ headers }) => {
        attempts++
        return headers['X-XSRF-TOKEN'] === 'new' ? json(200, { ok: true }) : apiError(419, 'csrf_token_mismatch', 'Expired.')
      },
    })

    expect(await api('/things', { method: 'POST' })).toEqual({ ok: true })
    expect(attempts).toBe(2)
  })

  it('turns error responses into ApiError with validation fields', async () => {
    mockFetch({
      'GET /api/v1/things': () => apiError(422, 'validation_failed', 'Some fields need attention.', { email: ['Bad email.'] }),
    })

    const error = await api('/things').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 422, code: 'validation_failed', message: 'Some fields need attention.' })
    expect((error as ApiError).field('email')).toBe('Bad email.')
    expect((error as ApiError).field('password')).toBeNull()
  })

  it('reports a network failure as a readable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(api('/things')).rejects.toMatchObject({ status: 0, code: NETWORK_ERROR })
  })

  it('gives up on a request that never answers', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => AbortSignal.abort())
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
        init?.signal?.aborted ? Promise.reject(new DOMException('Timed out', 'TimeoutError')) : new Promise(() => {}),
      ),
    )

    await expect(api('/things')).rejects.toMatchObject({
      code: NETWORK_ERROR,
      message: 'LockGuard did not respond in time. Check your connection and try again.',
    })
  })

  it('passes a caller cancellation through untouched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')))

    await expect(api('/things', { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('tells listeners about a 401 unless asked not to', async () => {
    mockFetch({ 'GET /api/v1/things': () => apiError(401, 'unauthenticated', 'Sign in to continue.') })
    const listener = vi.fn()
    const unsubscribe = onUnauthenticated(listener)

    await expect(api('/things', { quiet401: true })).rejects.toBeInstanceOf(ApiError)
    expect(listener).not.toHaveBeenCalled()
    await expect(api('/things')).rejects.toBeInstanceOf(ApiError)
    expect(listener).toHaveBeenCalledOnce()

    unsubscribe()
    await expect(api('/things')).rejects.toBeInstanceOf(ApiError)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('returns undefined for 204 responses', async () => {
    document.cookie = 'XSRF-TOKEN=abc; path=/'
    mockFetch({ 'POST /api/v1/auth/logout': () => json(204, null) })

    expect(await api('/auth/logout', { method: 'POST' })).toBeUndefined()
  })
})
