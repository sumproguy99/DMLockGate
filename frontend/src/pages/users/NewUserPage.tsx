import { ArrowLeft, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../../api/client'
import { createUser, listPermissions, listRoles } from '../../api/users'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { AccessEditor } from '../../components/users/AccessEditor'
import { usePermissionPreview } from '../../components/users/usePermissionPreview'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PasswordField, TextAreaField, TextField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingState } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { useLoaded } from '../../lib/useLoaded'
import { fromLocalInput } from '../../lib/users'

const NO_OVERRIDES: never[] = []

/**
 * Create an account. The administrator sets a first password and hands it over; individual
 * permission overrides can be added afterwards on the user's page.
 */
export function NewUserPage() {
  const me = useCurrentUser()
  const navigate = useNavigate()
  const toast = useToast()
  const withStepUp = useStepUp()
  const roles = useLoaded(listRoles, 'roles')
  const catalog = useLoaded(listPermissions, 'permissions')
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const preview = usePermissionPreview(undefined, selectedRoles, NO_OVERRIDES)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const canAssignRoles = hasAnyPermission(me, ['users.assign_roles'])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (name: string) => String(data.get(name) ?? '').trim()
    const input = {
      name: value('name'),
      username: value('username') || null,
      email: value('email'),
      password: String(data.get('password') ?? ''),
      password_confirmation: String(data.get('password_confirmation') ?? ''),
      account_expires_at: fromLocalInput(value('account_expires_at')),
      admin_notes: value('admin_notes') || null,
      roles: selectedRoles,
    }
    const missing = {
      name: input.name ? null : 'Enter a name.',
      email: input.email ? null : 'Enter an email address.',
      password: input.password ? null : 'Set a first password.',
      password_confirmation: input.password === input.password_confirmation ? null : 'The passwords do not match.',
    }
    if (Object.values(missing).some(Boolean)) {
      setErrors(missing)
      return
    }
    if (selectedRoles.length > 0 && preview.data && !preview.data.can_save) {
      setFormError('You cannot give one of these roles. Remove it or ask an administrator who holds it.')
      return
    }

    setBusy(true)
    setFormError(null)
    setErrors({})
    try {
      const user = await withStepUp('create a user', () => createUser(input))
      toast({ tone: 'success', title: `${user.name} created`, message: 'Give them their first password through a safe channel.' })
      navigate(`/users/${user.id}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrors(Object.fromEntries(Object.keys(error.fields).map((k) => [k, error.field(k)])))
      } else if (!(error instanceof StepUpCancelled)) {
        setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      }
      setBusy(false)
    }
  }

  return (
    <>
      <Link to="/users" className="mb-3 inline-flex items-center gap-1.5 text-support text-text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />
        Users
      </Link>
      <PageHeader title="Add user" description="Create a LockGuard account. Lock access is given on their page once the account exists." />

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && (
          <Banner tone="danger" title="Could not create the user">
            {formError}
          </Banner>
        )}
        <Card title="Account">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField name="name" label="Name" autoComplete="off" error={errors.name} required />
            <TextField name="email" label="Email" type="email" autoComplete="off" error={errors.email} required />
            <TextField name="username" label="Username" hint="Optional." autoComplete="off" error={errors.username} />
            <TextField
              name="account_expires_at"
              label="Account expires"
              type="datetime-local"
              hint="Optional. For guests and contractors."
              error={errors.account_expires_at}
            />
            <PasswordField
              name="password"
              label="First password"
              autoComplete="new-password"
              hint="At least 12 characters, with letters and numbers."
              error={errors.password}
              required
            />
            <PasswordField
              name="password_confirmation"
              label="Repeat the password"
              autoComplete="new-password"
              error={errors.password_confirmation}
              required
            />
          </div>
          <div className="mt-4">
            <TextAreaField name="admin_notes" label="Administrator notes" hint="Optional. Visible to user administrators only." maxLength={5000} />
          </div>
        </Card>

        <Card title="Access">
          {!canAssignRoles && (
            <Banner tone="info" title="No roles" className="mb-4" live="none">
              You don't have permission to assign roles, so the account starts without any. An administrator who can assign
              roles can add them later.
            </Banner>
          )}
          {roles.data && catalog.data ? (
            <AccessEditor
              preview={preview}
              roles={roles.data}
              catalog={catalog.data}
              selectedRoles={selectedRoles}
              overrides={NO_OVERRIDES}
              onRolesChange={setSelectedRoles}
              rolesEditable={canAssignRoles}
            />
          ) : roles.error != null || catalog.error != null ? (
            <Banner tone="danger" title="Roles could not be loaded">
              Refresh the page to try again.
            </Banner>
          ) : (
            <LoadingState label="Loading roles…" />
          )}
        </Card>

        <div>
          <Button type="submit" icon={UserPlus} loading={busy}>
            Create user
          </Button>
        </div>
      </form>
    </>
  )
}
