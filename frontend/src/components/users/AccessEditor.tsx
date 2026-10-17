import { ShieldAlert } from 'lucide-react'
import type { Override, PermissionDecision, PermissionInfo, PermissionPreview, Role } from '../../api/users'
import type { Loaded } from '../../lib/useLoaded'
import { permissionGroupLabel } from '../../lib/users'
import { Banner } from '../ui/Banner'
import { CheckboxField, SelectField } from '../ui/Form'
import { LoadingState } from '../ui/Spinner'
import { StatusBadge } from '../ui/StatusBadge'

type AccessEditorProps = {
  preview: Loaded<PermissionPreview>
  roles: Role[]
  catalog: PermissionInfo[]
  selectedRoles: string[]
  overrides: Override[]
  onRolesChange: (roles: string[]) => void
  /** Leave out to show overrides read-only (no users.modify_permissions, or a new user). */
  onOverridesChange?: (overrides: Override[]) => void
  rolesEditable: boolean
}

/**
 * Roles, individual overrides, and a server-side preview of the permissions that would result,
 * grouped by area. The preview also says whether the signed-in administrator may save it.
 */
export function AccessEditor({
  preview,
  roles,
  catalog,
  selectedRoles,
  overrides,
  onRolesChange,
  onOverridesChange,
  rolesEditable,
}: AccessEditorProps) {
  const decisions = new Map((preview.data?.permissions ?? []).map((d) => [d.key, d]))
  const roleName = (key: string) => roles.find((r) => r.key === key)?.name ?? key
  const groups = [...new Set(catalog.map((p) => p.group))]

  function setOverride(permission: string, effect: string) {
    const rest = overrides.filter((o) => o.permission !== permission)
    onOverridesChange?.(effect === '' ? rest : [...rest, { permission, effect: effect as Override['effect'] }])
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-panel-title">Roles</legend>
        <p className="text-support text-text-muted">A role grants a set of permissions. Most people need exactly one.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map((role) => (
            <CheckboxField
              key={role.key}
              label={role.name}
              hint={role.description ?? undefined}
              checked={selectedRoles.includes(role.key)}
              disabled={!rolesEditable}
              onChange={(event) =>
                onRolesChange(event.target.checked ? [...selectedRoles, role.key] : selectedRoles.filter((k) => k !== role.key))
              }
            />
          ))}
        </div>
      </fieldset>

      <PreviewSummary preview={preview.data} loading={preview.loading} error={preview.error} roleName={roleName} catalog={catalog} />

      <section aria-labelledby="effective-heading" className="flex flex-col gap-3">
        <div>
          <h3 id="effective-heading" className="text-panel-title">
            Effective permissions
          </h3>
          <p className="text-support text-text-muted">
            What this account could do with the roles and overrides above. An individual override wins over every role:
            "Always deny" removes a permission even if a role grants it.
          </p>
        </div>
        {groups.map((group) => (
          <details key={group} className="rounded-md border border-border bg-panel-2" open={group === 'lock'}>
            <summary className="cursor-pointer px-4 py-3 text-support font-medium">
              {permissionGroupLabel[group] ?? group}
              <span className="ml-2 text-text-muted">
                {catalog.filter((p) => p.group === group && decisions.get(p.key)?.granted).length} of{' '}
                {catalog.filter((p) => p.group === group).length} granted
              </span>
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {catalog
                .filter((p) => p.group === group)
                .map((permission) => (
                  <PermissionRow
                    key={permission.key}
                    permission={permission}
                    decision={decisions.get(permission.key)}
                    override={overrides.find((o) => o.permission === permission.key)?.effect ?? ''}
                    roleName={roleName}
                    onChange={onOverridesChange ? (effect) => setOverride(permission.key, effect) : undefined}
                  />
                ))}
            </ul>
          </details>
        ))}
      </section>
    </div>
  )
}

function PermissionRow({
  permission,
  decision,
  override,
  roleName,
  onChange,
}: {
  permission: PermissionInfo
  decision: PermissionDecision | undefined
  override: string
  roleName: (key: string) => string
  onChange?: (effect: string) => void
}) {
  let source = ''
  if (decision?.override === 'allow') {
    source = 'Allowed individually'
  } else if (decision?.override === 'deny') {
    source = 'Denied individually'
  } else if (decision?.granting_roles.length) {
    source = `From ${decision.granting_roles.map(roleName).join(', ')}`
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-support font-medium">
          {permission.label}
          {permission.sensitive && <StatusBadge tone="warning" label="Sensitive" icon={ShieldAlert} />}
        </p>
        <p className="text-caption text-text-muted">{permission.description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 md:justify-end">
        {decision && (
          <span className="flex flex-col items-start gap-0.5 md:items-end">
            <StatusBadge tone={decision.granted ? 'success' : 'unknown'} label={decision.granted ? 'Granted' : 'Not granted'} />
            {source && <span className="text-caption text-text-muted">{source}</span>}
          </span>
        )}
        {onChange && (
          <div className="w-44">
            <SelectField
              label={<span className="sr-only">Override for {permission.label}</span>}
              value={override}
              onChange={(event) => onChange(event.target.value)}
              options={[
                { value: '', label: 'Follow roles' },
                { value: 'allow', label: 'Always allow' },
                { value: 'deny', label: 'Always deny' },
              ]}
            />
          </div>
        )}
      </div>
    </li>
  )
}

function PreviewSummary({
  preview,
  loading,
  error,
  roleName,
  catalog,
}: {
  preview: PermissionPreview | null
  loading: boolean
  error: unknown
  roleName: (key: string) => string
  catalog: PermissionInfo[]
}) {
  const label = (key: string) => catalog.find((p) => p.key === key)?.label ?? key

  if (error != null && !preview) {
    return (
      <Banner tone="danger" title="The preview could not be loaded">
        {error instanceof Error ? error.message : 'Something went wrong.'}
      </Banner>
    )
  }
  if (!preview) {
    return <LoadingState label="Working out the permissions…" />
  }

  const { changes, violations, target_problem: targetProblem } = preview
  const blocked = violations.roles.length > 0 || violations.permissions.length > 0

  return (
    <div className="flex flex-col gap-3" aria-busy={loading || undefined}>
      {targetProblem && (
        <Banner tone="danger" title="You can't change this account" live="none">
          {targetProblem.message}
        </Banner>
      )}
      {blocked && (
        <Banner tone="danger" title="You can't grant this" live="none">
          You can only give permissions you hold yourself.
          {violations.roles.length > 0 && <> Roles beyond yours: {violations.roles.map(roleName).join(', ')}.</>}
          {violations.permissions.length > 0 && <> Permissions beyond yours: {violations.permissions.map(label).join(', ')}.</>}
        </Banner>
      )}
      {changes && (changes.gained.length > 0 || changes.lost.length > 0) && (
        <Banner tone={changes.sensitive_gained.length ? 'warning' : 'info'} title="What would change" live="none">
          {changes.gained.length > 0 && <p>Gains: {changes.gained.map(label).join(', ')}.</p>}
          {changes.lost.length > 0 && <p>Loses: {changes.lost.map(label).join(', ')}.</p>}
          {changes.sensitive_gained.length > 0 && (
            <p className="font-medium">Sensitive permissions gained: {changes.sensitive_gained.map(label).join(', ')}.</p>
          )}
        </Banner>
      )}
    </div>
  )
}
