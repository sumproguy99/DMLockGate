import { createContext, useContext } from 'react'
import type { CurrentUser, LoginResult } from '../api/auth'

export type AuthState =
  | { status: 'loading' }
  /** notice: why the user is here, such as an expired session. */
  | { status: 'signed_out'; notice?: string }
  /** The password was accepted; the account needs its MFA code. */
  | { status: 'mfa_required' }
  | { status: 'signed_in'; user: CurrentUser }
  /** The session check itself failed: the API could not be reached. */
  | { status: 'unreachable'; message: string }

export type Auth = {
  state: AuthState
  /** deviceCode registers this device, for an account bound to one device. */
  signIn: (email: string, password: string, deviceCode?: string) => Promise<LoginResult>
  verifyMfa: (input: { code: string } | { recovery_code: string }) => Promise<void>
  signOut: () => Promise<void>
  /** Reads the signed-in user again, after a change to their own account such as two-step verification. */
  reloadUser: () => Promise<void>
  /** Re-runs the session check, after "unreachable". */
  retry: () => void
  /** Back to the email and password step from the MFA step. */
  restart: () => void
}

export const SESSION_ENDED_NOTICE = 'Your session ended. Sign in again to continue.'

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) {
    throw new Error('useAuth must be used inside an AuthProvider.')
  }

  return auth
}

/**
 * Whether the user holds at least one of the permissions. For showing or hiding interface only:
 * the backend enforces every permission again.
 */
export function hasAnyPermission(user: CurrentUser, permissions: readonly string[]): boolean {
  return permissions.length === 0 || permissions.some((permission) => user.permissions.includes(permission))
}

/** The signed-in user. Only for components rendered inside the signed-in shell. */
export function useCurrentUser(): CurrentUser {
  const { state } = useAuth()
  if (state.status !== 'signed_in') {
    throw new Error('useCurrentUser needs a signed-in user.')
  }

  return state.user
}
