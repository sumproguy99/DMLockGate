import { Mail, MailPlus, RefreshCw, Send, XCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../../api/client'
import { cancelInvitation, listInvitations, resendInvitation, sendInvitation, type Invitation, type InvitationStatus, type SentInvitation } from '../../api/invitations'
import { listRoles } from '../../api/users'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { TextAreaField, TextField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingState } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useToast } from '../../components/ui/toast-context'
import type { Tone } from '../../components/ui/tones'
import { useLoaded } from '../../lib/useLoaded'

const statusBadge: Record<InvitationStatus, { tone: Tone; label: string }> = {
  pending: { tone: 'info', label: 'Waiting to accept' },
  training: { tone: 'info', label: 'In training' },
  device: { tone: 'warning', label: 'Phone not registered' },
  completed: { tone: 'success', label: 'Completed' },
  expired: { tone: 'unknown', label: 'Expired' },
  cancelled: { tone: 'unknown', label: 'Cancelled' },
}

function progress(invitation: Invitation): string {
  switch (invitation.status) {
    case 'pending':
      return 'Has not created an account yet'
    case 'training':
      return invitation.lessons_completed < invitation.lessons_total
        ? `${invitation.lessons_completed} of ${invitation.lessons_total} lessons done`
        : `All lessons done, on the quiz${invitation.quiz_attempts > 0 ? ` (${invitation.quiz_attempts} ${invitation.quiz_attempts === 1 ? 'try' : 'tries'})` : ''}`
    case 'device':
      return 'Training passed; registering their phone next'
    case 'completed':
      return 'Account, training and phone done'
    default:
      return invitation.accepted_at ? 'Stopped before finishing' : 'Never accepted'
  }
}

/**
 * Invitations (users.create): send someone an email to create their account, take the training
 * and register their phone. Each invitation holds a registration code, shown once when it is sent.
 */
export function InvitationsPage() {
  const invitations = useLoaded(listInvitations, 'invitations')
  const toast = useToast()
  const withStepUp = useStepUp()
  const [inviting, setInviting] = useState(false)
  const [sent, setSent] = useState<SentInvitation | null>(null)
  const [cancelling, setCancelling] = useState<Invitation | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [resending, setResending] = useState<string | null>(null)

  async function resend(invitation: Invitation) {
    setResending(invitation.id)
    try {
      const result = await withStepUp('send the invitation again', () => resendInvitation(invitation.id))
      if (result.email_sent) {
        toast({ tone: 'success', title: `Invitation sent again to ${invitation.email}`, message: 'The earlier link no longer works.' })
      } else {
        toast({ tone: 'danger', title: 'The email could not be sent', message: result.email_error ?? undefined })
      }
      invitations.reload()
    } catch (error) {
      if (!(error instanceof StepUpCancelled)) {
        toast({ tone: 'danger', title: 'Could not send it again', message: error instanceof ApiError ? error.message : undefined })
      }
    } finally {
      setResending(null)
    }
  }

  async function confirmCancel() {
    if (!cancelling) {
      return
    }
    setCancelBusy(true)
    setCancelError(null)
    try {
      await cancelInvitation(cancelling.id)
      toast({ tone: 'success', title: `Invitation to ${cancelling.email} cancelled` })
      setCancelling(null)
      invitations.reload()
    } catch (error) {
      setCancelError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
    } finally {
      setCancelBusy(false)
    }
  }

  const columns: Column<Invitation>[] = [
    {
      key: 'person',
      header: 'Person',
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-semibold">{row.user ? <Link to={`/users/${row.user.id}`} className="text-primary-text hover:underline">{row.user.name}</Link> : (row.name ?? 'No name yet')}</p>
          <p className="text-caption break-all text-text-muted">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Where they are',
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge tone={statusBadge[row.status].tone} label={statusBadge[row.status].label} />
          <span className="text-caption text-text-muted">{progress(row)}</span>
          {row.last_send_error && <span className="text-caption text-danger-text">Last email failed</span>}
        </div>
      ),
    },
    {
      key: 'sent',
      header: 'Sent',
      className: 'hidden md:table-cell',
      cell: (row) => (
        <div className="text-caption text-text-muted">
          {row.sent_at ? <Timestamp iso={row.sent_at} /> : 'Not sent'}
          {row.invited_by && <p>by {row.invited_by}</p>}
        </div>
      ),
    },
    {
      key: 'expires',
      header: 'Link works until',
      className: 'hidden lg:table-cell',
      cell: (row) => <span className="text-caption text-text-muted">{row.status === 'completed' ? 'Used' : <Timestamp iso={row.expires_at} />}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (row) =>
        row.status === 'completed' || row.status === 'cancelled' ? null : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" icon={Send} loading={resending === row.id} onClick={() => resend(row)} aria-label={`Send the invitation to ${row.email} again`}>
              Resend
            </Button>
            <Button variant="ghost" size="sm" icon={XCircle} onClick={() => setCancelling(row)} aria-label={`Cancel the invitation to ${row.email}`}>
              Cancel
            </Button>
          </div>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Invitations"
        description="Invite someone by email. Pip the paperclip walks them through creating their account, a short training with a quiz, and registering their phone. Their phone can only be registered after they pass."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={invitations.reload} loading={invitations.loading && invitations.data !== null}>
              Refresh
            </Button>
            <Button icon={MailPlus} onClick={() => setInviting(true)}>
              Invite someone
            </Button>
          </>
        }
      />

      {sent && <SentNotice sent={sent} onDismiss={() => setSent(null)} />}

      <Card>
        {invitations.error != null && !invitations.data ? (
          <Banner tone="danger" title="Invitations could not be loaded" action={<Button variant="secondary" size="sm" onClick={invitations.reload}>Try again</Button>}>
            {invitations.error instanceof ApiError ? invitations.error.message : null}
          </Banner>
        ) : (
          <DataTable
            caption="Invitations"
            captionHidden
            columns={columns}
            rows={invitations.data ?? []}
            rowKey={(row) => row.id}
            loading={invitations.loading && !invitations.data}
            empty={
              <EmptyState
                icon={Mail}
                title="No invitations yet"
                description="Invite someone and they get an email with an Accept Invitation button."
                action={
                  <Button icon={MailPlus} onClick={() => setInviting(true)}>
                    Invite someone
                  </Button>
                }
              />
            }
          />
        )}
      </Card>

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onSent={(result) => {
          setInviting(false)
          setSent(result)
          invitations.reload()
        }}
      />

      <ConfirmDialog
        open={cancelling !== null}
        title={`Cancel the invitation to ${cancelling?.email ?? ''}?`}
        consequence="The link and the registration code it holds stop working. If they already created an account, it stays, without a registered phone."
        confirmLabel="Cancel invitation"
        cancelLabel="Keep it"
        tone="danger"
        busy={cancelBusy}
        error={cancelError}
        onConfirm={confirmCancel}
        onCancel={() => {
          setCancelling(null)
          setCancelError(null)
        }}
      />
    </>
  )
}

