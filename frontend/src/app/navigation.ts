import { Activity, Bell, Building2, LayoutDashboard, Lock, MapPinned, MonitorSmartphone, ScrollText, ShieldAlert, ShieldCheck, Smartphone, Users, type LucideIcon } from 'lucide-react'
import type { CurrentUser } from '../api/auth'
import { hasAnyPermission } from '../auth/auth-context'

export type NavItem = {
  label: string
  path: string
  icon: LucideIcon
  /**
   * Shown when the user holds any of these. Empty means every signed-in user. These mirror the
   * backend's checks for the screen's main endpoint; the backend still enforces them.
   */
  permissions: readonly string[]
}

export type NavGroup = { label: string; items: readonly NavItem[] }

/** The user-management permissions: any one lets the backend list users and roles. */
export const USER_ADMIN_PERMISSIONS = [
  'users.create',
  'users.edit',
  'users.suspend',
  'users.reactivate',
  'users.revoke',
  'users.assign_roles',
  'users.modify_permissions',
] as const

/** Who may see system health diagnostics: the backend's rule for the detailed /system/health. */
export const DIAGNOSTICS_PERMISSIONS = ['admin.integration_settings', 'admin.incidents_view'] as const

/**
 * The sidebar (project.md 34.4), limited to screens LockGuard's backend supports today. Items in
 * the spec without a backend yet (access codes, grants, schedules, geofences,
 * settings) are added with their features, so nothing here leads to a feature that does not exist.
 */
export const navigation: readonly NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard, permissions: [] },
      { label: 'Notifications', path: '/notifications', icon: Bell, permissions: [] },
    ],
  },
  {
    label: 'Access management',
    items: [
      { label: 'Users', path: '/users', icon: Users, permissions: USER_ADMIN_PERMISSIONS },
      { label: 'Roles and permissions', path: '/roles', icon: ShieldCheck, permissions: USER_ADMIN_PERMISSIONS },
      { label: 'Properties', path: '/properties', icon: Building2, permissions: ['admin.integration_settings'] },
      { label: 'Locks', path: '/locks', icon: Lock, permissions: ['lock.view_status', 'devices.view'] },
      // Everyone manages their own devices here; devices.view also shows everyone's.
      { label: 'Devices', path: '/devices', icon: MonitorSmartphone, permissions: [] },
    ],
  },
  {
    label: 'Security',
    items: [
      { label: 'Security center', path: '/security', icon: ShieldAlert, permissions: ['admin.incidents_view'] },
      { label: 'Location map', path: '/location', icon: MapPinned, permissions: ['location.view_history'] },
      { label: 'Device locations', path: '/device-locations', icon: Smartphone, permissions: ['location.view_history'] },
      { label: 'Audit log', path: '/audit', icon: ScrollText, permissions: ['admin.incidents_view'] },
      { label: 'System health', path: '/system', icon: Activity, permissions: DIAGNOSTICS_PERMISSIONS },
    ],
  },
]

/** The navigation with only the items this user may open, and no empty groups. */
export function visibleNavigation(user: CurrentUser): NavGroup[] {
  return navigation
    .map((group) => ({ ...group, items: group.items.filter((item) => hasAnyPermission(user, item.permissions)) }))
    .filter((group) => group.items.length > 0)
}

/** The group and item for a path, for the header's location. */
export function findNavItem(pathname: string): { group: NavGroup; item: NavItem } | null {
  for (const group of navigation) {
    for (const item of group.items) {
      if (item.path === '/' ? pathname === '/' : pathname === item.path || pathname.startsWith(`${item.path}/`)) {
        return { group, item }
      }
    }
  }

  return null
}
