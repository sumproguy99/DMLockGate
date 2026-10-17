import { useCallback, useEffect, useRef, useState } from 'react'

export type Loaded<T> = {
  /** The latest result. While a new key loads, the previous result stays, so tables do not flash empty. */
  data: T | null
  error: unknown
  /** True while the result for the current key (or a reload) is still on its way. */
  loading: boolean
  reload: () => void
}

/**
 * Loads data for a key (for example a user id, or a filter string) and loads again whenever the key
 * changes or reload() is called. Superseded loads are cancelled.
 */
export function useLoaded<T>(load: (signal: AbortSignal) => Promise<T>, key: string): Loaded<T> {
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<{ for: string | null; data: T | null; error: unknown }>({ for: null, data: null, error: null })
  const loadRef = useRef(load)
  const target = `${key}#${nonce}`

  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    const controller = new AbortController()
    loadRef.current(controller.signal).then(
      (data) => !controller.signal.aborted && setState({ for: target, data, error: null }),
      (error: unknown) => !controller.signal.aborted && setState((s) => ({ for: target, data: s.data, error })),
    )
    return () => controller.abort()
  }, [target])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data: state.data, error: state.error, loading: state.for !== target, reload }
}
