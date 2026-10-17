import { useCallback, useEffect, useRef, useState } from 'react'

export type Polled<T> = {
  /** The last successful result. Kept when a later refresh fails, so the screen can say it is stale. */
  data: T | null
  /** Why the most recent load failed, or null when it succeeded. */
  error: unknown
  /** True only until the first load finishes. */
  loading: boolean
  /** True while a refresh the user asked for is running (timed reloads stay quiet). */
  refreshing: boolean
  /** When data was last loaded successfully (ISO). */
  loadedAt: string | null
  refresh: () => void
}

/**
 * Loads data now, then again every intervalMs while the tab is visible, and as soon as the tab
 * becomes visible again. A load in flight is cancelled when a newer one starts or on unmount.
 */
export function usePolled<T>(load: (signal: AbortSignal) => Promise<T>, intervalMs: number): Polled<T> {
  const [state, setState] = useState<Omit<Polled<T>, 'refresh'>>({
    data: null,
    error: null,
    loading: true,
    refreshing: true,
    loadedAt: null,
  })
  const loadRef = useRef(load)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    loadRef.current = load
  }, [load])

  /** Starts a load. State changes only when it settles, so this is safe to call from an effect. */
  const run = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    loadRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setState({ data, error: null, loading: false, refreshing: false, loadedAt: new Date().toISOString() })
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState((s) => ({ ...s, error, loading: false, refreshing: false }))
        }
      },
    )
  }, [])

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, refreshing: true }))
    run()
  }, [run])

  useEffect(() => {
    run()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        run()
      }
    }, intervalMs)
    const onVisible = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      controllerRef.current?.abort()
    }
  }, [run, intervalMs])

  return { ...state, refresh }
}
