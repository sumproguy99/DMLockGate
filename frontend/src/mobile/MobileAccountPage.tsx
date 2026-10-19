import { ChevronLeft, ExternalLink, LogOut, ShieldCheck, Smartphone } from 'lucide-react'
import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { confirmMfaSetup, fetchOwnSessions, removeMfa, signOutOtherSessions, startMfaSetup } from '../api/auth'
import { ApiError } from '../api/client'
import { StepUpCancelled, useStepUp } from '../app/step-up-context'
import { useAuth, useCurrentUser } from '../auth/auth-context'
import { Timestamp } from '../components/status/Timestamp'
import { DetailRow as Row } from '../components/system/HealthPanels'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { TextField } from '../components/ui/Form'
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
 * and where the account is signed in, with signing out everywhere else. No administration here.
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
        <SessionsCard />
      </div>
    </>
  )
}

type Setup = { phase: 'off' } | { phase: 'scan'; secret: string; uri: string } | { phase: 'codes'; codes: string[] }

function TwoStepCard() {
  const user = useCurrentUser()
  const { reloadUser } = useAuth()
  const withStepUp = useStepUp()
  const toast = useToast()
  const [setup, setSetup] = useState<Setup>({ phase: 'off' })
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      if (!(e instanceof StepUpCancelled)) {
        setError(errorText(e, 'LockGuard could not be reached. Try again.'))
      }
    } finally {
      setBusy(false)
    }
  }

  const begin = () =>
    run(async () => {
      const started = await withStepUp('set up two-step verification', startMfaSetup)
      setSetup({ phase: 'scan', secret: started.secret, uri: started.otpauth_uri })
    })

  const finish = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const { recovery_codes } = await withStepUp('turn on two-step verification', () => confirmMfaSetup(code.trim()))
      setCode('')
      setSetup({ phase: 'codes', codes: recovery_codes })
    })
  }

  const remove = () =>
    run(async () => {
      await withStepUp('remove two-step verification', removeMfa)
      setConfirmingRemoval(false)
      await reloadUser()
      toast({ tone: 'warning', title: 'Two-step verification is off', message: 'Your password alone now signs you in.' })
    })

  return (
    <Card title="Two-step verification" headingLevel={2}>
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="size-4 text-text-muted" aria-hidden />
        <span className="text-support">Authenticator app</span>
        {user.mfa_enabled ? <StatusBadge tone="success" label="On" /> : <StatusBadge tone="warning" label="Off" />}
      </div>

      {error && (
        <Banner tone="danger" title="That did not work" className="mb-3" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      )}

      {setup.phase === 'codes' ? (
        <div className="flex flex-col gap-3">
          <Banner tone="success" title="Two-step verification is on">
            Save these recovery codes somewhere safe. Each one signs you in once if you lose your phone. They are shown only
            now.
          </Banner>
          <ul className="grid grid-cols-2 gap-2 rounded-md border border-border bg-panel-2 p-3 font-mono text-support">
            {setup.codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Button
            fullWidth
            onClick={() => {
              setSetup({ phase: 'off' })
              void reloadUser()
            }}
          >
            I have saved them
          </Button>
        </div>
      ) : setup.phase === 'scan' ? (
        <form onSubmit={finish} className="flex flex-col gap-3">
          <p className="text-support text-text-muted">
            Add LockGuard to your authenticator app, then enter the 6-digit code it shows.
          </p>
          <a
            href={setup.uri}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border-strong bg-panel-2 px-4 text-support font-semibold"
          >
            <ExternalLink className="size-4" aria-hidden />
            Open in authenticator app
          </a>
          <div>
            <p className="text-caption text-text-muted">Or type this key into the app:</p>
            <p className="font-mono text-support break-all select-all">{setup.secret}</p>
          </div>
          <TextField
            label="Code from the app"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" fullWidth loading={busy}>
            Turn on
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={() => setSetup({ phase: 'off' })} disabled={busy}>
            Cancel
          </Button>
        </form>
      ) : user.mfa_enabled ? (
        <>
          <p className="text-support text-text-muted">Signing in needs your password and a code from your authenticator app.</p>
          <Button variant="secondary" fullWidth className="mt-3" onClick={() => setConfirmingRemoval(true)}>
            Remove authenticator app
          </Button>
        </>
      ) : (
        <>
          <p className="text-support text-text-muted">
            Protect your account with a code from an authenticator app as well as your password.
          </p>
          <Button fullWidth className="mt-3" onClick={begin} loading={busy}>
            Set up two-step verification
          </Button>
        </>
      )}

      <ConfirmDialog
        open={confirmingRemoval}
        title="Remove the authenticator app?"
        consequence="Your password alone will sign you in, so anyone who learns it can use your account and your locks."
        confirmLabel="Remove"
        tone="danger"
        busy={busy}
        error={error}
        onCancel={() => setConfirmingRemoval(false)}
        onConfirm={remove}
      />
    </Card>
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
