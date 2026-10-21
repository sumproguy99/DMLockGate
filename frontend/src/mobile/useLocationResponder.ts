import { useEffect } from 'react'
import { answerLocationRequest, fetchPendingLocationRequests } from '../api/location'
import { currentPosition, PositionUnavailable } from '../lib/geolocation'

/** How often an open, visible app checks for location requests. Mutable so tests can shorten it. */
export const responderTiming = { intervalMs: 10_000 }

/**
 * Answers administrators' location requests while the mobile app is open and visible, without
 * interrupting the person: they agreed to this at sign-in, and Location and proximity lists every
 * time it happened. A phone whose browser refuses location answers that it cannot, and nothing works
 * around the refusal. A closed or hidden app cannot answer; the request then expires on the server.
 */
export function useLocationResponder() {
  useEffect(() => {
    let timer: number | undefined
    let running = false
    let stopped = false
    const answered = new Set<string>()

    const check = async () => {
      if (running || stopped || document.visibilityState !== 'visible') {
        return
      }
      running = true
      try {
        for (const { id } of await fetchPendingLocationRequests()) {
          if (answered.has(id) || stopped) {
            continue
          }
          answered.add(id)
          try {
            await answerLocationRequest(id, await currentPosition())
          } catch (error) {
            if (error instanceof PositionUnavailable) {
              await answerLocationRequest(id, { unavailable: error.reason }).catch(() => {})
            }
          }
        }
      } catch {
        // Offline or signed out: the next check tries again.
      } finally {
        running = false
      }
    }

    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void check().finally(schedule)
      }, responderTiming.intervalMs)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void check()
      }
    }

    void check()
    schedule()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
