import { Bell, ChevronDown, ChevronRight, LogOut, Menu as MenuIcon, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth, useCurrentUser } from '../auth/auth-context'
import { IconButton } from '../components/ui/Button'
import { Menu } from '../components/ui/Menu'
import { useToast } from '../components/ui/toast-context'
import { IntegrationIndicator } from './IntegrationIndicator'
import { findNavItem } from './navigation'
import { useUnreadNotifications } from './notification-count-context'
import { saveViewPreference } from './view-preference'

/** The bell: opens the notification center, with the unread count. */
function NotificationBell() {
  const unread = useUnreadNotifications().data ?? 0

  return (
    <Link
      to="/notifications"
      aria-label={unread === 0 ? 'Notifications, none unread' : `Notifications, ${unread} unread`}
      className="relative flex size-11 items-center justify-center rounded-full text-text-muted hover:bg-elevated hover:text-text"
    >
      <Bell className="size-5" aria-hidden />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute top-1 right-1 flex min-w-5 items-center justify-center rounded-full bg-danger-strong px-1 text-caption font-semibold text-white"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

/** The application header: where you are, the Eufy integration's status, who you are, and the account menu. */
export function Header({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const user = useCurrentUser()
  const { signOut } = useAuth()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const here = findNavItem(location.pathname)
  const role = user.roles.map((r) => r.name).join(', ') || 'No role'

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
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur sm:px-6">
      <IconButton icon={MenuIcon} label="Open navigation" onClick={onOpenNavigation} className="-ml-2 lg:hidden" />

      <p className="flex min-w-0 flex-1 items-center gap-1.5 text-support text-text-muted">
        {here && (
          <>
            <span className="hidden truncate sm:inline">{here.group.label}</span>
            <ChevronRight className="hidden size-4 shrink-0 sm:inline" aria-hidden />
            <span className="truncate font-medium text-text">{here.item.label}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        <IntegrationIndicator />
        <NotificationBell />
        <div className="hidden text-right leading-tight md:block">
          <p className="text-support font-medium">{user.name}</p>
          <p className="text-caption text-text-muted">{role}</p>
        </div>
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-elevated text-label font-semibold"
        >
          {initials(user.name)}
        </span>
        <Menu
          label={signingOut ? 'Signing out…' : `Account menu for ${user.name}`}
          icon={ChevronDown}
          iconOnly
          items={[
            {
              label: 'Mobile view',
              icon: Smartphone,
              onSelect: () => {
                saveViewPreference('mobile')
                navigate('/m')
              },
            },
            { label: 'Sign out', icon: LogOut, onSelect: handleSignOut, disabled: signingOut },
          ]}
        />
      </div>
    </header>
  )
}
