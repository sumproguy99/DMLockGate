import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as authApi from '../api/auth'
import { ApiError, onUnauthenticated } from '../api/client'
import { AuthContext, SESSION_ENDED_NOTICE, type Auth, type AuthState } from './auth-context'

/**
 * Holds who is signed in. On start it asks the API (the session cookie decides); any later 401
 * from any request returns the app to sign-in with a notice.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    authApi
      .fetchCurrentUser()
      .then((user) => !cancelled && setState({ status: 'signed_in', user }))
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          setState({ status: 'signed_out' })
        } else {
          setState({
            status: 'unreachable',
            message: error instanceof ApiError ? error.message : 'LockGuard could not be reached.',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(
    () =>
      onUnauthenticated(() =>
        setState((current) => (current.status === 'signed_in' ? { status: 'signed_out', notice: SESSION_ENDED_NOTICE } : current)),
      ),
    [],
  )

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password)
    setState(result.status === 'authenticated' ? { status: 'signed_in', user: result.user } : { status: 'mfa_required' })
    return result
  }, [])

  const verifyMfa = useCallback(async (input: { code: string } | { recovery_code: string }) => {
    try {
      const user = await authApi.verifyMfa(input)
      setState({ status: 'signed_in', user })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'mfa_session_expired') {
        setState({ status: 'signed_out', notice: error.message })
      }
      throw error
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await authApi.logout()
    } catch (error) {
      // Already signed out on the server is fine; anything else leaves the session as it was.
      if (!(error instanceof ApiError && error.status === 401)) {
        throw error
      }
    }
    setState({ status: 'signed_out' })
  }, [])

  const reloadUser = useCallback(async () => {
    const user = await authApi.fetchCurrentUser()
    setState((current) => (current.status === 'signed_in' ? { status: 'signed_in', user } : current))
  }, [])

  const auth = useMemo<Auth>(
    () => ({
      state,
      signIn,
      verifyMfa,
      signOut,
      reloadUser,
      retry: () => {
        setState({ status: 'loading' })
        setAttempt((n) => n + 1)
      },
      restart: () => setState({ status: 'signed_out' }),
    }),
    [state, signIn, verifyMfa, signOut, reloadUser],
  )

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}
