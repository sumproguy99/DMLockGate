import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { AppShell } from './app/AppShell'
import { NotFound, RequireAuth, RequirePermission } from './app/guards'
import { DIAGNOSTICS_PERMISSIONS, USER_ADMIN_PERMISSIONS } from './app/navigation'
import { prefersMobile } from './app/view-preference'
import { useAuth } from './auth/auth-context'
import { BrandLogo } from './components/brand/BrandLogo'
import { Banner } from './components/ui/Banner'
import { Button } from './components/ui/Button'
import { LoadingState } from './components/ui/Spinner'
import { DashboardPage } from './pages/DashboardPage'
import { DevicesPage } from './pages/DevicesPage'
import { LockDetailPage } from './pages/locks/LockDetailPage'
import { LocksPage } from './pages/locks/LocksPage'
import { PropertiesPage } from './pages/locks/PropertiesPage'
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordResetPages'
import { MobileAccountPage } from './mobile/MobileAccountPage'
import { MobileActivityPage } from './mobile/MobileActivityPage'
import { MobileDevicesPage } from './mobile/MobileDevicesPage'
import { MobileHelpPage } from './mobile/MobileHelpPage'
import { MobileHomePage } from './mobile/MobileHomePage'
import { MobileLocationHistoryPage } from './mobile/MobileLocationHistoryPage'
import { MobileLocationPage } from './mobile/MobileLocationPage'
import { MobileLockPage } from './mobile/MobileLockPage'
import { MobileMorePage } from './mobile/MobileMorePage'
import { MobileNotificationPreferencesPage } from './mobile/MobileNotificationPreferencesPage'
import { MobileNotificationsPage } from './mobile/MobileNotificationsPage'
import { MobileShell } from './mobile/MobileShell'
import { NotificationPreferencesPage } from './pages/NotificationPreferencesPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { AuditLogPage } from './pages/security/AuditLogPage'
import { IncidentDetailPage } from './pages/security/IncidentDetailPage'
import { DeviceLocationsPage } from './pages/security/DeviceLocationsPage'
import { LocationMapPage } from './pages/security/LocationMapPage'
import { SecurityCenterPage } from './pages/security/SecurityCenterPage'
import { SystemHealthPage } from './pages/security/SystemHealthPage'
import { InvitationPage } from './pages/invitation/InvitationPage'
import { EmailSettingsPage } from './pages/settings/EmailSettingsPage'
import { NotificationSettingsPage } from './pages/settings/NotificationSettingsPage'
import { InvitationsPage } from './pages/users/InvitationsPage'
import { NewUserPage } from './pages/users/NewUserPage'
import { RolesPage } from './pages/users/RolesPage'
import { UserDetailPage } from './pages/users/UserDetailPage'
import { UsersPage } from './pages/users/UsersPage'

/** The component gallery, bundled only into development builds. */
const ComponentGallery = import.meta.env.DEV ? lazy(() => import('./dev/ComponentGallery')) : null

/**
 * The desktop application. "/" opens the mobile app instead on phones, unless this browser chose
 * the desktop view; the redirect happens before the desktop shell renders, so it never flashes.
 * The notification pages, which alert emails link to, open their phone versions the same way.
 */
function DesktopShell() {
  const { pathname } = useLocation()
  if (pathname === '/' && prefersMobile()) {
    return <Navigate to="/m" replace />
  }
  if ((pathname === '/notifications' || pathname === '/notifications/preferences') && prefersMobile()) {
    return <Navigate to={`/m${pathname}`} replace />
  }
  return <AppShell />
}

/** The logo on a panel above a start-up message, before any shell renders. */
function BrandedScreen({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      {/* On panel, not bg: the logo's own background blends away only on panel or lighter. */}
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-panel p-6 shadow-panel">
        <BrandLogo className="size-28" />
        {children}
      </div>
    </main>
  )
}

/** Every route. Separate from App so tests can render it inside a MemoryRouter. */
export function AppRoutes() {
  const { state, retry } = useAuth()

  if (state.status === 'loading') {
    return (
      <BrandedScreen>
        <LoadingState label="Checking your session…" />
      </BrandedScreen>
    )
  }

  if (state.status === 'unreachable') {
    return (
      <BrandedScreen>
        <Banner
          tone="danger"
          title="LockGuard is unreachable"
          className="w-full"
          action={
            <Button variant="secondary" size="sm" onClick={retry}>
              Try again
            </Button>
          }
        >
          {state.message}
        </Banner>
      </BrandedScreen>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Forgotten password, signed out: the emailed link's token is the credential. */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* Accepting an invitation works signed out: the link's token is the credential. */}
      <Route path="/invite/:token" element={<InvitationPage />} />
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
        path="/m"
        element={
          <RequireAuth>
            <MobileShell />
          </RequireAuth>
        }
      >
        <Route index element={<MobileHomePage />} />
        <Route path="locks/:lockId" element={<MobileLockPage />} />
        <Route
          path="activity"
          element={
            <RequirePermission permissions={['lock.view_history']}>
              <MobileActivityPage />
            </RequirePermission>
          }
        />
        <Route
          path="devices"
          element={
            <RequirePermission permissions={['lock.view_status', 'devices.view']}>
              <MobileDevicesPage />
            </RequirePermission>
          }
        />
        <Route path="notifications" element={<MobileNotificationsPage />} />
        <Route path="notifications/preferences" element={<MobileNotificationPreferencesPage />} />
        <Route path="account" element={<MobileAccountPage />} />
        <Route path="location" element={<MobileLocationPage />} />
        <Route path="location/history" element={<MobileLocationHistoryPage />} />
        <Route path="help" element={<MobileHelpPage />} />
        <Route path="more" element={<MobileMorePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route
        element={
          <RequireAuth>
            <DesktopShell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="notifications/preferences" element={<NotificationPreferencesPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route
          path="security"
          element={
            <RequirePermission permissions={['admin.incidents_view']}>
              <SecurityCenterPage />
            </RequirePermission>
          }
        />
        <Route
          path="security/incidents/:id"
          element={
            <RequirePermission permissions={['admin.incidents_view']}>
              <IncidentDetailPage />
            </RequirePermission>
          }
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
          path="invitations"
          element={
            <RequirePermission permissions={['users.create']}>
              <InvitationsPage />
            </RequirePermission>
          }
        />
        <Route
          path="settings/email"
          element={
            <RequirePermission permissions={['admin.notifications']}>
              <EmailSettingsPage />
            </RequirePermission>
          }
        />
        <Route
          path="settings/notifications"
          element={
            <RequirePermission permissions={['admin.notifications']}>
              <NotificationSettingsPage />
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
          path="location"
          element={
            <RequirePermission permissions={['location.view_history']}>
              <LocationMapPage />
            </RequirePermission>
          }
        />
        <Route
          path="device-locations"
          element={
            <RequirePermission permissions={['location.view_history']}>
              <DeviceLocationsPage />
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
