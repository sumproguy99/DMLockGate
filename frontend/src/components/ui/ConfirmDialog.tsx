import { useState, type ReactNode } from 'react'
import { Banner } from './Banner'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { TextField } from './Form'

type ConfirmDialogProps = {
  open: boolean
  title: ReactNode
  /** What will happen and what it affects. Shown as the dialog's description. */
  consequence: ReactNode
  /** More detail under the description, such as the lock name and who will be affected. */
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** "danger" for destructive or high-impact actions. */
  tone?: 'primary' | 'danger'
  /** The action is running: the buttons are disabled and the dialog cannot be dismissed. */
  busy?: boolean
  /** Why the last attempt failed, shown inside the dialog so the user can retry or cancel. */
  error?: string | null
  /** A phrase the user must type exactly before confirming, for the highest-impact actions. */
  confirmPhrase?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation for sensitive actions (project.md 34.9): it says what the action does and what it
 * affects. Focus starts on Cancel (or on the phrase box), so Enter never confirms by accident.
 */
export function ConfirmDialog({ open, onCancel, busy = false, title, consequence, ...rest }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      role="alertdialog"
      title={title}
      description={consequence}
      onClose={() => !busy && onCancel()}
      hideCloseButton
    >
      {/* Mounted only while open, so a typed phrase never carries over to the next confirmation. */}
      <ConfirmBody onCancel={onCancel} busy={busy} {...rest} />
    </Dialog>
  )
}

function ConfirmBody({
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy,
  error,
  confirmPhrase,
  onConfirm,
  onCancel,
}: Omit<ConfirmDialogProps, 'open' | 'title' | 'consequence'>) {
  const [typed, setTyped] = useState('')
  const phraseMatches = confirmPhrase === undefined || typed === confirmPhrase

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (phraseMatches && !busy) {
          onConfirm()
        }
      }}
      className="flex flex-col gap-4"
    >
      {children}
      {confirmPhrase !== undefined && (
        <TextField
          label={
            <>
              Type <span className="font-mono font-semibold">{confirmPhrase}</span> to confirm
            </>
          }
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      )}
      {error && (
        <Banner tone="danger" title="That did not work">
          {error}
        </Banner>
      )}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button type="submit" variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} disabled={!phraseMatches}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  )
}
