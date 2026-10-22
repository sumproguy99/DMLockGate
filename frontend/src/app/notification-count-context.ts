import { createContext, useContext } from 'react'
import type { Polled } from '../lib/usePolled'

/** How often the shells ask how many notifications are unread. */
export const NOTIFICATION_COUNT_INTERVAL_MS = 30_000

export const NotificationCountContext = createContext<Polled<number> | null>(null)

/**
 * The signed-in user's unread notification count, shared by the bell and the notification pages so
 * marking something read updates the bell at once (call refresh()).
 */
export function useUnreadNotifications(): Polled<number> {
  const count = useContext(NotificationCountContext)
  if (!count) {
    throw new Error('useUnreadNotifications must be used inside NotificationCountProvider')
  }
  return count
}
