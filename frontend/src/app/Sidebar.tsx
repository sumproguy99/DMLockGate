import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink } from 'react-router'
import { useCurrentUser } from '../auth/auth-context'
import { BrandLogo } from '../components/brand/BrandLogo'
import { cx } from '../lib/cx'
import { visibleNavigation } from './navigation'

type NavigationListProps = {
  collapsed?: boolean
  /** Called after a link is followed, to close the mobile drawer. */
  onNavigate?: () => void
}

/** The permitted navigation groups. Shared by the desktop sidebar and the mobile drawer. */
export function NavigationList({ collapsed = false, onNavigate }: NavigationListProps) {
  const groups = visibleNavigation(useCurrentUser())

  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p
            className={cx(
              'mb-1.5 px-3 text-caption font-semibold tracking-wider text-text-muted uppercase',
              collapsed && 'sr-only',
            )}
          >
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ label, path, icon: Icon }) => (
              <li key={path}>
                <NavLink
                  to={path}
                  end={path === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cx(
                      'group relative flex min-h-11 items-center gap-3 rounded-md px-3 text-support font-medium transition-colors',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-primary/15 text-text shadow-[inset_3px_0_0_var(--color-primary)]'
                        : 'text-text-muted hover:bg-elevated hover:text-text',
                    )
                  }
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  <span className={cx(collapsed && 'sr-only')}>{label}</span>
                  {collapsed && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-full z-40 ml-3 hidden rounded-sm border border-border-strong bg-elevated px-2.5 py-1.5 text-caption whitespace-nowrap text-text shadow-raised group-hover:block group-focus-visible:block"
                    >
                      {label}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

type SidebarProps = {
  collapsed: boolean
  onToggle: () => void
}

/** The persistent sidebar on large screens. It can collapse to icons only. */
export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cx(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-panel transition-[width] lg:flex',
        collapsed ? 'w-20' : 'w-64',
      )}
    >
      <div className={cx('flex items-center gap-3 px-4 pt-5 pb-6', collapsed && 'justify-center px-0')}>
        <BrandLogo variant="mark" decorative={!collapsed} className="size-11 shrink-0" />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="text-panel-title">DM LockGuard</p>
            <p className="text-caption text-text-muted">Access control</p>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <NavigationList collapsed={collapsed} />
      </div>
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={collapsed}
          className={cx(
            'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-support text-text-muted transition-colors hover:bg-elevated hover:text-text',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
          <span className={cx(collapsed && 'sr-only')}>Collapse sidebar</span>
        </button>
      </div>
    </aside>
  )
}
