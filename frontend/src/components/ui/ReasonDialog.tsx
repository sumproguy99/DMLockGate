import { useState, type FormEvent, type ReactNode } from 'react'
import { Banner } from './Banner'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { TextAreaField } from './Form'

type ReasonDialogProps = {
  open: boolean
  title: ReactNode
  /** What will happen and what it affects. */
  consequence: ReactNode
  confirmLabel: string
  tone?: 'primary' | 'danger'
  busy?: boolean
  error?: string | null
  onConfirm: (reason: string) => void
  onCancel: () => void
}

/**
 * A confirmation that also asks why, for actions the audit log records with a reason (suspension,
 * revocation, signing someone out).
 */
export function ReasonDialog({ open, title, consequence, onCancel, busy = false, ...rest }: ReasonDialogProps) {
  return (
    <Dialog open={open} role="alertdialog" title={title} description={consequence} onClose={() => !busy && onCancel()} hideCloseButton>
      <ReasonForm onCancel={onCancel} busy={busy} {...rest} />
    </Dialog>
  )
}

function ReasonForm({
  confirmLabel,
  tone = 'primary',
  busy,
  error,
  onConfirm,
  onCancel,
}: Omit<ReasonDialogProps, 'open' | 'title' | 'consequence'>) {
  const [fieldError, setFieldError] = useState<string | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim()
    if (reason.length < 3) {
      setFieldError('Give a short reason (at least 3 characters). It is kept in the audit log.')
      return
    }
    setFieldError(null)
    onConfirm(reason)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <TextAreaField name="reason" label="Reason" hint="Kept in the audit log." maxLength={255} error={fieldError} required disabled={busy} />
      {error && (
        <Banner tone="danger" title="That did not work">
          {error}
        </Banner>
      )}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  )
}
