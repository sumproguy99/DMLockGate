import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/auth-context'
import { BrandLogo } from '../components/brand/BrandLogo'
import { ChangePasswordCard } from '../components/security/ChangePasswordCard'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'

/**
 * Shown instead of the app, desktop and mobile alike, while the account still has the password an
 * administrator chose for it. The server refuses everything else until the person chooses their
 * own, so this is the only thing they can do, apart from signing out.
 */
export function PasswordChangeRequired() {
  const { signOut } = useAuth()
  const [signOutError, setSignOutError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Choose your own password · DM LockGuard'
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
    <main id="main" className="flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
      <div className="flex w-full max-w-md flex-col gap-4">
        {/* On panel, not bg: the logo's own background blends away only on panel or lighter. */}
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-panel p-6 text-center shadow-panel">
          <BrandLogo className="size-20" />
          <h1 className="text-section">Choose your own password</h1>
          <p className="text-support text-text-muted">
            An administrator set the password you just used. Choose one only you know to carry on to LockGuard.
          </p>
        </div>
        <ChangePasswordCard title="New password" description="Type the password you were given, then your new one." />
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
  )
}
