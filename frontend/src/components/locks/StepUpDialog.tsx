import { useState, type FormEvent } from 'react'
import { confirmIdentity } from '../../api/auth'
import { ApiError } from '../../api/client'
import { useCurrentUser } from '../../auth/auth-context'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { PasswordField, TextField } from '../ui/Form'

type StepUpDialogProps = {
  open: boolean
  /** What the confirmation is for, such as "unlock Front Door". */
  purpose: string
  onConfirmed: () => void
  onCancel: () => void
}

/**
 * Re-confirm identity before a sensitive action: the password, plus an authenticator code when
 * two-step verification is on. The server remembers the confirmation for a few minutes.
 */
export function StepUpDialog({ open, purpose, onConfirmed, onCancel }: StepUpDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Confirm it's you"
      description={`LockGuard needs you to confirm your identity to ${purpose}.`}
    >
      <StepUpForm onConfirmed={onConfirmed} onCancel={onCancel} />
    </Dialog>
  )
}

function StepUpForm({ onConfirmed, onCancel }: Pick<StepUpDialogProps, 'onConfirmed' | 'onCancel'>) {
  const user = useCurrentUser()
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string | null>>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    const code = String(data.get('code') ?? '').trim()
    const missing = {
      password: password ? null : 'Enter your password.',
      code: user.mfa_enabled && !code ? 'Enter the code from your authenticator app.' : null,
    }
    if (missing.password || missing.code) {
      setFields(missing)
      return
    }

    setBusy(true)
    setFormError(null)
    setFields({})
    try {
      await confirmIdentity(user.mfa_enabled ? { password, code } : { password })
      onConfirmed()
    } catch (error) {
      setBusy(false)
      if (error instanceof ApiError && error.status === 422) {
        setFields({ password: error.field('password'), code: error.field('code') })
      } else {
        setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      }
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && (
        <Banner tone="danger" title="Could not confirm">
          {formError}
        </Banner>
      )}
      <PasswordField name="password" label="Password" autoComplete="current-password" error={fields.password} required autoFocus />
      {user.mfa_enabled && (
        <TextField
          name="code"
          label="Authentication code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          error={fields.code}
          required
        />
      )}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          Confirm
        </Button>
      </div>
    </form>
  )
}
