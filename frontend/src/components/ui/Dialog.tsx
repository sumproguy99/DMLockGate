import { X } from 'lucide-react'
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../../lib/cx'
import { IconButton } from './Button'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
}

type DialogProps = {
  open: boolean
  /** Called on Escape, the close button and a click on the backdrop. Ignore it to keep the dialog open. */
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** Buttons along the bottom edge. */
  footer?: ReactNode
  /** "alertdialog" for confirmations that interrupt the user's work. */
  role?: 'dialog' | 'alertdialog'
  /** The element focused on open. Defaults to the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Hides the close button, for dialogs that must be answered through the footer. */
  hideCloseButton?: boolean
  /** "left" slides in as a full-height drawer from the left edge, for navigation. */
  placement?: 'center' | 'left'
  className?: string
}

/**
 * A modal dialog. Focus moves into it on open, Tab stays inside it, Escape closes it, and focus
 * returns to whatever opened it. The page behind is hidden from screen readers and does not scroll.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  role = 'dialog',
  initialFocusRef,
  hideCloseButton = false,
  placement = 'center',
  className,
}: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !panelRef.current) {
      return
    }
    const panel = panelRef.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ;(initialFocusRef?.current ?? focusableIn(panel)[0] ?? panel).focus()

    const portal = panel.closest('[data-dialog-root]')
    const siblings = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== portal && !el.inert,
    )
    siblings.forEach((el) => (el.inert = true))
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      siblings.forEach((el) => (el.inert = false))
      document.body.style.overflow = overflow
      opener?.focus()
    }
  }, [open, initialFocusRef])

  if (!open) {
    return null
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) {
      return
    }
    const items = focusableIn(panelRef.current)
    if (items.length === 0) {
      event.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      data-dialog-root=""
      className={cx(
        'fixed inset-0 z-50 flex bg-bg/80 backdrop-blur-sm',
        placement === 'left' ? 'items-stretch justify-start' : 'items-end justify-center p-4 sm:items-center',
      )}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cx(
          'flex flex-col border-border bg-panel-2 shadow-raised',
          placement === 'left'
            ? 'h-full w-full max-w-xs border-r'
            : 'max-h-[calc(100dvh-2rem)] w-full max-w-md rounded-lg border',
          className,
        )}
      >
        <header className="flex items-start gap-3 px-5 pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-section">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-support text-text-muted">
                {description}
              </p>
            )}
          </div>
          {!hideCloseButton && (
            <IconButton icon={X} label="Close" size="sm" onClick={() => onClose()} className="-mt-1 -mr-2" />
          )}
        </header>
        {children && <div className="overflow-y-auto px-5 pt-4">{children}</div>}
        {footer && (
          <footer className="flex flex-col-reverse gap-2 px-5 pt-5 pb-5 sm:flex-row sm:justify-end">{footer}</footer>
        )}
        {!footer && <div className="pb-5" />}
      </div>
    </div>,
    document.body,
  )
}
