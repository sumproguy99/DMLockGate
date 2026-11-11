import { ChevronLeft, LogOut, Smartphone } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { fetchOwnSessions, signOutOtherSessions } from '../api/auth'
import { ApiError } from '../api/client'
import { useCurrentUser } from '../auth/auth-context'
import { Timestamp } from '../components/status/Timestamp'
import { DetailRow as Row } from '../components/system/HealthPanels'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { TwoStepCard } from '../components/security/TwoStepCard'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { PageHeader } from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/Spinner'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useToast } from '../components/ui/toast-context'
import { useLoaded } from '../lib/useLoaded'

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/**
 * Mobile Account security (project.md 34.8 H): the account and its roles, two-step verification,
 * a way to its trusted devices, and where the account is signed in, with signing out everywhere
 * else. No administration here.
 */
export function MobileAccountPage() {
  const user = useCurrentUser()

  return (
    <>
      <Link to="/m/more" className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 px-2 text-label font-semibold text-primary-text">
        <ChevronLeft className="size-4" aria-hidden />
        More
      </Link>
      <PageHeader title="Account security" />
      <div className="flex flex-col gap-4">
        <Card title="Account" headingLevel={2}>
          <dl>
            <Row label="Name">{user.name}</Row>
            <Row label="Email">{user.email}</Row>
            <Row label="Roles">{user.roles.map((r) => r.name).join(', ') || 'No role'}</Row>
            <Row label="Last sign-in">{user.last_login_at ? <Timestamp iso={user.last_login_at} /> : 'Not recorded'}</Row>
            {user.account_expires_at && (
              <Row label="Access ends">
                <Timestamp iso={user.account_expires_at} />
              </Row>
            )}
          </dl>
          <p className="mt-3 text-caption text-text-muted">
            To change your name, email or password, ask your LockGuard administrator.
          </p>
        </Card>

        <TwoStepCard />
        <Card title="Trusted devices" headingLevel={2}>
          <p className="text-support text-text-muted">
            Trust the phone you keep with you, and revoke or report lost any device you no longer have.
          </p>
          <Link
            to="/m/devices"
            className="mt-3 inline-flex min-h-11 items-center gap-1 text-label font-semibold text-primary-text"
          >
            Manage your devices
          </Link>
        </Card>
        <SessionsCard />
      </div>
    </>
  )
}

function SessionsCard() {
  const toast = useToast()
  const load = useCallback((signal: AbortSignal) => fetchOwnSessions(signal), [])
  const sessions = useLoaded(load, 'own-sessions')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const others = sessions.data ? sessions.data.sessions.filter((s) => !s.current).length + sessions.data.api_clients : 0

  async function signOutOthers() {
    setBusy(true)
    setError(null)
    try {
      const ended = await signOutOtherSessions()
      setConfirming(false)
      sessions.reload()
      const count = ended.browser_logins + ended.api_clients
      toast({ tone: 'success', title: 'Signed out elsewhere', message: `${count} other sign-in${count === 1 ? '' : 's'} ended. This phone is still signed in.` })
    } catch (e) {
      setError(errorText(e, 'LockGuard could not be reached. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Where you are signed in" headingLevel={2}>
      {sessions.loading && !sessions.data ? (
        <LoadingState label="Loading your sign-ins…" />
      ) : !sessions.data ? (
        <p className="text-support text-text-muted">Your sign-ins could not be loaded.</p>
      ) : !sessions.data.listed ? (
        <p className="text-support text-text-muted">This server does not list sign-ins, but you can still sign out everywhere else.</p>
      ) : (
        <ul className="-my-2 divide-y divide-border">
          {sessions.data.sessions.map((s, i) => (
            <li key={`${s.last_active_at}-${i}`} className="flex gap-3 py-2">
              <Smartphone className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-support font-medium">
                  {s.device ?? 'Unknown browser'}
                  {s.current && <StatusBadge tone="info" label="This device" className="ml-2" />}
                </p>
                <p className="text-caption text-text-muted">
                  {s.ip_address ?? 'Unknown address'} · active <Timestamp iso={s.last_active_at} />
                </p>
              </div>
            </li>
          ))}
          {sessions.data.api_clients > 0 && (
            <li className="py-2 text-support text-text-muted">
              {sessions.data.api_clients} app sign-in{sessions.data.api_clients === 1 ? '' : 's'}
            </li>
          )}
        </ul>
      )}

      <Button variant="secondary" icon={LogOut} fullWidth className="mt-4" onClick={() => setConfirming(true)} disabled={!sessions.data}>
        Sign out everywhere else
      </Button>

      <ConfirmDialog
        open={confirming}
        title="Sign out everywhere else?"
        consequence={`Every other browser and app signed in to your account${others > 0 ? ` (${others})` : ''} is signed out and must sign in again. This phone stays signed in.`}
        confirmLabel="Sign out others"
        busy={busy}
        error={error}
        onCancel={() => setConfirming(false)}
        onConfirm={signOutOthers}
      />
    </Card>
  )
}
