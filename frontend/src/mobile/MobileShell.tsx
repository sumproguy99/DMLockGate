import { Bell } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { HealthProvider } from '../app/HealthProvider'
import { useUnreadNotifications } from '../app/notification-count-context'
import { NotificationCountProvider } from '../app/NotificationCountProvider'
import { useSystemHealth } from '../app/health-context'
import { StepUpProvider } from '../app/StepUpProvider'
import { useCurrentUser } from '../auth/auth-context'
import { BrandLogo } from '../components/brand/BrandLogo'
import { toneText } from '../components/ui/tones'
import { deriveAlerts } from '../lib/alerts'
import { cx } from '../lib/cx'
import { describeIntegration } from '../lib/health'
import { useMobileLocks } from './locks-context'
import { MobileLocksProvider } from './MobileLocksProvider'
import { visibleMobileNavigation } from './mobile-navigation'
import { useLocationResponder } from './useLocationResponder'

/** The Eufy status as a short icon and word, sized for a phone header. */
function CompactIntegrationStatus() {
  const { data, error } = useSystemHealth()
  if (!data || error) {
    return <span className="text-caption text-text-muted">Eufy status unknown</span>
  }
  const { tone, label, icon: Icon } = describeIntegration(data.integration.status, data.integration.degraded_reason)

  return (
    <span className={cx('flex items-center gap-1 text-caption font-medium', toneText[tone])}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  )
}

/**
 * The notification bell: the unread notifications, or when everything is read, how many problems
 * need attention right now. Red when any current problem is critical.
 */
function NotificationIndicator() {
  const locks = useMobileLocks()
  const health = useSystemHealth()
  const unread = useUnreadNotifications().data ?? 0
  const alerts = locks.data ? deriveAlerts(locks.data.locks, health.data) : []
  const critical = alerts.some((a) => a.severity === 'critical')
  const count = unread || alerts.length
  const parts = [unread > 0 && `${unread} unread`, alerts.length > 0 && `${alerts.length} need${alerts.length === 1 ? 's' : ''} attention`].filter(Boolean)
  const label = parts.length === 0 ? 'Notifications, nothing new' : `Notifications, ${parts.join(', ')}`

  return (
    <Link
      to="/m/notifications"
      aria-label={label}
      className="relative flex size-11 items-center justify-center rounded-full text-text-muted active:bg-elevated"
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className={cx(
            'absolute top-1 right-1 flex min-w-5 items-center justify-center rounded-full px-1 text-caption font-semibold',
            critical ? 'bg-danger-strong text-white' : 'bg-warning text-bg',
          )}
        >
          {count}
        </span>
      )}
    </Link>
  )
}

/**
 * The mobile web app (project.md 34.7): a compact header, the page, and a bottom navigation bar
 * within thumb reach. Separate from the desktop shell; same tokens, logo and components.
 */
export function MobileShell() {
  const user = useCurrentUser()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const items = visibleMobileNavigation(user)
  useLocationResponder()

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mainRef.current?.focus()
    window.scrollTo(0, 0)
  }, [location.pathname])

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <HealthProvider>
      <NotificationCountProvider>
      <MobileLocksProvider>
      <StepUpProvider>
        <div className="flex min-h-dvh flex-col">
          <a
            href="#main"
            className="sr-only z-50 rounded-md bg-primary-strong px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          >
            Skip to main content
          </a>

          <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
            <BrandLogo variant="mark" decorative className="size-8" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-support font-semibold">DM LockGuard</p>
              <CompactIntegrationStatus />
            </div>
            <NotificationIndicator />
            <Link
              to="/m/more"
              aria-label={`Account and more for ${user.name}`}
              className="flex size-11 items-center justify-center rounded-full border border-border-strong bg-elevated text-label font-semibold"
            >
              <span aria-hidden>{initials}</span>
            </Link>
          </header>

          <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 px-4 pt-4 pb-28 outline-none">
            <Outlet />
          </main>

          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
          >
            <ul className="mx-auto flex max-w-lg">
              {items.map((item) => (
                <li key={item.path} className="flex-1">
                  <NavLink
                    to={item.path}
                    end={item.path === '/m'}
                    className={({ isActive }) =>
                      cx(
                        'flex min-h-16 flex-col items-center justify-center gap-1 text-caption font-medium transition-colors',
                        isActive ? 'text-primary-text' : 'text-text-muted active:text-text',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={cx('flex h-7 w-12 items-center justify-center rounded-full', isActive && 'bg-primary/15')}>
                          <item.icon className="size-5" aria-hidden />
                        </span>
                        {item.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </StepUpProvider>
      </MobileLocksProvider>
      </NotificationCountProvider>
    </HealthProvider>
  )
}
