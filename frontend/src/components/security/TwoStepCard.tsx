import { ExternalLink, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { confirmMfaSetup, removeMfa, startMfaSetup } from '../../api/auth'
import { ApiError } from '../../api/client'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { useAuth, useCurrentUser } from '../../auth/auth-context'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { TextField } from '../ui/Form'
import { StatusBadge } from '../ui/StatusBadge'
import { useToast } from '../ui/toast-context'

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

type Setup = { phase: 'off' } | { phase: 'scan'; secret: string; uri: string } | { phase: 'codes'; codes: string[] }

/**
 * Two-step verification for the signed-in user: set up an authenticator app (after an identity
 * check), see the one-time recovery codes, or remove it when the user's role does not require it.
 * Used on mobile Account security and on the screen that requires setup before anything else.
 */
export function TwoStepCard({ onDone }: { onDone?: () => void } = {}) {
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
      if (!user.mfa_required) {
        toast({ tone: 'warning', title: 'Two-step verification is off', message: 'Your password alone now signs you in.' })
      }
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
              void reloadUser().then(onDone)
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
            {user.mfa_required ? 'Move to a new phone' : 'Remove authenticator app'}
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
        title={user.mfa_required ? 'Move two-step sign-in to a new phone?' : 'Remove the authenticator app?'}
        consequence={
          user.mfa_required
            ? 'Codes from your current authenticator app stop working. Your role must use two-step sign-in, so you set up the new phone straight away and can do nothing else until you have. Keep the new phone to hand.'
            : 'Your password alone will sign you in, so anyone who learns it can use your account and your locks.'
        }
        confirmLabel={user.mfa_required ? 'Remove and set up again' : 'Remove'}
        tone="danger"
        busy={busy}
        error={error}
        onCancel={() => setConfirmingRemoval(false)}
        onConfirm={remove}
      />
    </Card>
  )
}
