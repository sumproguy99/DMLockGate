import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { useAuth, useCurrentUser } from '../auth/auth-context'
import { BrandLogo } from '../components/brand/BrandLogo'
import { TwoStepCard } from '../components/security/TwoStepCard'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { StepUpProvider } from './StepUpProvider'

/**
 * Shown instead of the app, desktop and mobile alike, while the user's role must use two-step
 * sign-in and they have not set it up. The server refuses everything else until they have, so
 * this is the only thing they can do, apart from signing out.
 */
export function MfaSetupRequired() {
  const user = useCurrentUser()
  const { signOut } = useAuth()
  const [signOutError, setSignOutError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Set up two-step sign-in · DM LockGuard'
  }, [])

  async function leave() {
    setSignOutError(null)
    try {
      await signOut()
    } catch (error) {
      setSignOutError(error instanceof ApiError ? error.message : 'LockGuard could not be reached. Try again.')
    }
  }

  return (
    <StepUpProvider>
      <main id="main" className="flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
        <div className="flex w-full max-w-md flex-col gap-4">
          {/* On panel, not bg: the logo's own background blends away only on panel or lighter. */}
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-panel p-6 text-center shadow-panel">
            <BrandLogo className="size-20" />
            <h1 className="text-section">Set up two-step sign-in</h1>
            <p className="text-support text-text-muted">
              {user.roles.map((role) => role.name).join(', ') || 'Your role'} must sign in with a code from an authenticator app as well as
              a password. Set it up now to carry on to LockGuard.
            </p>
          </div>
          <TwoStepCard />
          {signOutError && (
            <Banner tone="danger" title="Could not sign out" onDismiss={() => setSignOutError(null)}>
              {signOutError}
            </Banner>
          )}
          <Button variant="ghost" icon={LogOut} fullWidth onClick={() => void leave()}>
            Sign out
          </Button>
        </div>
      </main>
    </StepUpProvider>
  )
}