function SentNotice({ sent, onDismiss }: { sent: SentInvitation; onDismiss: () => void }) {
  return (
    <Banner
      tone={sent.email_sent ? 'success' : 'warning'}
      title={sent.email_sent ? `Invitation emailed to ${sent.invitation.email}` : `The invitation was saved, but the email to ${sent.invitation.email} could not be sent`}
      onDismiss={onDismiss}
      className="mb-4"
    >
      {!sent.email_sent && (
        <p className="mb-2">
          {sent.email_error} Check <Link to="/settings/email" className="font-semibold text-primary-text underline">Email settings</Link>, then use Resend.
        </p>
      )}
      {sent.registration_code && (
        <p>
          Registration code held for them: <span className="font-mono text-body font-bold tracking-wider">{sent.registration_code}</span>. It is used
          automatically when they finish the training, so they never type it. You only need it if they later register a phone from the sign-in
          screen. It is shown only now.
        </p>
      )}
    </Banner>
  )
}

function InviteDialog({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (result: SentInvitation) => void }) {
  const me = useCurrentUser()
  const withStepUp = useStepUp()
  const canAssignRoles = hasAnyPermission(me, ['users.assign_roles'])
  const roles = useLoaded(listRoles, 'roles')
  const [selected, setSelected] = useState<string[]>(['resident'])
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (name: string) => String(data.get(name) ?? '').trim()
    const input = {
      email: value('email'),
      name: value('name') || null,
      message: value('message') || null,
      roles: canAssignRoles ? selected : [],
    }
    if (!input.email) {
      setErrors({ email: 'Enter their email address.' })
      return
    }

    setBusy(true)
    setFormError(null)
    setErrors({})
    try {
      const result = await withStepUp('send an invitation', () => sendInvitation(input))
      setBusy(false)
      onSent(result)
    } catch (error) {
      setBusy(false)
      if (error instanceof ApiError && error.status === 422) {
        setErrors(Object.fromEntries(Object.keys(error.fields).map((key) => [key, error.field(key)])))
      } else if (!(error instanceof StepUpCancelled)) {
        setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      }
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Invite someone"
      description="They get an email with an Accept Invitation button. A registration code is created and held until they create an account and pass the training."
    >
      <form id="invite-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && <Banner tone="danger" title="Could not send the invitation">{formError}</Banner>}
        <TextField name="email" label="Email" type="email" autoComplete="off" error={errors.email} required autoFocus />
        <TextField name="name" label="Name" hint="Optional. Used to greet them; they can change it." autoComplete="off" error={errors.name} />
        <fieldset>
          <legend className="text-label">Access</legend>
          {!canAssignRoles ? (
            <p className="mt-1 text-caption text-text-muted">You cannot assign roles, so the account starts without any. An administrator who can assign roles adds them later.</p>
          ) : roles.data ? (
            <div className="mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
              {roles.data.map((role) => (
                <label key={role.key} className="flex cursor-pointer items-start gap-3 rounded-md border border-border-strong bg-panel-2 px-3 py-2">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-primary"
                    checked={selected.includes(role.key)}
                    onChange={() => setSelected((current) => (current.includes(role.key) ? current.filter((key) => key !== role.key) : [...current, role.key]))}
                  />
                  <span>
                    <span className="block text-support font-semibold">{role.name}</span>
                    {role.description && <span className="block text-caption text-text-muted">{role.description}</span>}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <LoadingState label="Loading roles…" />
          )}
          {errors.roles && <p className="mt-1 text-caption text-danger-text">{errors.roles}</p>}
          <p className="mt-2 text-caption text-text-muted">Lock access is given on their user page once their account exists.</p>
        </fieldset>
        <TextAreaField name="message" label="Personal note" hint="Optional. Shown in the email and on their welcome screen." maxLength={1000} error={errors.message} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" icon={Send} loading={busy}>
            Send invitation
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
