import { ArrowRight, Check, LogIn, Smartphone, UserPlus } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../../api/client'
import { createInvitedAccount, getInvitation, registerInvitedDevice, type InvitationView } from '../../api/invitations'
import { useAuth } from '../../auth/auth-context'
import { BrandLogo } from '../../components/brand/BrandLogo'
import { PipSays } from '../../components/onboarding/Pip'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { PasswordField, TextField } from '../../components/ui/Form'
import { LoadingState } from '../../components/ui/Spinner'
import { cx } from '../../lib/cx'
import { formatAbsolute } from '../../lib/time'
import { QuizStep } from './QuizStep'
import { TrainingStep } from './TrainingStep'

type Step = 'welcome' | 'account' | 'training' | 'quiz' | 'device' | 'done'

const STEPS: { key: Step; label: string }[] = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'account', label: 'Your account' },
  { key: 'training', label: 'Training' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'device', label: 'Your phone' },
  { key: 'done', label: 'Done' },
]

/** Where the server says the person is, apart from the welcome screen, which only the page knows. */
function stepFor(view: InvitationView, welcomed: boolean): Step | 'closed' {
  switch (view.status) {
    case 'pending':
      return welcomed ? 'account' : 'welcome'
    case 'training':
      return view.lessons.every((lesson) => view.lessons_completed.includes(lesson)) ? 'quiz' : 'training'
    case 'device':
      return 'device'
    case 'completed':
      return 'done'
    default:
      return 'closed'
  }
}

/**
 * Accepting an invitation (/invite/:token), with Pip the paperclip as guide: welcome, create the
 * account, every training lesson, the quiz, and registering this phone, which signs the person in.
 * Works signed out; the link's token is the credential until the phone is registered.
 */
export function InvitationPage() {
  const { token = '' } = useParams()
  const [view, setView] = useState<InvitationView | null>(null)
  const [loadError, setLoadError] = useState<ApiError | null>(null)
  const [welcomed, setWelcomed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    document.title = 'Your invitation · DM LockGuard'
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getInvitation(token, controller.signal)
      .then((loaded) => {
        setView(loaded)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof ApiError ? error : new ApiError(0, 'unknown', 'Something went wrong. Try again.'))
        }
      })
    return () => controller.abort()
  }, [token, attempt])

  const step = view ? stepFor(view, welcomed) : null

  return (
    <main className="min-h-dvh px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <BrandLogo className="size-12 rounded-md" />
          <div>
            <p className="text-panel-title">DM LockGuard</p>
            <p className="text-caption text-text-muted">Your invitation</p>
          </div>
        </header>

        {step && step !== 'closed' && <Stepper current={step} />}

        <div className="rounded-xl border border-border bg-panel p-4 shadow-panel sm:p-6">
          {!view && !loadError && <LoadingState label="Opening your invitation…" />}
          {loadError && !view && <LinkProblem error={loadError} onRetry={() => setAttempt((n) => n + 1)} />}
          {view && step === 'welcome' && <WelcomeStep view={view} onStart={() => setWelcomed(true)} />}
          {view && step === 'account' && <AccountStep token={token} view={view} onCreated={setView} />}
          {view && step === 'training' && <TrainingStep token={token} view={view} onChange={setView} />}
          {view && step === 'quiz' && <QuizStep token={token} onPassed={() => setView({ ...view, status: 'device', training_completed: true })} />}
          {view && step === 'device' && <DeviceStep token={token} view={view} />}
          {view && step === 'done' && <DoneStep />}
          {view && step === 'closed' && <ClosedStep view={view} />}
        </div>
      </div>
    </main>
  )
}

