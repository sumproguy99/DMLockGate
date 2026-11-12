import { ShieldX } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { hasAnyPermission, useAuth, useCurrentUser } from '../auth/auth-context'
import { MfaSetupRequired } from './MfaSetupRequired'
import { PasswordChangeRequired } from './PasswordChangeRequired'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'

/**
 * Sends signed-out visitors to sign-in, remembering where they were going. A user who still has an
 * administrator-chosen password sees only the screen to choose their own; then a user whose role
 * must use two-step sign-in and has not set it up sees only the setup screen, at any address.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status !== 'signed_in') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }

  // The password first: the server refuses two-step setup until it is changed.
  if (state.user.password_change_required) {
    return <PasswordChangeRequired />
  }

  if (state.user.mfa_setup_required) {
    return <MfaSetupRequired />
  }

  return children
}

/**
 * Shows the page only to users holding one of the permissions; others reach it only by typing
 * the address, and see why they cannot use it. The backend refuses the data either way.
 */
export function RequirePermission({ permissions, children }: { permissions: readonly string[]; children: ReactNode }) {
  const user = useCurrentUser()

  if (!hasAnyPermission(user, permissions)) {
    return <Forbidden />
  }

  return children
}

export function Forbidden() {
  return (
    <>
      <PageHeader title="Not available to you" />
      <Card>
        <EmptyState
          icon={ShieldX}
          title="Your account does not have access to this page"
          description="Ask a LockGuard administrator if you need it."
          action={
            <Link to="/" className="font-semibold text-primary-text underline-offset-4 hover:underline">
              Go to the dashboard
            </Link>
          }
        />
      </Card>
    </>
  )
}

export function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Card>
        <EmptyState
          title="There is nothing at this address"
          action={
            <Link to="/" className="font-semibold text-primary-text underline-offset-4 hover:underline">
              Go to the dashboard
            </Link>
          }
        />
      </Card>
    </>
  )
}
