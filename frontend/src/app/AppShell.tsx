import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { BrandLogo } from '../components/brand/BrandLogo'
import { Dialog } from '../components/ui/Dialog'
import { Header } from './Header'
import { HealthProvider } from './HealthProvider'
import { NavigationList, Sidebar } from './Sidebar'

const COLLAPSED_KEY = 'lockguard.sidebar.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The signed-in layout: sidebar on large screens, a navigation drawer below that, the header, and
 * the page. Focus moves to the page content after each navigation so screen readers follow it.
 */
export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mainRef.current?.focus()
  }, [location.pathname])

  function toggleCollapsed() {
    setCollapsed((current) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, current ? '0' : '1')
      } catch {
        // Not remembered in this browser; the sidebar still toggles.
      }
      return !current
    })
  }

  return (
    <HealthProvider>
      <div className="flex min-h-dvh">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary-strong px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to main content
        </a>

        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header onOpenNavigation={() => setDrawerOpen(true)} />
          <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>

        <Dialog
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          placement="left"
          title={
            <span className="flex items-center gap-3">
              <BrandLogo variant="mark" decorative className="size-9" />
              DM LockGuard
            </span>
          }
        >
          <div className="pb-4">
            <NavigationList onNavigate={() => setDrawerOpen(false)} />
          </div>
        </Dialog>
      </div>
    </HealthProvider>
  )
}
