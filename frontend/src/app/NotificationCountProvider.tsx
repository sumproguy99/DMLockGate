import type { ReactNode } from 'react'
import { fetchUnreadCount } from '../api/notifications'
import { usePolled } from '../lib/usePolled'
import { NOTIFICATION_COUNT_INTERVAL_MS, NotificationCountContext } from './notification-count-context'

export function NotificationCountProvider({ children }: { children: ReactNode }) {
  const count = usePolled(fetchUnreadCount, NOTIFICATION_COUNT_INTERVAL_MS)

  return <NotificationCountContext value={count}>{children}</NotificationCountContext>
}
