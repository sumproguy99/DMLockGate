import { useEffect, useRef, useState } from 'react'
import { fetchLocationRequest, type LocationRequestRecord } from '../../api/location'

/** How often to check on a location request while waiting for the phone. Mutable so tests can shorten it. */
export const locationRequestTiming = { pollMs: 3000 }

/** Follows one location request until the phone answers or it expires. */
export function useLocationRequestWatch(onArrived: () => void) {
  const [watched, setWatched] = useState<LocationRequestRecord | null>(null)
  const onArrivedRef = useRef(onArrived)

  useEffect(() => {
    onArrivedRef.current = onArrived
  }, [onArrived])

  useEffect(() => {
    if (watched?.status !== 'pending') {
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetchLocationRequest(watched.id, controller.signal).then(
        (latest) => {
          setWatched(latest)
          if (latest.status === 'fulfilled') {
            onArrivedRef.current()
          }
        },
        // A failed check keeps the request on screen; the next one tries again.
        () => !controller.signal.aborted && setWatched((current) => (current ? { ...current } : current)),
      )
    }, locationRequestTiming.pollMs)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [watched])

  return { watched, watch: setWatched, clear: () => setWatched(null) }
}
