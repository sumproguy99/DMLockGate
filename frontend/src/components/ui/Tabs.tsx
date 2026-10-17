import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../../lib/cx'

export type TabItem = {
  id: string
  label: string
  content: ReactNode
}

type TabsProps = {
  /** Names the tab list for screen readers. */
  label: string
  tabs: ReadonlyArray<TabItem>
  /** Controlled selection. Leave out to let Tabs manage it. */
  value?: string
  defaultValue?: string
  onChange?: (id: string) => void
  className?: string
}

/** WAI-ARIA tabs: arrow keys move between tabs, Home and End jump to the ends. */
export function Tabs({ label, tabs, value, defaultValue, onChange, className }: TabsProps) {
  const baseId = useId()
  const [internal, setInternal] = useState(defaultValue ?? tabs[0]?.id)
  const selected = value ?? internal
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())

  function select(id: string) {
    if (value === undefined) {
      setInternal(id)
    }
    onChange?.(id)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === selected)
    const next = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key]
    if (next === undefined) {
      return
    }
    event.preventDefault()
    const id = tabs[next].id
    select(id)
    tabRefs.current.get(id)?.focus()
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
        {tabs.map((tab) => {
          const isSelected = tab.id === selected
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) {
                  tabRefs.current.set(tab.id, el)
                } else {
                  tabRefs.current.delete(tab.id)
                }
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => select(tab.id)}
              className={cx(
                '-mb-px min-h-11 border-b-2 px-4 text-support font-medium whitespace-nowrap transition-colors',
                isSelected ? 'border-primary text-text' : 'border-transparent text-text-muted hover:text-text',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== selected}
          tabIndex={0}
          className="pt-4"
        >
          {tab.id === selected && tab.content}
        </div>
      ))}
    </div>
  )
}
