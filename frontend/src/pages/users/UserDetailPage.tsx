import { ArrowLeft, Ban, LogOut, Pause, Play } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../../api/client'
import { changeUserStatus, getUser, signOutEverywhere, type ManagedUser, type StatusChange } from '../../api/users'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { hasAnyPermission, useCurrentUser } from '../../auth/auth-context'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { ReasonDialog } from '../../components/ui/ReasonDialog'
import { LoadingState } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/toast-context'
import { useLoaded } from '../../lib/useLoaded'
import { describeUserStatus } from '../../lib/users'
import { UserAccessTab } from './UserAccessTab'
import { UserHistoryTab } from './UserHistoryTab'
import { UserLocksTab } from './UserLocksTab'
import { UserProfileTab } from './UserProfileTab'

type Action = StatusChange | 'sign_out'

const actionCopy: Record<Action, { title: (name: string) => string; consequence: string; confirm: string; tone: 'primary' | 'danger'; done: string }> = {
  suspend: {
    title: (name) => `Suspend ${name}?`,
    consequence: 'They are signed out everywhere at once and cannot sign in or use any lock until reactivated.',
    confirm: 'Suspend',
    tone: 'danger',
    done: 'Account suspended',
  },
  reactivate: {
    title: (name) => `Reactivate ${name}?`,
    consequence: 'They can sign in again with their existing password, roles and lock access.',
    confirm: 'Reactivate',
    tone: 'primary',
    done: 'Account reactivated',
  },
  revoke: {
    title: (name) => `Revoke ${name} permanently?`,
    consequence:
      'They are signed out everywhere and can never sign in again. Revocation cannot be undone; a new account would be needed.',
    confirm: 'Revoke permanently',
    tone: 'danger',
    done: 'Account revoked',
  },
  sign_out: {
    title: (name) => `Sign ${name} out everywhere?`,
    consequence: 'Every browser and app session ends now. The account stays active and they can sign in again with their password.',
    confirm: 'Sign out everywhere',
    tone: 'danger',
    done: 'Signed out everywhere',
  },
}

/** One user: profile, roles and permissions, lock access, security history and account actions. */
export function UserDetailPage() {
  const { id } = useParams()
  const userId = Number(id)
  const me = useCurrentUser()
  const toast = useToast()
  const withStepUp = useStepUp()
  const loaded = useLoaded((signal) => getUser(userId, signal), String(userId))
  const [action, setAction] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [updated, setUpdated] = useState<ManagedUser | null>(null)

  const user = updated?.id === userId ? updated : loaded.data
  const can = (permission: string) => hasAnyPermission(me, [permission])

  if (loaded.error instanceof ApiError && loaded.error.status === 404) {
    return (
      <>
        <PageHeader title="User not found" />
        <Link to="/users" className="text-primary-text hover:underline">
          Back to users
        </Link>
      </>
    )
  }
  if (!user) {
    return loaded.error != null ? (
      <Banner
        tone="danger"
        title="This user could not be loaded"
        action={
          <Button variant="secondary" size="sm" onClick={loaded.reload}>
            Try again
          </Button>
        }
      >
        {loaded.error instanceof Error ? loaded.error.message : 'Something went wrong.'}
      </Banner>
    ) : (
      <LoadingState label="Loading user…" />
    )
  }

  const isMe = user.id === me.id
  const status = describeUserStatus(user)
  const actions: Array<{ action: Action; label: string; icon: typeof Pause; show: boolean }> = [
    { action: 'suspend', label: 'Suspend', icon: Pause, show: can('users.suspend') && user.status === 'active' },
    { action: 'reactivate', label: 'Reactivate', icon: Play, show: can('users.reactivate') && user.status === 'suspended' },
    { action: 'sign_out', label: 'Sign out everywhere', icon: LogOut, show: can('devices.revoke_sessions') && user.status === 'active' },
    { action: 'revoke', label: 'Revoke', icon: Ban, show: can('users.revoke') && user.status !== 'revoked' },
  ]
  const visible = isMe ? [] : actions.filter((a) => a.show)

  function onSaved(next: ManagedUser) {
    setUpdated(next)
  }

  async function run(reason: string) {
    if (!action || !user) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      if (action === 'sign_out') {
        const ended = await withStepUp(`sign ${user.name} out everywhere`, () => signOutEverywhere(user.id, reason))
        toast({ tone: 'success', title: actionCopy.sign_out.done, message: `${ended.browser_logins + ended.api_clients} session(s) ended.` })
      } else {
        const next = await withStepUp(`${action} ${user.name}`, () => changeUserStatus(user.id, action, reason))
        onSaved(next)
        toast({ tone: 'success', title: actionCopy[action].done })
      }
      setAction(null)
    } catch (error) {
      if (!(error instanceof StepUpCancelled)) {
        setActionError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Link to="/users" className="mb-3 inline-flex items-center gap-1.5 text-support text-text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />
        Users
      </Link>
      <PageHeader
        title={user.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge {...status} />
            <span>{user.email}</span>
            {user.roles && user.roles.length > 0 && <span>· {user.roles.map((r) => r.name).join(', ')}</span>}
          </span>
        }
        actions={visible.map(({ action: a, label, icon }) => (
          <Button
            key={a}
            variant={a === 'revoke' ? 'danger' : 'secondary'}
            size="sm"
            icon={icon}
            onClick={() => {
              setActionError(null)
              setAction(a)
            }}
          >
            {label}
          </Button>
        ))}
      />

      {isMe && (
        <Banner tone="info" title="This is your own account" className="mb-4" live="none">
          LockGuard does not let administrators change their own roles, permissions or status. Ask another administrator.
        </Banner>
      )}

      <Tabs
        label="User details"
        tabs={[
          { id: 'profile', label: 'Profile', content: <UserProfileTab user={user} editable={can('users.edit') && !isMe && user.status !== 'revoked'} onSaved={onSaved} /> },
          { id: 'access', label: 'Roles and permissions', content: <UserAccessTab user={user} isMe={isMe} onSaved={onSaved} /> },
          { id: 'locks', label: 'Lock access', content: (
              <UserLocksTab
                user={user}
                isMe={isMe}
                onChanged={() => {
                  setUpdated(null)
                  loaded.reload()
                }}
              />
            ),
          },
          { id: 'history', label: 'Security history', content: <UserHistoryTab userId={user.id} /> },
        ]}
      />

      {action && (
        <ReasonDialog
          open
          title={actionCopy[action].title(user.name)}
          consequence={actionCopy[action].consequence}
          confirmLabel={actionCopy[action].confirm}
          tone={actionCopy[action].tone}
          busy={busy}
          error={actionError}
          onConfirm={run}
          onCancel={() => setAction(null)}
        />
      )}
    </>
  )
}
