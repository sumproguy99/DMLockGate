import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from './app/AppShell'
import { NotFound, RequireAuth, RequirePermission } from './app/guards'
import { USER_ADMIN_PERMISSIONS } from './app/navigation'
import { useAuth } from './auth/auth-context'
import { Banner } from './components/ui/Banner'
import { Button } from './components/ui/Button'
import { LoadingState } from './components/ui/Spinner'
import { LoginPage } from './pages/LoginPage'
import { PendingScreen } from './pages/PendingScreen'

/** The component gallery, bundled only into development builds. */
const ComponentGallery = import.meta.env.DEV ? lazy(() => import('./dev/ComponentGallery')) : null

/** Every route. Separate from App so tests can render it inside a MemoryRouter. */
export function AppRoutes() {
  const { state, retry } = useAuth()

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingState label="Checking your session…" />
      </div>
    )
  }

  if (state.status === 'unreachable') {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <Banner
          tone="danger"
          title="LockGuard is unreachable"
          className="w-full max-w-md"
          action={
            <Button variant="secondary" size="sm" onClick={retry}>
              Try again
            </Button>
          }
        >
          {state.message}
        </Banner>
      </main>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {ComponentGallery && (
        <Route
          path="/dev/components"
          element={
            <Suspense fallback={<LoadingState />}>
              <ComponentGallery />
            </Suspense>
          }
        />
      )}
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route
          index
          element={
            <PendingScreen
              title="Dashboard"
              description="Locks, integration health, alerts and recent activity at a glance."
              checkpoint={4}
            />
          }
        />
        <Route
          path="users"
          element={
            <RequirePermission permissions={USER_ADMIN_PERMISSIONS}>
              <PendingScreen title="Users" description="LockGuard accounts, their status, roles and security history." checkpoint={5} />
            </RequirePermission>
          }
        />
        <Route
          path="roles"
          element={
            <RequirePermission permissions={USER_ADMIN_PERMISSIONS}>
              <PendingScreen title="Roles and permissions" description="What each role allows, grouped by area." checkpoint={5} />
            </RequirePermission>
          }
        />
        <Route
          path="properties"
          element={
            <RequirePermission permissions={['admin.integration_settings']}>
              <PendingScreen title="Properties" description="The places LockGuard manages, and their locks." checkpoint={5} />
            </RequirePermission>
          }
        />
        <Route
          path="locks"
          element={
            <RequirePermission permissions={['lock.view_status', 'devices.view']}>
              <PendingScreen title="Locks" description="Every lock, its reported state, connection and access." checkpoint={5} />
            </RequirePermission>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
