import { History } from 'lucide-react'
import { useState } from 'react'
import { getSecurityHistory, type SecurityEvent } from '../../api/users'
import { ActivityEntry } from '../../components/status/ActivityEntry'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { LoadingState } from '../../components/ui/Spinner'
import { describeActivity } from '../../lib/activity'
import { useLoaded } from '../../lib/useLoaded'

/** Sign-ins, two-step changes and administrative changes to or by this user, newest first. */
export function UserHistoryTab({ userId }: { userId: number }) {
  const first = useLoaded((signal) => getSecurityHistory(userId, null, signal), String(userId))
  const [more, setMore] = useState<{ events: SecurityEvent[]; cursor: string | null } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)

  if (first.error != null && !first.data) {
    return (
      <Banner
        tone="danger"
        title="Security history could not be loaded"
        action={
          <Button variant="secondary" size="sm" onClick={first.reload}>
            Try again
          </Button>
        }
      >
        {first.error instanceof Error ? first.error.message : 'Something went wrong.'}
      </Banner>
    )
  }
  if (!first.data) {
    return <LoadingState label="Loading security history…" />
  }

  const events = [...first.data.data, ...(more?.events ?? [])]
  const cursor = more ? more.cursor : first.data.next_cursor

  async function loadMore() {
    setLoadingMore(true)
    setMoreError(null)
    try {
      const page = await getSecurityHistory(userId, cursor)
      setMore({ events: [...(more?.events ?? []), ...page.data], cursor: page.next_cursor })
    } catch (error) {
      setMoreError(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <Card title="Security history" description="From the audit log. Times are when LockGuard recorded the event.">
      {events.length === 0 ? (
        <EmptyState icon={History} title="Nothing recorded yet" />
      ) : (
        <ul className="divide-y divide-border">
          {events.map((event) => {
            const { tone, title } = describeActivity({
              id: event.event_id,
              kind: 'audit',
              occurred_at: event.occurred_at,
              action: event.action,
              outcome: event.outcome,
              actor: event.actor?.name ?? null,
              lock: null,
              detail: null,
            })
            const detail = [event.reason, event.ip_address && `from ${event.ip_address}`].filter(Boolean).join(' · ')
            return (
              <ActivityEntry
                key={event.event_id}
                tone={tone}
                title={title}
                actor={event.actor?.name}
                detail={detail || undefined}
                at={event.occurred_at}
              />
            )
          })}
        </ul>
      )}
      {moreError && (
        <Banner tone="danger" title="Could not load more" className="mt-3">
          {moreError}
        </Banner>
      )}
      {cursor && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={loadMore} loading={loadingMore}>
          Load older events
        </Button>
      )}
    </Card>
  )
}
