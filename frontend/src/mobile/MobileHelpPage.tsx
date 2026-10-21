import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '../components/ui/PageHeader'

const topics: Array<{ title: string; steps: string[] }> = [
  {
    title: 'The lock shows "Device unavailable"',
    steps: [
      'The lock is not reporting to LockGuard. Check that it has battery and that its Wi-Fi is working.',
      'If the Eufy app cannot reach it either, the problem is the lock or its Wi-Fi, not LockGuard.',
      'Its last reported state may be out of date, so check the door itself.',
    ],
  },
  {
    title: 'The header says the Eufy connection is degraded or offline',
    steps: [
      'LockGuard cannot reach the Eufy service reliably. Lock state may be old and commands may not reach the lock.',
      'Use the Eufy app or the keypad at the door for now, and tell your LockGuard administrator.',
    ],
  },
  {
    title: 'The state says "unknown" or "stale"',
    steps: [
      'The lock has not reported recently, so LockGuard cannot say whether the door is locked.',
      'Tap Refresh at the bottom of Home. If it stays that way, check the door in person.',
    ],
  },
  {
    title: 'A command says "Outcome unknown"',
    steps: [
      'LockGuard sent the command but the lock did not confirm it. The door may or may not have moved.',
      'Check the door, or wait a minute for the lock to report, before trying again. LockGuard never repeats a command by itself.',
    ],
  },
  {
    title: 'A command says "Failed" or "could not be delivered"',
    steps: [
      'Nothing reached the lock, so the door did not move.',
      'Check the Eufy connection at the top of the screen, then try once more. If it keeps failing, tell your administrator.',
    ],
  },
  {
    title: 'A request was denied',
    steps: [
      'Your access does not allow that action on this lock right now, for example outside your allowed hours.',
      'Ask your LockGuard administrator if you think you should have access.',
    ],
  },
  {
    title: 'Location or proximity is unavailable',
    steps: [
      'LockGuard records where your phone is when you lock or unlock, and shares it when an administrator asks while the app is open. Your browser has to allow location for that.',
      'If location is blocked, allow it for this site in your browser settings. Locking and unlocking work either way.',
      'Unlocking automatically as you arrive does not exist yet. Every unlock is one you ask for.',
    ],
  },
  {
    title: 'You were signed out',
    steps: [
      'Sessions end after a period without use, or when you or an administrator signs you out everywhere.',
      'Sign in again. If you did not expect it, change your password and check Account security.',
    ],
  },
]

/** Mobile Help and troubleshooting (project.md 34.8 I): common problems and what to do about them. */
export function MobileHelpPage() {
  return (
    <>
      <Link to="/m/more" className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 px-2 text-label font-semibold text-primary-text">
        <ChevronLeft className="size-4" aria-hidden />
        More
      </Link>
      <PageHeader title="Help and troubleshooting" />
      <div className="flex flex-col gap-3">
        {topics.map((topic) => (
          <details key={topic.title} className="group rounded-lg border border-border bg-panel">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 text-support font-semibold">{topic.title}</summary>
            <ul className="flex list-disc flex-col gap-2 px-4 pb-4 pl-8 text-support text-text-muted">
              {topic.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </details>
        ))}
        <p className="mt-2 text-caption text-text-muted">
          Forgot your password or lost your authenticator? Ask your LockGuard administrator.
        </p>
      </div>
    </>
  )
}
