import { LifeBuoy, LogOut, Monitor, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { saveViewPreference } from '../app/view-preference'
import { useAuth, useCurrentUser } from '../auth/auth-context'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useToast } from '../components/ui/toast-context'

/**
 * More (project.md 34.7): the account, switching to the desktop view, help, and signing out, kept
 * apart from everything else so it is not tapped by accident.
 */
export function MobileMorePage() {
  const user = useCurrentUser()
  const { signOut } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      setSigningOut(false)
      toast({ tone: 'danger', title: 'Could not sign out', message: 'LockGuard could not be reached. Try again.' })
    }
  }

  return (
    <>
      <PageHeader title="More" />
      <div className="flex flex-col gap-4">
        <Card title="Your account" headingLevel={2}>
          <p className="text-body font-medium">{user.name}</p>
          <p className="text-support text-text-muted">{user.email}</p>
          <p className="mt-1 text-support text-text-muted">{user.roles.map((r) => r.name).join(', ') || 'No role'}</p>
          <div className="mt-3 flex items-center gap-2">
            <ShieldCheck className="size-4 text-text-muted" aria-hidden />
            <span className="text-support">Two-step verification</span>
            {user.mfa_enabled ? <StatusBadge tone="success" label="On" /> : <StatusBadge tone="warning" label="Off" />}
          </div>
        </Card>

        <Card title="Desktop view" headingLevel={2}>
          <p className="text-support text-text-muted">
            The full application, with administration, audit and system health. It works on a phone but is easier on a
            larger screen.
          </p>
          <Button
            variant="secondary"
            icon={Monitor}
            fullWidth
            className="mt-3"
            onClick={() => {
              saveViewPreference('desktop')
              navigate('/')
            }}
          >
            Use the desktop view
          </Button>
        </Card>

        <Card title="Help" headingLevel={2}>
          <ul className="flex flex-col gap-2 text-support text-text-muted">
            <li className="flex gap-2">
              <LifeBuoy className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                If a lock does not respond, check the Eufy status at the top of the screen. When the outcome of a command is
                unknown, check the door before trying again.
              </span>
            </li>
            <li className="flex gap-2">
              <LifeBuoy className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Forgot your password or lost your authenticator? Ask your LockGuard administrator.</span>
            </li>
          </ul>
          <p className="mt-3 text-caption text-text-muted">
            Location, proximity and notifications are not available yet.
          </p>
        </Card>

        <div className="mt-6 border-t border-border pt-6">
          <Button variant="secondary" icon={LogOut} fullWidth size="lg" onClick={handleSignOut} loading={signingOut}>
            Sign out
          </Button>
        </div>
      </div>
    </>
  )
}
