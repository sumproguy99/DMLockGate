import { Check, Minus, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { listPermissions, listRoles } from '../../api/users'
import { Banner } from '../../components/ui/Banner'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingState } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { cx } from '../../lib/cx'
import { useLoaded } from '../../lib/useLoaded'
import { permissionGroupLabel } from '../../lib/users'

/**
 * What each role allows, grouped by area (project.md 34.6 C). Roles are defined by LockGuard; to
 * give one person more or less, use individual overrides on their user page.
 */
export function RolesPage() {
  const roles = useLoaded(listRoles, 'roles')
  const catalog = useLoaded(listPermissions, 'permissions')
  const [selected, setSelected] = useState<string | null>(null)

  const header = (
    <PageHeader
      title="Roles and permissions"
      description="Each role is a fixed set of permissions. To adjust one person, open their user page and add an individual override."
    />
  )

  if (roles.error != null || catalog.error != null) {
    return (
      <>
        {header}
        <Banner tone="danger" title="Roles could not be loaded">
          Refresh the page to try again.
        </Banner>
      </>
    )
  }
  if (!roles.data || !catalog.data) {
    return (
      <>
        {header}
        <LoadingState label="Loading roles…" />
      </>
    )
  }

  const role = roles.data.find((r) => r.key === selected) ?? roles.data[0]
  const groups = [...new Set(catalog.data.map((p) => p.group))]

  return (
    <>
      {header}
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card title="Roles" headingLevel={2}>
          <ul className="flex flex-col gap-1" aria-label="Choose a role">
            {roles.data.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  aria-pressed={r.key === role?.key}
                  onClick={() => setSelected(r.key)}
                  className={cx(
                    'w-full rounded-md px-3 py-2 text-left text-support transition-colors',
                    r.key === role?.key ? 'bg-primary/15 font-medium text-text' : 'text-text-muted hover:bg-elevated hover:text-text',
                  )}
                >
                  {r.name}
                  <span className="block text-caption text-text-muted">{r.permissions.length} permissions</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {role && (
          <Card title={role.name} description={role.description ?? undefined}>
            <div className="flex flex-col gap-5">
              {groups.map((group) => {
                const permissions = catalog.data!.filter((p) => p.group === group)
                return (
                  <section key={group} aria-labelledby={`group-${group}`}>
                    <h3 id={`group-${group}`} className="mb-2 text-label text-text-muted">
                      {permissionGroupLabel[group] ?? group} · {permissions.filter((p) => role.permissions.includes(p.key)).length} of{' '}
                      {permissions.length}
                    </h3>
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {permissions.map((permission) => {
                        const granted = role.permissions.includes(permission.key)
                        return (
                          <li key={permission.key} className="flex items-start gap-3 px-3 py-2.5">
                            {granted ? (
                              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                            ) : (
                              <Minus className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className={cx('flex flex-wrap items-center gap-2 text-support', !granted && 'text-text-muted')}>
                                {permission.label}
                                <span className="sr-only">{granted ? '(included)' : '(not included)'}</span>
                                {permission.sensitive && granted && <StatusBadge tone="warning" label="Sensitive" icon={ShieldAlert} />}
                              </p>
                              <p className="text-caption text-text-muted">{permission.description}</p>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
