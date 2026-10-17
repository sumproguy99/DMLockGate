import { ChevronDown, ChevronRight, LogOut, Menu as MenuIcon } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router'
import { useAuth, useCurrentUser } from '../auth/auth-context'
import { IconButton } from '../components/ui/Button'
import { Menu } from '../components/ui/Menu'
import { useToast } from '../components/ui/toast-context'
import { findNavItem } from './navigation'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

/**
 * The application header: where you are, who you are, and the account menu. The integration
 * health indicator joins it with the dashboard (UI checkpoint 4), once the backend reports health.
 */
export function Header({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const user = useCurrentUser()
  const { signOut } = useAuth()
  const toast = useToast()
  const location = useLocation()
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
          items={[{ label: 'Sign out', icon: LogOut, onSelect: handleSignOut, disabled: signingOut }]}
        />
      </div>
    </header>
  )
}
