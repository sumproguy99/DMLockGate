import { MailCheck, Save } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { getEmailSettings, saveEmailSettings, sendTestEmail, type EmailSettings, type EmailSettingsInput, type MailSecurity } from '../../api/settings'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { useCurrentUser } from '../../auth/auth-context'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { CheckboxField, PasswordField, SelectField, TextField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingState } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { useLoaded } from '../../lib/useLoaded'

const SECURITY_OPTIONS: { value: MailSecurity; label: string }[] = [
  { value: 'starttls', label: 'STARTTLS (usually port 587)' },
  { value: 'tls', label: 'TLS from the start (usually port 465)' },
  { value: 'none', label: 'None (a relay on this network only)' },
]

/** Common providers, to fill in the server details. The password is always the person's own. */
const PRESETS: { label: string; host: string; port: number; security: MailSecurity; note: string }[] = [
  { label: 'Gmail', host: 'smtp.gmail.com', port: 587, security: 'starttls', note: 'Use a Google app password (Google Account > Security > App passwords), not your normal password.' },
  { label: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, security: 'starttls', note: 'SMTP sending must be allowed for the mailbox in Microsoft 365.' },
  { label: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, security: 'starttls', note: 'The username is the word "apikey" and the password is your SendGrid API key.' },
]

type Form = {
  enabled: boolean
  host: string
  port: string
  security: MailSecurity
  username: string
  password: string
  removePassword: boolean
  from_address: string
  from_name: string
}

function formFrom(settings: EmailSettings): Form {
  return {
    enabled: settings.configured ? settings.enabled : true,
    host: settings.host,
    port: String(settings.port),
    security: settings.security,
    username: settings.username,
    password: '',
    removePassword: false,
    from_address: settings.from_address,
    from_name: settings.from_name,
  }
}

/**
 * Email settings (admin.notifications): the mail server LockGuard sends invitations through. The
 * saved password is never shown again; leave the field empty to keep it.
 */
export function EmailSettingsPage() {
  const settings = useLoaded(getEmailSettings, 'email-settings')

  return (
    <>
      <PageHeader
        title="Email settings"
        description="How LockGuard sends email, such as invitations. Fill in your mail provider's details, save, then send yourself a test email."
      />
      {settings.data ? (
        <EmailSettingsForm key={settings.data.updated_at ?? 'new'} settings={settings.data} onSaved={settings.reload} />
      ) : settings.error != null ? (
        <Banner tone="danger" title="Email settings could not be loaded" action={<Button variant="secondary" size="sm" onClick={settings.reload}>Try again</Button>}>
          {settings.error instanceof ApiError ? settings.error.message : null}
        </Banner>
      ) : (
        <LoadingState label="Loading email settings…" />
      )}
    </>
  )
}

