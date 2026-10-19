import { Bell, ChevronRight, LifeBuoy, LogOut, MapPin, Monitor, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { saveViewPreference } from '../app/view-preference'
import { useAuth, useCurrentUser } from '../auth/auth-context'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useToast } from '../components/ui/toast-context'

const links: Array<{ to: string; label: string; description: string; icon: LucideIcon }> = [
  { to: '/m/notifications', label: 'Notifications', description: 'What needs attention now', icon: Bell },
  { to: '/m/account', label: 'Account security', description: 'Two-step verification and where you are signed in', icon: ShieldCheck },
  { to: '/m/location', label: 'Location and proximity', description: 'Why automatic unlocking is not available', icon: MapPin },
  { to: '/m/help', label: 'Help and troubleshooting', description: 'Common problems and what to do', icon: LifeBuoy },
]

/**
 * More (project.md 34.7): the account, the other mobile screens, switching to the desktop view,
 * and signing out, kept apart from everything else so it is not tapped by accident.
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

        <nav aria-label="More" className="rounded-lg border border-border bg-panel">
          <ul className="divide-y divide-border">
            {links.map(({ to, label, description, icon: Icon }) => (
              <li key={to}>
                <Link to={to} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-elevated">
                  <Icon className="size-5 shrink-0 text-text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-support font-semibold">{label}</span>
                    <span className="block text-caption text-text-muted">{description}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

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

        <div className="mt-6 border-t border-border pt-6">
          <Button variant="secondary" icon={LogOut} fullWidth size="lg" onClick={handleSignOut} loading={signingOut}>
            Sign out
          </Button>
        </div>
      </div>
    </>
  )
}
