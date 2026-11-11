import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'
import { NotificationPreferencesForm } from '../components/notifications/NotificationPreferencesForm'
import { PageHeader } from '../components/ui/PageHeader'

/**
 * Desktop notification preferences: what LockGuard tells this person, in the app and by email.
 */
export function NotificationPreferencesPage() {
  return (
    <>
      <Link to="/notifications" className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 px-2 text-label font-semibold text-primary-text">
        <ChevronLeft className="size-4" aria-hidden />
        Notifications
      </Link>
      <PageHeader title="Notification preferences" description="Choose how LockGuard tells you about each kind of alert." />
      <div className="max-w-3xl">
        <NotificationPreferencesForm />
      </div>
    </>
  )
}