function EmailSettingsForm({ settings, onSaved }: { settings: EmailSettings; onSaved: () => void }) {
  const me = useCurrentUser()
  const toast = useToast()
  const withStepUp = useStepUp()
  const [form, setForm] = useState<Form>(() => formFrom(settings))
  const [presetNote, setPresetNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [testTo, setTestTo] = useState(me.email)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ sent: boolean; error: string | null; mailer: string } | null>(null)

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }))

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input: EmailSettingsInput = {
      enabled: form.enabled,
      host: form.host.trim(),
      port: Number(form.port),
      security: form.security,
      username: form.username.trim() || null,
      from_address: form.from_address.trim(),
      from_name: form.from_name.trim(),
    }
    if (form.removePassword) {
      input.password = ''
    } else if (form.password !== '') {
      input.password = form.password
    }
    const missing = {
      host: form.enabled && !input.host ? 'Enter the mail server, such as smtp.gmail.com.' : null,
      port: Number.isInteger(input.port) && input.port > 0 && input.port < 65536 ? null : 'Enter a port number, such as 587.',
      from_address: input.from_address ? null : 'Enter the address emails come from.',
      from_name: input.from_name ? null : 'Enter the name emails come from.',
    }
    if (Object.values(missing).some(Boolean)) {
      setErrors(missing)
      return
    }

    setBusy(true)
    setFormError(null)
    setErrors({})
    try {
      await withStepUp('change the email settings', () => saveEmailSettings(input))
      toast({ tone: 'success', title: 'Email settings saved', message: 'Send a test email to check them.' })
      onSaved()
    } catch (error) {
      setBusy(false)
      if (error instanceof ApiError && error.status === 422) {
        setErrors(Object.fromEntries(Object.keys(error.fields).map((key) => [key, error.field(key)])))
      } else if (!(error instanceof StepUpCancelled)) {
        setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      }
    }
  }

  async function test(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await sendTestEmail(testTo.trim()))
    } catch (error) {
      setTestResult({ sent: false, error: error instanceof ApiError ? (error.field('to') ?? error.message) : 'Something went wrong.', mailer: '' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {!settings.configured && (
        <Banner tone="info" title="Email is not set up in LockGuard yet" live="none">
          Until you save settings here, LockGuard uses the server's own mail setting ({settings.fallback_mailer === 'log' ? 'log only: emails are written to the server log and never delivered' : settings.fallback_mailer}).
        </Banner>
      )}

      <form onSubmit={save} noValidate className="flex flex-col gap-4">
        {formError && <Banner tone="danger" title="Could not save">{formError}</Banner>}
        <Card
          title="Mail server"
          description={
            settings.updated_at ? (
              <>
                Last changed <Timestamp iso={settings.updated_at} />
                {settings.updated_by ? ` by ${settings.updated_by}` : ''}.
              </>
            ) : (
              'Your email provider gives you these details.'
            )
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-label text-text-muted">Fill in for:</span>
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="secondary"
                size="sm"
                onClick={() => {
                  setForm((current) => ({ ...current, host: preset.host, port: String(preset.port), security: preset.security }))
                  setPresetNote(`${preset.label}: ${preset.note}`)
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {presetNote && <Banner tone="info" title={presetNote} className="mb-4" live="status" />}
          <div className="flex flex-col gap-4">
            <CheckboxField
              label="Send email through this server"
              hint="Turn off to go back to the server's own mail setting."
              checked={form.enabled}
              onChange={(event) => set('enabled', event.target.checked)}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Server" name="host" placeholder="smtp.example.com" value={form.host} onChange={(event) => set('host', event.target.value)} error={errors.host} required={form.enabled} />
              <TextField label="Port" name="port" inputMode="numeric" value={form.port} onChange={(event) => set('port', event.target.value)} error={errors.port} required />
              <SelectField label="Security" name="security" options={SECURITY_OPTIONS} value={form.security} onChange={(event) => set('security', event.target.value as MailSecurity)} error={errors.security} />
              <TextField label="Username" name="username" hint="Usually your full email address." autoComplete="off" value={form.username} onChange={(event) => set('username', event.target.value)} error={errors.username} />
              <PasswordField
                label="Password"
                name="password"
                autoComplete="new-password"
                hint={settings.password_set ? 'A password is saved. Leave this empty to keep it.' : 'Your mail password or app password.'}
                value={form.password}
                disabled={form.removePassword}
                onChange={(event) => set('password', event.target.value)}
                error={errors.password}
              />
              {settings.password_set && (
                <div className="flex items-end">
                  <CheckboxField label="Remove the saved password" checked={form.removePassword} onChange={(event) => set('removePassword', event.target.checked)} />
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card title="Sender" description="Who the emails say they are from. Many providers require the address to be your own mailbox.">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="From address" name="from_address" type="email" value={form.from_address} onChange={(event) => set('from_address', event.target.value)} error={errors.from_address} required />
            <TextField label="From name" name="from_name" value={form.from_name} onChange={(event) => set('from_name', event.target.value)} error={errors.from_name} required />
          </div>
        </Card>

        <div>
          <Button type="submit" icon={Save} loading={busy}>
            Save email settings
          </Button>
        </div>
      </form>

      <Card title="Send a test email" description="Uses the saved settings. Save your changes first.">
        <form onSubmit={test} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField label="Send to" name="to" type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} className="sm:w-80" />
          <Button type="submit" variant="secondary" icon={MailCheck} loading={testing}>
            Send test email
          </Button>
        </form>
        {testResult && (
          <Banner
            tone={testResult.sent ? (testResult.mailer === 'log' || testResult.mailer === 'array' ? 'warning' : 'success') : 'danger'}
            title={
              !testResult.sent
                ? 'The test email could not be sent'
                : testResult.mailer === 'log' || testResult.mailer === 'array'
                  ? 'Written to the server log, not delivered'
                  : `Test email sent to ${testTo}. Check the inbox (and the spam folder).`
            }
            className="mt-3"
          >
            {testResult.error}
          </Banner>
        )}
      </Card>
    </div>
  )
}
