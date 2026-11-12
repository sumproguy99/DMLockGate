import { Save } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { updateUser, type ManagedUser, type ProfileChanges } from '../../api/users'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { UserDevicesCard } from '../../components/devices/UserDevicesCard'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { TextAreaField, TextField } from '../../components/ui/Form'
import { useToast } from '../../components/ui/toast-context'
import { fromLocalInput, toLocalInput } from '../../lib/users'

type Fields = Record<'name' | 'username' | 'email' | 'account_expires_at' | 'admin_notes', string>

function fieldsFrom(user: ManagedUser): Fields {
  return {
    name: user.name,
    username: user.username ?? '',
    email: user.email,
    account_expires_at: toLocalInput(user.account_expires_at),
    admin_notes: user.admin_notes ?? '',
  }
}

/** Profile details and account expiry. Only changed fields are sent, so the audit log records exactly what changed. */
export function UserProfileTab({ user, editable, onSaved }: { user: ManagedUser; editable: boolean; onSaved: (user: ManagedUser) => void }) {
  const toast = useToast()
  const withStepUp = useStepUp()
  const me = useCurrentUser()
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const initial = fieldsFrom(user)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (name: keyof Fields) => String(data.get(name) ?? '').trim()

    const changes: ProfileChanges = {}
    if (value('name') !== initial.name) changes.name = value('name')
    if (value('username') !== initial.username) changes.username = value('username') || null
    if (value('email') !== initial.email) changes.email = value('email')
    if (value('account_expires_at') !== initial.account_expires_at) changes.account_expires_at = fromLocalInput(value('account_expires_at'))
    if (value('admin_notes') !== initial.admin_notes.trim()) changes.admin_notes = value('admin_notes') || null

    if (Object.keys(changes).length === 0) {
      toast({ tone: 'info', title: 'Nothing changed' })
      return
    }
    if (changes.name === '' || changes.email === '') {
      setErrors({ name: changes.name === '' ? 'Enter a name.' : null, email: changes.email === '' ? 'Enter an email address.' : null })
      return
    }

    setBusy(true)
    setFormError(null)
    setErrors({})
    try {
      onSaved(await withStepUp(`change ${user.name}'s profile`, () => updateUser(user.id, changes)))
      toast({ tone: 'success', title: 'Profile saved' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrors(Object.fromEntries(Object.keys(error.fields).map((k) => [k, error.field(k)])))
      } else if (!(error instanceof StepUpCancelled)) {
        setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card title="Profile" className="xl:col-span-2">
        <form key={JSON.stringify(initial)} onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && (
            <Banner tone="danger" title="Could not save">
              {formError}
            </Banner>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <TextField name="name" label="Name" defaultValue={initial.name} error={errors.name} required disabled={!editable} />
            <TextField name="email" label="Email" type="email" defaultValue={initial.email} error={errors.email} required disabled={!editable} />
            <TextField
              name="username"
              label="Username"
              hint="Optional. Letters, numbers, dashes and underscores."
              defaultValue={initial.username}
              error={errors.username}
              disabled={!editable}
            />
            <TextField
              name="account_expires_at"
              label="Account expires"
              type="datetime-local"
              hint="Leave empty for no expiry. After this time the account cannot sign in."
              defaultValue={initial.account_expires_at}
              error={errors.account_expires_at}
              disabled={!editable}
            />
          </div>
          <TextAreaField
            name="admin_notes"
            label="Administrator notes"
            hint="Visible to user administrators only. The audit log records that notes changed, not what they say."
            defaultValue={initial.admin_notes}
            error={errors.admin_notes}
            maxLength={5000}
            disabled={!editable}
          />
          {editable && (
            <div>
              <Button type="submit" icon={Save} loading={busy}>
                Save profile
              </Button>
            </div>
          )}
        </form>
      </Card>

      <Card title="Account">
        <dl className="flex flex-col gap-3 text-support">
          <Detail label="Two-step verification">
            {user.mfa_enabled ? 'On' : 'Off'}
            {user.mfa_required && (user.mfa_enabled ? ' (required for their role)' : ' (required for their role: they set it up at their next sign-in)')}
          </Detail>
          <Detail label="Password">
            {user.password_change_required ? 'Set by an administrator: they choose their own at their next sign-in' : 'Chosen by them'}
          </Detail>
          <Detail label="Last sign-in">{user.last_login_at ? <Timestamp iso={user.last_login_at} /> : 'Never'}</Detail>
          <Detail label="Status changed">{user.status_changed_at ? <Timestamp iso={user.status_changed_at} /> : 'Never'}</Detail>
          <Detail label="Created">{user.created_at ? <Timestamp iso={user.created_at} /> : 'Unknown'}</Detail>
        </dl>
      </Card>

      {hasAnyPermission(me, ['devices.view']) && <UserDevicesCard userId={user.id} name={user.name} />}
    </div>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-label text-text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
