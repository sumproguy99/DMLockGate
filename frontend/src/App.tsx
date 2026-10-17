import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from './app/AppShell'
import { NotFound, RequireAuth, RequirePermission } from './app/guards'
import { DIAGNOSTICS_PERMISSIONS, USER_ADMIN_PERMISSIONS } from './app/navigation'
import { useAuth } from './auth/auth-context'
import { Banner } from './components/ui/Banner'
import { Button } from './components/ui/Button'
import { LoadingState } from './components/ui/Spinner'
import { DashboardPage } from './pages/DashboardPage'
import { LockDetailPage } from './pages/locks/LockDetailPage'
import { LocksPage } from './pages/locks/LocksPage'
import { PropertiesPage } from './pages/locks/PropertiesPage'
import { LoginPage } from './pages/LoginPage'
import { AuditLogPage } from './pages/security/AuditLogPage'
import { SystemHealthPage } from './pages/security/SystemHealthPage'
import { NewUserPage } from './pages/users/NewUserPage'
import { RolesPage } from './pages/users/RolesPage'
import { UserDetailPage } from './pages/users/UserDetailPage'
import { UsersPage } from './pages/users/UsersPage'

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
          element={<DashboardPage />}
        />
        <Route
          path="users"
          element={
            <RequirePermission permissions={USER_ADMIN_PERMISSIONS}>
              <UsersPage />
            </RequirePermission>
          }
        />
        <Route
          path="users/new"
          element={
            <RequirePermission permissions={['users.create']}>
              <NewUserPage />
            </RequirePermission>
          }
        />
        <Route
          path="users/:id"
          element={
            <RequirePermission permissions={USER_ADMIN_PERMISSIONS}>
              <UserDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="roles"
          element={
            <RequirePermission permissions={USER_ADMIN_PERMISSIONS}>
              <RolesPage />
            </RequirePermission>
          }
        />
        <Route
          path="properties"
          element={
            <RequirePermission permissions={['admin.integration_settings']}>
              <PropertiesPage />
            </RequirePermission>
          }
        />
        <Route
          path="locks"
          element={
            <RequirePermission permissions={['lock.view_status', 'devices.view']}>
              <LocksPage />
            </RequirePermission>
          }
        />
        <Route
          path="locks/:id"
          element={
            <RequirePermission permissions={['lock.view_status', 'devices.view']}>
              <LockDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="audit"
          element={
            <RequirePermission permissions={['admin.incidents_view']}>
              <AuditLogPage />
            </RequirePermission>
          }
        />
        <Route
          path="system"
          element={
            <RequirePermission permissions={DIAGNOSTICS_PERMISSIONS}>
              <SystemHealthPage />
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
