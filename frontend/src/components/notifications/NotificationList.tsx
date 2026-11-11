import { Check, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import type { AppNotification } from '../../api/notifications'
import { cx } from '../../lib/cx'
import { categoryLabel, severityBadge } from '../../lib/security'
import { Timestamp } from '../status/Timestamp'
import { Button } from '../ui/Button'
import { StatusBadge } from '../ui/StatusBadge'

/** Whether the notification was also emailed, in words. */
const EMAIL_WORDS: Record<NonNullable<AppNotification['email_status']>, string> = {
  queued: 'Email on its way',
  retrying: 'Email being retried',
  sent: 'Emailed',
  failed: 'Email failed',
  skipped: 'Not emailed',
}

type NotificationListProps = {
  notifications: readonly AppNotification[]
  /** Where each notification's links go, if anywhere. */
  links: (notification: AppNotification) => { to: string; label: string }[]
  onMarkRead: (notification: AppNotification) => void
  /** The notification being marked read, to show its button busy. */
  marking?: string | null
}

/**
 * Stored notifications with read status (project.md 34.8 G): severity, time, description, and
 * whether it has been read, in words as well as by the marker.
 */
export function NotificationList({ notifications, links, onMarkRead, marking }: NotificationListProps) {
  return (
    <ul className="flex flex-col gap-3">
      {notifications.map((notification) => {
        const unread = notification.read_at === null
        const severity = severityBadge[notification.severity] ?? severityBadge.info

        return (
          <li
            key={notification.id}
            className={cx('rounded-lg border bg-panel p-4', unread ? 'border-primary/60 border-l-4' : 'border-border')}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <StatusBadge tone={severity.tone} label={severity.label} />
              <span className="text-caption text-text-muted">{categoryLabel[notification.category] ?? 'Notice'}</span>
              <Timestamp iso={notification.created_at} className="text-caption text-text-muted" />
              <span className={cx('text-caption font-semibold', unread ? 'text-primary-text' : 'text-text-muted')}>{unread ? 'Unread' : 'Read'}</span>
              {notification.email_status && <span className="text-caption text-text-muted">{EMAIL_WORDS[notification.email_status]}</span>}
            </div>
            <p className={cx('text-support', unread ? 'font-semibold' : 'font-medium')}>{notification.title}</p>
            {notification.description && <p className="text-support text-text-muted">{notification.description}</p>}
            {notification.mandatory && (
              <p className="mt-1 text-caption text-text-muted">Sent to everyone who handles security incidents. This cannot be turned off.</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              {links(notification).map((link) => (
                <Link key={link.to} to={link.to} className="inline-flex min-h-11 items-center gap-1 text-label font-semibold text-primary-text">
                  {link.label}
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              ))}
              {unread && (
                <Button variant="ghost" size="sm" icon={Check} loading={marking === notification.id} onClick={() => onMarkRead(notification)}>
                  Mark read
                  <span className="sr-only">: {notification.title}</span>
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
