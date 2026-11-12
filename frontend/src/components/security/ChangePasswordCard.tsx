import { KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { changePassword } from '../../api/auth'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/auth-context'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { PasswordField } from '../ui/Form'
import { useToast } from '../ui/toast-context'

type FieldErrors = Record<string, string | null>

/**
 * Change the signed-in user's password with their current one. Other sessions end; this one stays
 * signed in. Used on Account security and on the screen that requires a new password first.
 */
export function ChangePasswordCard({ title = 'Change password', description }: { title?: string; description?: string }) {
  const { reloadUser } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fields, setFields] = useState<FieldErrors>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const current = String(data.get('current_password') ?? '')
    const password = String(data.get('password') ?? '')
    const confirmation = String(data.get('password_confirmation') ?? '')
    const missing: FieldErrors = {
      current_password: current ? null : 'Enter your current password.',
      password: password.length >= 12 ? null : 'Your password needs at least 12 characters.',
      password_confirmation: password === confirmation ? null : 'The two passwords are not the same. Type it again.',
    }
    if (Object.values(missing).some(Boolean)) {
      setFields(missing)
      setFormError(null)
      return
    }

    setBusy(true)
    setFormError(null)
    setFields({})
    try {
      const { signed_out: ended } = await changePassword({ current_password: current, password, password_confirmation: confirmation })
      form.reset()
      const others = ended.browser_logins + ended.api_clients
      toast({
        tone: 'success',
        title: 'Password changed',
        message: others > 0 ? `${others} other session(s) were signed out.` : 'Use it the next time you sign in.',
      })
      await reloadUser()
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setFields(Object.fromEntries(Object.keys(error.fields).map((key) => [key, error.field(key)])))
      } else {
        setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={title} description={description} headingLevel={2}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && (
          <Banner tone="danger" title="Could not change the password" onDismiss={() => setFormError(null)}>
            {formError}
          </Banner>
        )}
        <PasswordField name="current_password" label="Current password" autoComplete="current-password" error={fields.current_password} required />
        <PasswordField
          name="password"
          label="New password"
          autoComplete="new-password"
          hint="At least 12 characters, with letters and numbers."
          error={fields.password}
          required
        />
        <PasswordField name="password_confirmation" label="Type the new password again" autoComplete="new-password" error={fields.password_confirmation} required />
        <Button type="submit" icon={KeyRound} loading={busy} fullWidth>
          Change password
        </Button>
      </form>
    </Card>
  )
}