function Stepper({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((item) => item.key === current)

  return (
    <nav aria-label="Your progress">
      <ol className="grid grid-cols-6 gap-1">
        {STEPS.map((item, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'next'
          return (
            <li key={item.key} aria-current={state === 'current' ? 'step' : undefined} className="flex flex-col items-center gap-1 text-center">
              <span
                className={cx(
                  'flex size-8 items-center justify-center rounded-full border-2 text-label font-bold',
                  state === 'done' && 'border-success bg-success text-bg',
                  state === 'current' && 'border-primary bg-primary/15 text-primary-text shadow-glow-primary',
                  state === 'next' && 'border-border-strong text-text-muted',
                )}
              >
                {state === 'done' ? <Check className="size-4" aria-hidden /> : index + 1}
              </span>
              <span className={cx('text-caption leading-tight', state === 'current' ? 'font-semibold text-text' : 'text-text-muted')}>
                {item.label}
                {state === 'done' && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function LinkProblem({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const notFound = error.code === 'invitation_not_found'

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title">{notFound ? 'This link does not work' : 'Something went wrong'}</h1>
      <PipSays mood="oops">
        <p>{error.message}</p>
        {notFound && <p>Tip: invitation links are long. If you copied it, make sure you got every last letter.</p>}
      </PipSays>
      {!notFound && (
        <div>
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}

function WelcomeStep({ view, onStart }: { view: InvitationView; onStart: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title">{view.name ? `Hi ${view.name}, welcome!` : 'Hi there, welcome!'}</h1>
      <PipSays mood="wave" large>
        <p>
          <strong>{view.invited_by ?? 'Your administrator'}</strong> invited you to DM LockGuard, the app that locks and unlocks your doors from
          your phone.
        </p>
        <p>I'm Pip, a paperclip, and I'll be your guide. It only takes a few minutes, and there are jokes. Some of them are even funny.</p>
      </PipSays>

      {view.message && (
        <blockquote className="rounded-lg border-l-4 border-primary bg-panel-2 px-4 py-3 text-support italic">
          "{view.message}"
          <footer className="mt-1 text-caption text-text-muted not-italic">{view.invited_by}</footer>
        </blockquote>
      )}

      <div className="rounded-lg border border-border bg-panel-2 p-4">
        <h2 className="text-panel-title">Here is the plan</h2>
        <ol className="mt-3 flex flex-col gap-3">
          {[
            ['Create your account', 'Your name and a password. Your email is already filled in.'],
            ['Take the training', `${view.lessons.length} short lessons where you tap, sort and practice on a pretend door.`],
            ['Pass the quiz', `${view.quiz_questions} questions. Get them all right (hints included!).`],
            ['Register your phone', view.device_bound ? 'This phone becomes the one phone your account works on.' : 'This phone is added to your account.'],
          ].map(([title, detail], index) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-label font-bold text-primary-text">
                {index + 1}
              </span>
              <span>
                <span className="block text-support font-semibold">{title}</span>
                <span className="block text-caption text-text-muted">{detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <dl className="grid gap-2 text-support sm:grid-cols-2">
        <div>
          <dt className="text-caption text-text-muted">Your email</dt>
          <dd className="font-medium break-all">{view.email}</dd>
        </div>
        {view.roles.length > 0 && (
          <div>
            <dt className="text-caption text-text-muted">Your access</dt>
            <dd className="font-medium">{view.roles.join(', ')}</dd>
          </div>
        )}
        <div>
          <dt className="text-caption text-text-muted">This invitation works until</dt>
          <dd className="font-medium">{formatAbsolute(view.expires_at)}</dd>
        </div>
      </dl>

      {view.device_bound && (
        <Banner tone="info" title="Use the phone you will open doors with" live="none">
          Your account will only work on the phone you finish on. If this is not that phone, open the invitation email on that phone instead.
        </Banner>
      )}

      <div>
        <Button size="lg" icon={ArrowRight} onClick={onStart}>
          Let's go!
        </Button>
      </div>
    </div>
  )
}

function AccountStep({ token, view, onCreated }: { token: string; view: InvitationView; onCreated: (view: InvitationView) => void }) {
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (name: string) => String(data.get(name) ?? '')
    const input = {
      name: value('name').trim(),
      username: value('username').trim() || null,
      password: value('password'),
      password_confirmation: value('password_confirmation'),
    }
    const missing = {
      name: input.name ? null : 'Tell us your name.',
      password: input.password.length >= 12 ? null : 'Your password needs at least 12 characters.',
      password_confirmation: input.password === input.password_confirmation ? null : 'The two passwords are not the same. Type it again.',
    }
    if (Object.values(missing).some(Boolean)) {
      setErrors(missing)
      return
    }

    setBusy(true)
    setFormError(null)
    setErrors({})
    try {
      onCreated(await createInvitedAccount(token, input))
    } catch (error) {
      setBusy(false)
      if (error instanceof ApiError && error.status === 422) {
        setErrors(Object.fromEntries(Object.keys(error.fields).map((key) => [key, error.field(key)])))
        if (error.field('email')) {
          setFormError(error.field('email'))
        }
      } else {
        setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      }
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <h1 className="text-page-title">Create your account</h1>
      <PipSays mood="point">
        <p>First, your account. Pick a password that is at least 12 characters long, with letters and numbers.</p>
        <p>Tip: a silly sentence makes a great password, like "purple-llama-eats-42-tacos". Long, easy to remember, hard to guess!</p>
      </PipSays>
      {formError && <Banner tone="danger" title="Could not create your account">{formError}</Banner>}
      <div className="flex flex-col gap-1">
        <span className="text-label">Email</span>
        <span className="rounded-md border border-border bg-panel-2 px-3 py-2.5 text-support break-all">{view.email}</span>
        <span className="text-caption text-text-muted">This is the email you were invited with. You will sign in with it.</span>
      </div>
      <TextField name="name" label="Your name" autoComplete="name" defaultValue={view.name ?? ''} error={errors.name} required />
      <TextField name="username" label="Username" hint="Optional. Letters, numbers, dashes." autoComplete="username" error={errors.username} />
      <PasswordField
        name="password"
        label="Password"
        autoComplete="new-password"
        hint="At least 12 characters, with letters and numbers."
        error={errors.password}
        required
      />
      <PasswordField name="password_confirmation" label="Type the password again" autoComplete="new-password" error={errors.password_confirmation} required />
      <div>
        <Button type="submit" size="lg" icon={UserPlus} loading={busy}>
          Create my account
        </Button>
      </div>
    </form>
  )
}

function DeviceStep({ token, view }: { token: string; view: InvitationView }) {
  const { retry } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const password = String(new FormData(event.currentTarget).get('password') ?? '')
    if (!password) {
      setFieldError('Type the password you chose a few minutes ago.')
      return
    }
    setBusy(true)
    setError(null)
    setFieldError(null)
    try {
      await registerInvitedDevice(token, password)
      // Signed in now: read the session, and the page shows the finish line.
      retry()
    } catch (caught) {
      setBusy(false)
      if (caught instanceof ApiError && caught.status === 422) {
        setFieldError(caught.field('password'))
      } else {
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.')
      }
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <h1 className="text-page-title">Register your phone</h1>
      <PipSays mood="cheer">
        <p>You passed the quiz! Every single question. I'm doing a little paperclip dance right now.</p>
        <p>Last step: make this phone your LockGuard phone. Type your password once more so I know it's really you.</p>
      </PipSays>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-panel-2 p-4">
        <Smartphone className="mt-0.5 size-6 shrink-0 text-primary-text" aria-hidden />
        <div className="text-support">
          <p className="font-semibold">This phone or browser will be registered.</p>
          <p className="mt-1 text-text-muted">
            {view.device_bound
              ? 'Your account will work on this one device only. A new phone later needs a new registration code from your administrator.'
              : 'It is added to your account as a registered device.'}{' '}
            Your registration code was saved for you when you were invited, so there is nothing to type except your password.
          </p>
        </div>
      </div>
      {error && <Banner tone="danger" title="Could not register this phone">{error}</Banner>}
      <PasswordField name="password" label="Your password" autoComplete="current-password" error={fieldError} required />
      <div>
        <Button type="submit" size="lg" icon={Smartphone} loading={busy}>
          Register this phone
        </Button>
      </div>
    </form>
  )
}

function DoneStep() {
  const { state } = useAuth()
  const signedIn = state.status === 'signed_in'

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title">You did it!</h1>
      <PipSays mood="cheer" large>
        <p>
          <strong>Account made, training finished, quiz passed, phone registered.</strong> You are now an official LockGuard door expert.
        </p>
        <p>Remember: wait for "Locked", check "Unknown" doors yourself, keep your password secret, and tell your administrator fast if your phone goes missing.</p>
        <p>It has been an honor holding things together with you. Bye for now! 📎</p>
      </PipSays>
      <div className="flex flex-wrap gap-3">
        {signedIn ? (
          <Link to="/m" className="inline-flex min-h-12 items-center gap-2 rounded-md bg-primary-strong px-5 text-body font-semibold text-white hover:bg-primary">
            <ArrowRight className="size-5" aria-hidden />
            Open LockGuard
          </Link>
        ) : (
          <Link to="/login" className="inline-flex min-h-12 items-center gap-2 rounded-md bg-primary-strong px-5 text-body font-semibold text-white hover:bg-primary">
            <LogIn className="size-5" aria-hidden />
            Sign in
          </Link>
        )}
      </div>
    </div>
  )
}

function ClosedStep({ view }: { view: InvitationView }) {
  const message =
    view.status === 'cancelled'
      ? 'This invitation was cancelled. If you still need access, ask your administrator for a new one.'
      : 'This invitation has expired. Ask your administrator to send it again; you will pick up where you left off.'

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title">{view.status === 'cancelled' ? 'This invitation was cancelled' : 'This invitation has expired'}</h1>
      <PipSays mood="oops">
        <p>{message}</p>
      </PipSays>
    </div>
  )
}
