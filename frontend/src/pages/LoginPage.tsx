import { LogIn } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/auth-context'
import { BrandLogo } from '../components/brand/BrandLogo'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { PasswordField, TextField } from '../components/ui/Form'

type FieldErrors = Record<string, string | null>

function errorsFrom(error: unknown): { form: string | null; fields: FieldErrors } {
  if (error instanceof ApiError) {
    if (error.status === 422) {
      return { form: null, fields: Object.fromEntries(Object.keys(error.fields).map((k) => [k, error.field(k)])) }
    }
    return { form: error.message, fields: {} }
  }

  return { form: 'Something went wrong. Try again.', fields: {} }
}

/** Sign-in (project.md 34.6 A): email and password, then the MFA code when the account has one. */
export function LoginPage() {
  const { state } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  useEffect(() => {
    document.title = 'Sign in · DM LockGuard'
  }, [])

  if (state.status === 'signed_in') {
    return <Navigate to={from} replace />
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-border bg-panel p-6 shadow-panel">
          {/* On panel, not bg: the logo's own background blends away only on panel or lighter. */}
          <div className="mb-6 flex flex-col items-center text-center">
            <BrandLogo className="size-36" />
            <h1 className="mt-1 text-section">Sign in to DM LockGuard</h1>
          </div>
          {state.status === 'mfa_required' ? <MfaStep /> : <PasswordStep notice={state.status === 'signed_out' ? state.notice : undefined} />}
        </div>
        <p className="mt-6 text-center text-caption text-text-muted">
          <Link to="/forgot-password" className="font-semibold text-primary-text hover:underline">
            Forgot your password?
          </Link>{' '}
          Lost your authenticator? Ask your LockGuard administrator.
        </p>
      </div>
    </main>
  )
}

function PasswordStep({ notice }: { notice?: string }) {
  const { signIn } = useAuth()
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fields, setFields] = useState<FieldErrors>({})
  // Shown once the server says this account is bound to a device and this one is not registered.
  const [needsCode, setNeedsCode] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '').trim()
    const password = String(data.get('password') ?? '')
    const deviceCode = String(data.get('device_code') ?? '').trim()
    const missing: FieldErrors = {
      email: email ? null : 'Enter your email address.',
      password: password ? null : 'Enter your password.',
      device_code: needsCode && !deviceCode ? 'Enter the registration code from your administrator.' : null,
    }
    if (missing.email || missing.password || missing.device_code) {
      setFields(missing)
      setFormError(null)
      return
    }

    setBusy(true)
    setFormError(null)
    setFields({})
    try {
      await signIn(email, password, needsCode ? deviceCode : undefined)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'device_registration_required') {
        setNeedsCode(true)
        setBusy(false)
        return
      }
      const { form, fields: fieldErrors } = errorsFrom(error)
      setFormError(form)
      setFields(fieldErrors)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {notice && !formError && !needsCode && <Banner tone="unknown" title={notice} />}
      {formError && <Banner tone="danger" title="Could not sign in">{formError}</Banner>}
      {needsCode && !formError && (
        <Banner tone="info" title="Register this device">
          Your account can only be used on the one device registered to it. Enter the registration code your administrator
          gave you to make this your device. Any device registered before stops working.
        </Banner>
      )}
      <TextField name="email" label="Email" type="email" autoComplete="username" error={fields.email} required autoFocus />
      <PasswordField name="password" label="Password" autoComplete="current-password" error={fields.password} required />
      {needsCode && (
        <TextField
          name="device_code"
          label="Registration code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={16}
          placeholder="XXXX-XXXX"
          error={fields.device_code}
          required
          autoFocus
        />
      )}
      <Button type="submit" icon={LogIn} loading={busy} fullWidth aria-describedby="location-notice">
        Sign in
      </Button>
      {/* The location notice (config lockguard.location.notice_version); each sign-in records the agreement. */}
      <p id="location-notice" className="text-caption text-text-muted">
        By signing in you agree that LockGuard records your phone's location when you lock or unlock with the mobile app,
        and that administrators can request your location, which is sent automatically while LockGuard is open on your
        phone. Location records are deleted automatically after a set period.
      </p>
    </form>
  )
}

function MfaStep() {
  const { verifyMfa, restart } = useAuth()
  const [useRecovery, setUseRecovery] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = String(new FormData(event.currentTarget).get('code') ?? '').trim()
    if (!value) {
      setFieldError(useRecovery ? 'Enter a recovery code.' : 'Enter the code from your authenticator app.')
      return
    }

    setBusy(true)
    setFormError(null)
    setFieldError(null)
    try {
      await verifyMfa(useRecovery ? { recovery_code: value } : { code: value })
    } catch (error) {
      const { form, fields } = errorsFrom(error)
      setFormError(form)
      setFieldError(fields.code ?? fields.recovery_code ?? null)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" key={useRecovery ? 'recovery' : 'code'}>
      <div>
        <h2 className="text-panel-title">Two-step verification</h2>
        <p className="mt-1 text-support text-text-muted">
          {useRecovery
            ? 'Enter one of the recovery codes you saved when you set up two-step verification. Each works once.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </div>
      {formError && <Banner tone="danger" title="Could not verify">{formError}</Banner>}
      {useRecovery ? (
        <TextField name="code" label="Recovery code" autoComplete="off" spellCheck={false} error={fieldError} required autoFocus />
      ) : (
        <TextField
          name="code"
          label="Authentication code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          error={fieldError}
          required
          autoFocus
        />
      )}
      <Button type="submit" loading={busy} fullWidth>
        Verify
      </Button>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => setUseRecovery((v) => !v)} disabled={busy}>
          {useRecovery ? 'Use an authenticator code' : 'Use a recovery code'}
        </Button>
        <Button variant="ghost" size="sm" onClick={restart} disabled={busy}>
          Start over
        </Button>
      </div>
    </form>
  )
}
