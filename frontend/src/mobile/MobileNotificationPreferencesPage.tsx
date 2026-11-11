import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'
import { NotificationPreferencesForm } from '../components/notifications/NotificationPreferencesForm'
import { PageHeader } from '../components/ui/PageHeader'

/**
 * Mobile notification preferences: the same choices as on a computer.
 */
export function MobileNotificationPreferencesPage() {
  return (
    <>
      <Link to="/m/notifications" className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 px-2 text-label font-semibold text-primary-text">
        <ChevronLeft className="size-4" aria-hidden />
        Notifications
      </Link>
      <PageHeader title="Notification preferences" description="How LockGuard tells you about each kind of alert." />
      <NotificationPreferencesForm />
    </>
  )
}
