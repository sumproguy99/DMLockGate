import { KeyRound, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { fetchLocks } from '../../api/locks'
import { grantLockAccess, removeLockAccess, type ManagedUser } from '../../api/users'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { SelectField, TextField } from '../../components/ui/Form'
import { useToast } from '../../components/ui/toast-context'
import { useLoaded } from '../../lib/useLoaded'
import { fromLocalInput } from '../../lib/users'

type LockAccess = NonNullable<ManagedUser['locks']>[number]

function windowText(access: LockAccess) {
  if (!access.valid_from && !access.valid_until) {
    return 'No time limit'
  }
  return (
    <>
      {access.valid_from ? (
        <>
          From <Timestamp iso={access.valid_from} />
        </>
      ) : (
        'Now'
      )}
      {' – '}
      {access.valid_until ? (
        <>
          until <Timestamp iso={access.valid_until} />
        </>
      ) : (
        'no end'
      )}
    </>
  )
}

/**
 * Which locks this user may use, and when. These are LockGuard access records; nothing is written to
 * the lock itself.
 */
export function UserLocksTab({ user, isMe, onChanged }: { user: ManagedUser; isMe: boolean; onChanged: () => void }) {
  const me = useCurrentUser()
  const toast = useToast()
  const withStepUp = useStepUp()
  const locks = useLoaded(fetchLocks, 'locks')
  const [removing, setRemoving] = useState<LockAccess | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string | null>>({})

  const manageable = !isMe && user.status !== 'revoked'
  const canGrant = manageable && hasAnyPermission(me, ['access.grants_create'])
  const canRevoke = manageable && hasAnyPermission(me, ['access.grants_revoke'])
  const granted = user.locks ?? []
  const available = (locks.data ?? []).filter((lock) => !granted.some((g) => g.id === lock.id))

  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const lockId = Number(data.get('lock_id'))
    const window = {
      valid_from: fromLocalInput(String(data.get('valid_from') ?? '')),
      valid_until: fromLocalInput(String(data.get('valid_until') ?? '')),
    }
    if (!lockId) {
      setFields({ lock_id: 'Choose a lock.' })
      return
    }
    setBusy(true)
    setError(null)
    setFields({})
    try {
      await withStepUp(`give ${user.name} lock access`, () => grantLockAccess(lockId, user.id, window))
      toast({ tone: 'success', title: 'Lock access given' })
      form.reset()
      onChanged()
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 422) {
        setFields(Object.fromEntries(Object.keys(caught.fields).map((k) => [k, caught.field(k)])))
      } else if (!(caught instanceof StepUpCancelled)) {
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!removing) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await withStepUp(`remove ${user.name}'s lock access`, () => removeLockAccess(removing.id, user.id))
      toast({ tone: 'success', title: 'Lock access removed' })
      setRemoving(null)
      onChanged()
    } catch (caught) {
      if (!(caught instanceof StepUpCancelled)) {
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card
        title="Locks this person can use"
        description="LockGuard access records. Keypad codes on the lock itself are not managed here."
        className="xl:col-span-2"
      >
        {error && !removing && (
          <Banner tone="danger" title="That did not work" className="mb-3">
            {error}
          </Banner>
        )}
        {granted.length === 0 ? (
          <EmptyState icon={KeyRound} title="No lock access" description="They cannot see or use any lock." />
        ) : (
          <ul className="divide-y divide-border">
            {granted.map((access) => (
              <li key={access.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-support font-medium">{access.name}</p>
                  <p className="text-caption text-text-muted">
                    {access.property?.name && <>{access.property.name} · </>}
                    {windowText(access)}
                  </p>
                </div>
                {canRevoke && (
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setRemoving(access)}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canGrant && (
        <Card title="Give access to a lock">
          <form onSubmit={grant} noValidate className="flex flex-col gap-4">
            <SelectField
              name="lock_id"
              label="Lock"
              placeholder={available.length ? 'Choose a lock' : 'No other locks'}
              options={available.map((lock) => ({ value: String(lock.id), label: lock.name }))}
              error={fields.lock_id}
              required
            />
            <TextField name="valid_from" label="From" type="datetime-local" hint="Leave empty to start now." error={fields.valid_from} />
            <TextField name="valid_until" label="Until" type="datetime-local" hint="Leave empty for no end." error={fields.valid_until} />
            <div>
              <Button type="submit" icon={Plus} loading={busy && !removing} disabled={available.length === 0}>
                Give access
              </Button>
            </div>
          </form>
        </Card>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Remove access to ${removing?.name}?`}
        consequence={`${user.name} will no longer see or use this lock in LockGuard. Any keypad code or fingerprint stored on the lock itself is not affected.`}
        confirmLabel="Remove access"
        tone="danger"
        busy={busy}
        error={removing ? error : null}
        onConfirm={remove}
        onCancel={() => {
          setRemoving(null)
          setError(null)
        }}
      />
    </div>
  )
}
