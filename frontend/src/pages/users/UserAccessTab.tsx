import { Save, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { listPermissions, listRoles, setUserOverrides, setUserRoles, type ManagedUser, type Override } from '../../api/users'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { AccessEditor } from '../../components/users/AccessEditor'
import { usePermissionPreview } from '../../components/users/usePermissionPreview'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { LoadingState } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { useLoaded } from '../../lib/useLoaded'

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
const overrideKey = (overrides: Override[]) =>
  JSON.stringify([...overrides].map((o) => [o.permission, o.effect]).sort())

/**
 * Roles and individual overrides for one user, with the permission preview. Saving sends roles and
 * overrides separately, so each change is checked and audited on its own.
 */
export function UserAccessTab({ user, isMe, onSaved }: { user: ManagedUser; isMe: boolean; onSaved: (user: ManagedUser) => void }) {
  const me = useCurrentUser()
  const roles = useLoaded(listRoles, 'roles')
  const catalog = useLoaded(listPermissions, 'permissions')

  if (roles.error != null || catalog.error != null) {
    return (
      <Banner tone="danger" title="Roles could not be loaded">
        Refresh the page to try again.
      </Banner>
    )
  }
  if (!roles.data || !catalog.data) {
    return <LoadingState label="Loading roles…" />
  }

  return (
    <AccessForm
      key={`${user.id}:${user.roles?.map((r) => r.key).join(',')}:${overrideKey(user.permission_overrides ?? [])}`}
      user={user}
      roles={roles.data}
      catalog={catalog.data}
      canAssignRoles={!isMe && user.status !== 'revoked' && hasAnyPermission(me, ['users.assign_roles'])}
      canModify={!isMe && user.status !== 'revoked' && hasAnyPermission(me, ['users.modify_permissions'])}
      onSaved={onSaved}
    />
  )
}

function AccessForm({
  user,
  roles,
  catalog,
  canAssignRoles,
  canModify,
  onSaved,
}: {
  user: ManagedUser
  roles: Awaited<ReturnType<typeof listRoles>>
  catalog: Awaited<ReturnType<typeof listPermissions>>
  canAssignRoles: boolean
  canModify: boolean
  onSaved: (user: ManagedUser) => void
}) {
  const toast = useToast()
  const withStepUp = useStepUp()
  const initialRoles = user.roles?.map((r) => r.key) ?? []
  const initialOverrides = user.permission_overrides?.map(({ permission, effect }) => ({ permission, effect })) ?? []
  const [selectedRoles, setSelectedRoles] = useState(initialRoles)
  const [overrides, setOverrides] = useState<Override[]>(initialOverrides)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preview = usePermissionPreview(user.id, selectedRoles, overrides)

  const rolesChanged = !sameSet(selectedRoles, initialRoles)
  const overridesChanged = overrideKey(overrides) !== overrideKey(initialOverrides)
  const dirty = rolesChanged || overridesChanged
  const canSave = dirty && preview.data?.can_save === true && !preview.loading

  async function save() {
    setBusy(true)
    setError(null)
    try {
      let saved = user
      if (rolesChanged) {
        saved = await withStepUp(`change ${user.name}'s roles`, () => setUserRoles(user.id, selectedRoles))
      }
      if (overridesChanged) {
        saved = await withStepUp(`change ${user.name}'s permissions`, () => setUserOverrides(user.id, overrides))
      }
      toast({ tone: 'success', title: 'Access saved', message: 'The new permissions apply from their next request.' })
      onSaved(saved)
    } catch (caught) {
      if (!(caught instanceof StepUpCancelled)) {
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.')
      }
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!canAssignRoles && !canModify && (
        <Banner tone="info" title="Read only" live="none">
          You can see this account's access but not change it.
        </Banner>
      )}
      <AccessEditor
        preview={preview}
        roles={roles}
        catalog={catalog}
        selectedRoles={selectedRoles}
        overrides={overrides}
        onRolesChange={setSelectedRoles}
        onOverridesChange={canModify ? setOverrides : undefined}
        rolesEditable={canAssignRoles}
      />
      {error && (
        <Banner tone="danger" title="Could not save">
          {error}
        </Banner>
      )}
      {(canAssignRoles || canModify) && (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t border-border bg-bg/95 px-1 py-3 backdrop-blur">
          <Button icon={Save} onClick={save} disabled={!canSave} loading={busy}>
            Save access
          </Button>
          <Button
            variant="ghost"
            icon={Undo2}
            disabled={!dirty || busy}
            onClick={() => {
              setSelectedRoles(initialRoles)
              setOverrides(initialOverrides)
            }}
          >
            Undo changes
          </Button>
          <span className="text-caption text-text-muted">
            {!dirty ? 'No changes.' : preview.loading ? 'Checking the change…' : preview.data?.can_save ? 'Ready to save.' : 'This change cannot be saved.'}
          </span>
        </div>
      )}
    </div>
  )
}
