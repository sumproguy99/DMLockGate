import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { cx } from '../../lib/cx'

export type MenuItem = {
  label: string
  onSelect: () => void
  icon?: LucideIcon
  /** Red text, for actions such as "Revoke". */
  danger?: boolean
  disabled?: boolean
}

type MenuProps = {
  /** The trigger's text, or its accessible name when iconOnly. */
  label: string
  items: ReadonlyArray<MenuItem>
  /** Show only this icon on the trigger. */
  icon?: LucideIcon
  iconOnly?: boolean
  align?: 'start' | 'end'
}

/**
 * A dropdown menu of actions (WAI-ARIA menu button). Arrow keys move through the items, Escape and
 * Tab close it, and focus returns to the trigger.
 */
export function Menu({ label, items, icon: Icon, iconOnly = false, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0)

  useEffect(() => {
    if (!open) {
      return
    }
    itemRefs.current.find((el) => el && !el.disabled)?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) {
      triggerRef.current?.focus()
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = enabled.indexOf(itemRefs.current.findIndex((el) => el === document.activeElement))
    const target = {
      ArrowDown: enabled[(current + 1) % enabled.length],
      ArrowUp: enabled[(current - 1 + enabled.length) % enabled.length],
      Home: enabled[0],
      End: enabled[enabled.length - 1],
    }[event.key]
    if (target !== undefined) {
      event.preventDefault()
      itemRefs.current[target]?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className={cx(
          'inline-flex min-h-11 items-center justify-center gap-2 rounded-md font-semibold transition-colors',
          iconOnly ? 'size-11 text-text-muted hover:bg-elevated hover:text-text' : 'border border-border-strong bg-panel-2 px-4 text-support hover:bg-elevated',
        )}
      >
        {Icon && <Icon className={iconOnly ? 'size-5' : 'size-4'} aria-hidden />}
        {!iconOnly && label}
        {!iconOnly && <ChevronDown className="size-4 text-text-muted" aria-hidden />}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cx(
            'absolute z-40 mt-1 min-w-48 rounded-md border border-border bg-elevated p-1 shadow-raised',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, i) => {
            const ItemIcon = item.icon
            return (
              <button
                key={item.label}
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                aria-disabled={item.disabled || undefined}
                onClick={() => {
                  close(true)
                  item.onSelect()
                }}
                className={cx(
                  'flex min-h-10 w-full items-center gap-2 rounded-sm px-3 text-left text-support transition-colors',
                  'hover:bg-panel-2 focus-visible:bg-panel-2 disabled:cursor-not-allowed disabled:text-disabled',
                  item.danger ? 'text-danger-text' : 'text-text',
                )}
              >
                {ItemIcon && <ItemIcon className="size-4 shrink-0" aria-hidden />}
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
