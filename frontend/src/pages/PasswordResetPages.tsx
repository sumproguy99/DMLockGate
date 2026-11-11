import { ArrowLeft, KeyRound, LogIn, Mail } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { requestPasswordReset, resetPassword } from '../api/auth'
import { ApiError } from '../api/client'
import { BrandLogo } from '../components/brand/BrandLogo'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { PasswordField, TextField } from '../components/ui/Form'

type FieldErrors = Record<string, string | null>

const linkClass = 'inline-flex min-h-11 items-center gap-1 text-label font-semibold text-primary-text hover:underline'

function errorsFrom(error: unknown): { form: string | null; fields: FieldErrors } {
  if (error instanceof ApiError) {
    if (error.status === 422) {
      return { form: null, fields: Object.fromEntries(Object.keys(error.fields).map((k) => [k, error.field(k)])) }
    }
    return { form: error.message, fields: {} }
  }
  return { form: 'Something went wrong. Try again.', fields: {} }
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-border bg-panel p-6 shadow-panel">
          {/* On panel, not bg: the logo's own background blends away only on panel or lighter. */}
          <div className="mb-6 flex flex-col items-center text-center">
            <BrandLogo className="size-28" />
            <h1 className="mt-1 text-section">{title}</h1>
          </div>
          {children}
        </div>
      </div>
    </main>
  )
}

function BackToSignIn() {
  return (
    <Link to="/login" className={linkClass}>
      <ArrowLeft aria-hidden className="size-4" /> Back to sign in
    </Link>
  )
}

/** "Forgot password?": ask for an emailed reset link. */
export function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Forgot password · DM LockGuard'
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim()
    if (!email) {
      setEmailError('Enter your email address.')
      return
    }
    setBusy(true)
    setFormError(null)
    setEmailError(null)
    try {
      setSent((await requestPasswordReset(email)).message)
    } catch (error) {
      const { form, fields } = errorsFrom(error)
      setFormError(form)
      setEmailError(fields.email ?? null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="Forgot your password?">
      {sent ? (
        <div className="flex flex-col gap-4">
          <Banner tone="info" title="Check your email">
            {sent}
          </Banner>
          <p className="text-support text-text-muted">
            The link works once, for an hour. No email after a few minutes? Ask your LockGuard administrator.
          </p>
          <BackToSignIn />
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="text-support text-text-muted">
            Enter the email address of your LockGuard account and we will email you a link to choose a new password.
          </p>
          {formError && (
            <Banner tone="danger" title="Could not send the link">
              {formError}
            </Banner>
          )}
          <TextField name="email" label="Email" type="email" autoComplete="username" error={emailError} required autoFocus />
          <Button type="submit" icon={Mail} loading={busy} fullWidth>
            Email me a reset link
          </Button>
          <BackToSignIn />
          <p className="text-caption text-text-muted">
            Lost your authenticator or your registered phone? Ask your LockGuard administrator.
          </p>
        </form>
      )}
    </Shell>
  )
}

/** Reads the token and email from the part of the link after "#", which never reaches a server. */
function linkDetails(hash: string): { token: string; email: string } {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return { token: params.get('token') ?? '', email: params.get('email') ?? '' }
}

/** The page the emailed link opens: choose a new password. */
export function ResetPasswordPage() {
  const location = useLocation()
  const [{ token, email }] = useState(() => linkDetails(location.hash))
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fields, setFields] = useState<FieldErrors>({})

  useEffect(() => {
    document.title = 'Choose a new password · DM LockGuard'
    // Take the token out of the address bar and the history once it has been read.
    if (window.location.hash) {
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    const confirmation = String(data.get('password_confirmation') ?? '')
    const missing: FieldErrors = {
      password: password.length >= 12 ? null : 'Your password needs at least 12 characters.',
      password_confirmation: password === confirmation ? null : 'The two passwords are not the same. Type it again.',
    }
    if (missing.password || missing.password_confirmation) {
      setFields(missing)
      setFormError(null)
      return
    }
    setBusy(true)
    setFormError(null)
    setFields({})
    try {
      await resetPassword({ email, token, password, password_confirmation: confirmation })
      setDone(true)
    } catch (error) {
      const { form, fields: fieldErrors } = errorsFrom(error)
      setFormError(form ?? fieldErrors.token ?? fieldErrors.email ?? null)
      setFields(fieldErrors)
    } finally {
      setBusy(false)
    }
  }

  if (!token || !email) {
    return (
      <Shell title="This link is incomplete">
        <div className="flex flex-col gap-4">
          <Banner tone="danger" title="The reset link is missing a part">
            Open the link straight from the email, or ask for a new one.
          </Banner>
          <Link to="/forgot-password" className={linkClass}>
            Ask for a new link
          </Link>
        </div>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell title="Password changed">
        <div className="flex flex-col gap-4">
          <Banner tone="success" title="Your new password is set">
            You were signed out everywhere. Sign in on your registered phone with the new password. If you use two-step
            verification, you still need your authenticator code.
          </Banner>
          <Link
            to="/login"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary-strong px-5 text-body font-semibold text-white hover:bg-primary"
          >
            <LogIn aria-hidden className="size-5" /> Sign in
          </Link>
        </div>
      </Shell>
    )
  }

  const linkProblem = Boolean(fields.token)

  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-support text-text-muted">
          For <span className="font-semibold text-text">{email}</span>. Pick a password that is at least 12 characters
          long, with letters and numbers.
        </p>
        {formError && (
          <Banner tone="danger" title={linkProblem ? 'This link no longer works' : 'Could not change the password'}>
            {formError}
            {linkProblem && (
              <>
                {' '}
                <Link to="/forgot-password" className="font-semibold underline">
                  Ask for a new link
                </Link>
              </>
            )}
          </Banner>
        )}
        <PasswordField
          name="password"
          label="New password"
          autoComplete="new-password"
          hint="At least 12 characters, with letters and numbers."
          error={fields.password}
          required
          autoFocus
        />
        <PasswordField
          name="password_confirmation"
          label="Type the password again"
          autoComplete="new-password"
          error={fields.password_confirmation}
          required
        />
        <Button type="submit" icon={KeyRound} loading={busy} fullWidth>
          Set new password
        </Button>
      </form>
    </Shell>
  )
}
