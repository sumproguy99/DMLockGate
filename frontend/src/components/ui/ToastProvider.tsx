import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { IconButton } from './Button'
import { ToastContext, type ToastInput } from './toast-context'
import { toneIcon, toneText } from './tones'

/** How long a non-critical toast stays up. Failures stay until dismissed. */
export const TOAST_DURATION_MS = 6000

type Toast = ToastInput & { id: number }

/**
 * Short confirmations of something the user just did. Failures go to an assertive live region and
 * stay until dismissed; everything else is announced politely and leaves after a few seconds.
 * Toasts never carry the only copy of important state: the page shows it too.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++
      setToasts((current) => [...current, { ...toast, id }])
      if (toast.tone !== 'danger') {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), TOAST_DURATION_MS),
        )
      }
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const region = (assertive: boolean) => (
    <div
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      className="flex flex-col gap-2"
    >
      {toasts
        .filter((t) => (t.tone === 'danger') === assertive)
        .map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
    </div>
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-60 flex flex-col gap-2 sm:left-auto sm:w-96">
        {region(true)}
        {region(false)}
      </div>
    </ToastContext.Provider>
  )
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = toneIcon[toast.tone]

  return (
    <div className="pointer-events-auto flex gap-3 rounded-md border border-border bg-elevated px-4 py-3 shadow-raised">
      <Icon className={cx('mt-0.5 size-5 shrink-0', toneText[toast.tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-support font-semibold">{toast.title}</p>
        {toast.message && <p className="mt-0.5 text-support text-text-muted">{toast.message}</p>}
      </div>
      <IconButton icon={X} label="Dismiss notification" size="sm" onClick={onDismiss} className="-my-1 -mr-2" />
    </div>
  )
}
