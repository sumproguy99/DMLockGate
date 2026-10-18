import { Activity, Ellipsis, House, KeyRound, type LucideIcon } from 'lucide-react'
import type { CurrentUser } from '../api/auth'
import { hasAnyPermission } from '../auth/auth-context'

export type MobileNavItem = {
  label: string
  path: string
  icon: LucideIcon
  /** Shown when the user holds any of these; empty means everyone. The backend still enforces them. */
  permissions: readonly string[]
}

/** The bottom navigation (project.md 34.7): Home, Activity, Devices, More. */
export const mobileNavigation: readonly MobileNavItem[] = [
  { label: 'Home', path: '/m', icon: House, permissions: [] },
  { label: 'Activity', path: '/m/activity', icon: Activity, permissions: ['lock.view_history', 'admin.incidents_view'] },
  { label: 'Devices', path: '/m/devices', icon: KeyRound, permissions: ['lock.view_status', 'devices.view'] },
  { label: 'More', path: '/m/more', icon: Ellipsis, permissions: [] },
]

export function visibleMobileNavigation(user: CurrentUser): MobileNavItem[] {
  return mobileNavigation.filter((item) => hasAnyPermission(user, item.permissions))
}
