import { useState } from 'react'
import { ApiError } from '../../api/client'
import { listNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from '../../api/notifications'
import { useUnreadNotifications } from '../../app/notification-count-context'
import { useLoaded } from '../../lib/useLoaded'
import { useToast } from '../ui/toast-context'

/**
 * A page of the user's notifications with the read actions, keeping the bell's count in step.
 */
export function useNotifications(unreadOnly: boolean, page: number) {
  const toast = useToast()
  const count = useUnreadNotifications()
  const list = useLoaded((signal) => listNotifications({ unread: unreadOnly, page }, signal), `${unreadOnly}|${page}`)
  const [marking, setMarking] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  function failed(error: unknown) {
    toast({ tone: 'danger', title: 'Could not mark as read', message: error instanceof ApiError ? error.message : 'Something went wrong.' })
  }

  async function markRead(notification: AppNotification) {
    setMarking(notification.id)
    try {
      await markNotificationRead(notification.id)
      list.reload()
      count.refresh()
    } catch (error) {
      failed(error)
    } finally {
      setMarking(null)
    }
  }

  async function markAllRead() {
    setMarkingAll(true)
    try {
      await markAllNotificationsRead()
      list.reload()
      count.refresh()
    } catch (error) {
      failed(error)
    } finally {
      setMarkingAll(false)
    }
  }

  return { list, marking, markingAll, markRead, markAllRead, unreadCount: list.data?.meta.unread_count ?? count.data ?? 0 }
}
