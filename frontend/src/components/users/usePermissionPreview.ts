import { previewPermissions, type Override, type PermissionPreview } from '../../api/users'
import { useLoaded, type Loaded } from '../../lib/useLoaded'

/** The server's preview of a proposed role and override set. Nothing is saved. */
export function usePermissionPreview(userId: number | undefined, roles: string[], overrides: Override[]): Loaded<PermissionPreview> {
  return useLoaded(
    (signal) =>
      previewPermissions({ user_id: userId, roles, overrides: overrides.map(({ permission, effect }) => ({ permission, effect })) }, signal),
    JSON.stringify([userId, [...roles].sort(), overrides]),
  )
}
