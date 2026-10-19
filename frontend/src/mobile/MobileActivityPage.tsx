import { Activity, Lock, LockOpen, ShieldAlert } from 'lucide-react'
import { useCallback, useState } from 'react'
import { fetchActivity, type ActivityFeedItem, type ActivityOutcome, type ActivityType } from '../api/activity'
import { ActivityEntry } from '../components/status/ActivityEntry'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/Spinner'
import type { Tone } from '../components/ui/tones'
import { cx } from '../lib/cx'
import { describeCommandStatus, describeLockState } from '../lib/lockguard'
import { useLoaded } from '../lib/useLoaded'

const types: Array<{ value: ActivityType; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'requests', label: 'Requests' },
  { value: 'reports', label: 'Lock reports' },
]

const outcomes: Array<{ value: ActivityOutcome | ''; label: string }> = [
  { value: '', label: 'Any result' },
  { value: 'success', label: 'Succeeded' },
  { value: 'failure', label: 'Failed or unknown' },
  { value: 'denied', label: 'Denied' },
  { value: 'pending', label: 'In progress' },
]

/** How one feed item reads: requests by their real stage, reports by the state the lock reported. */
function describeFeedItem(item: ActivityFeedItem): { tone: Tone; title: string; icon?: typeof Lock } {
  if (item.request) {
    const { tone, label } = describeCommandStatus(item.request.status, item.request.integration_responded)
    return {
      tone,
      title: `${item.request.action === 'lock' ? 'Lock' : 'Unlock'} request: ${label}`,
      icon: item.request.action === 'lock' ? Lock : LockOpen,
    }
  }
  const state = item.report?.state ?? 'unknown'
  const { tone, label } = describeLockState(state, 'current')

  return { tone, title: `${label}`, icon: state === 'jammed' ? ShieldAlert : state === 'locked' ? Lock : LockOpen }
}

/**
 * Mobile Activity (project.md 34.8 D): lock requests and lock reports on your locks, newest first,
 * filtered by type and result. Other people appear only as "Another user".
 */
export function MobileActivityPage() {
  const [type, setType] = useState<ActivityType>('all')
  const [outcome, setOutcome] = useState<ActivityOutcome | ''>('')
  const [older, setOlder] = useState<{ items: ActivityFeedItem[]; nextBefore: string | null; loading: boolean; failed: boolean }>({
    items: [],
    nextBefore: null,
    loading: false,
    failed: false,
  })

  const load = useCallback(
    (signal: AbortSignal) => fetchActivity({ type, outcome: outcome || undefined }, signal),
    [type, outcome],
  )
  const first = useLoaded(load, `${type}|${outcome}`)
  const items = [...(first.data?.items ?? []), ...older.items]
  const nextBefore = older.items.length > 0 ? older.nextBefore : (first.data?.nextBefore ?? null)

  function changeFilters(next: { type?: ActivityType; outcome?: ActivityOutcome | '' }) {
    setOlder({ items: [], nextBefore: null, loading: false, failed: false })
    if (next.type !== undefined) setType(next.type)
    if (next.outcome !== undefined) setOutcome(next.outcome)
  }

  async function loadMore() {
    if (!nextBefore) return
    setOlder((s) => ({ ...s, loading: true, failed: false }))
    try {
      const page = await fetchActivity({ type, outcome: outcome || undefined, before: nextBefore })
      setOlder((s) => ({ items: [...s.items, ...page.items], nextBefore: page.nextBefore, loading: false, failed: false }))
    } catch {
      setOlder((s) => ({ ...s, loading: false, failed: true }))
    }
  }

  return (
    <>
      <PageHeader title="Activity" description="Requests and lock reports on your locks, newest first." />

      <div className="mb-4 flex flex-col gap-3">
        <div role="group" aria-label="Show" className="flex gap-2 overflow-x-auto">
          {types.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={type === t.value}
              onClick={() => changeFilters({ type: t.value })}
              className={cx(
                'min-h-11 shrink-0 rounded-full border px-4 text-label font-semibold',
                type === t.value ? 'border-primary bg-primary/15 text-primary-text' : 'border-border-strong bg-panel text-text-muted',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-label text-text-muted">
          Result
          <select
            value={outcome}
            onChange={(e) => changeFilters({ outcome: e.target.value as ActivityOutcome | '' })}
            className="min-h-11 rounded-md border border-border-strong bg-panel px-3 text-support text-text"
          >
            {outcomes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {first.loading && !first.data ? (
        <LoadingState label="Loading activity…" />
      ) : first.error && !first.data ? (
        <Banner
          tone="danger"
          title="Activity could not be loaded"
          action={
            <Button variant="secondary" size="sm" onClick={first.reload}>
              Try again
            </Button>
          }
        >
          {first.error instanceof Error ? first.error.message : 'Something went wrong.'}
        </Banner>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Nothing to show"
          description="No activity matches these filters yet."
          className="rounded-lg border border-border bg-panel"
        />
      ) : (
        <div className={cx('rounded-lg border border-border bg-panel px-4', first.loading && 'opacity-60')} aria-busy={first.loading}>
          <ol className="divide-y divide-border">
            {items.map((item) => {
              const { tone, title, icon } = describeFeedItem(item)
              const detail = [item.lock?.name, item.request?.status_message].filter(Boolean).join(' · ')
              return <ActivityEntry key={item.id} tone={tone} title={title} actor={item.actor} detail={detail || null} at={item.occurred_at} icon={icon} />
            })}
          </ol>
        </div>
      )}

      {nextBefore && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <Button variant="secondary" fullWidth onClick={loadMore} loading={older.loading}>
            Load older activity
          </Button>
          {older.failed && <p className="text-caption text-danger-text">Older activity could not be loaded. Try again.</p>}
        </div>
      )}
    </>
  )
}
