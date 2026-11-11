import { Save } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { getNotificationPreferences, saveNotificationPreferences, type NotificationPreferences } from '../../api/notifications'
import { useLoaded } from '../../lib/useLoaded'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { CheckboxField } from '../ui/Form'
import { LoadingState } from '../ui/Spinner'
import { useToast } from '../ui/toast-context'

const SEVERITY_WORDS: Record<NotificationPreferences['email_min_severity'], string> = {
  low: 'Low and above',
  medium: 'Medium and above',
  high: 'High and Critical',
  critical: 'Critical',
}

type Choices = Record<string, { in_app: boolean; email: boolean }>

/**
 * The signed-in person's notification preferences: for each category, in LockGuard and by email.
 * Shared by the desktop and phone pages. Categories an administrator requires stay on in the app.
 */
export function NotificationPreferencesForm() {
  const preferences = useLoaded(getNotificationPreferences, 'notification-preferences')

  if (preferences.data) {
    return <PreferencesForm key={JSON.stringify(preferences.data.categories)} preferences={preferences.data} onSaved={preferences.reload} />
  }
  if (preferences.error != null) {
    return (
      <Banner tone="danger" title="Your notification preferences could not be loaded" action={<Button variant="secondary" size="sm" onClick={preferences.reload}>Try again</Button>}>
        {preferences.error instanceof ApiError ? preferences.error.message : null}
      </Banner>
    )
  }
  return <LoadingState label="Loading your notification preferences…" />
}

function PreferencesForm({ preferences, onSaved }: { preferences: NotificationPreferences; onSaved: () => void }) {
  const toast = useToast()
  const [choices, setChoices] = useState<Choices>(() =>
    Object.fromEntries(preferences.categories.map((c) => [c.category, { in_app: c.in_app, email: c.email }])),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (category: string, channel: 'in_app' | 'email', value: boolean) =>
    setChoices((current) => ({ ...current, [category]: { ...current[category], [channel]: value } }))

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await saveNotificationPreferences(choices)
      toast({ tone: 'success', title: 'Notification preferences saved' })
      onSaved()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      {error && <Banner tone="danger" title="Could not save">{error}</Banner>}

      {preferences.email_enabled ? (
        <p className="text-support text-text-muted">
          Emails go to <span className="font-semibold text-text">{preferences.email}</span>. Only alerts of{' '}
          {SEVERITY_WORDS[preferences.email_min_severity].toLowerCase()} severity are emailed; the rest appear in LockGuard only.
        </p>
      ) : (
        <Banner tone="info" title="Alert emails are turned off" live="none">
          An administrator has turned off alert emails for everyone, so your email choices take effect only when they are turned back on.
        </Banner>
      )}

      {preferences.handles_incidents && (
        <Banner tone="info" title="You handle security incidents" live="none">
          You always see security alerts in LockGuard, and High and Critical ones are always emailed to you, whatever you choose here.
        </Banner>
      )}

      <ul className="flex flex-col gap-3">
        {preferences.categories.map((category) => {
          const choice = choices[category.category]
          return (
            <li key={category.category} className="rounded-lg border border-border bg-panel p-4">
              <fieldset>
                <legend className="text-support font-semibold">{category.label}</legend>
                <p className="mb-2 text-support text-text-muted">{category.description}</p>
                <div className="flex flex-col gap-x-8 sm:flex-row sm:flex-wrap">
                  <CheckboxField
                    label="In LockGuard"
                    checked={category.in_app_required || choice.in_app}
                    disabled={category.in_app_required}
                    hint={category.in_app_required ? 'Required by your administrator.' : undefined}
                    onChange={(event) => set(category.category, 'in_app', event.target.checked)}
                  />
                  <CheckboxField
                    label="By email"
                    checked={choice.email}
                    disabled={!preferences.email_enabled}
                    onChange={(event) => set(category.category, 'email', event.target.checked)}
                  />
                </div>
              </fieldset>
            </li>
          )
        })}
      </ul>

      <div>
        <Button type="submit" icon={Save} loading={busy}>
          Save preferences
        </Button>
      </div>
    </form>
  )
}
