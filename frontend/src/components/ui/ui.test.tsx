import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Lock, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { Banner } from './Banner'
import { Button, IconButton } from './Button'
import { Card, Metric } from './Card'
import { DataTable } from './DataTable'
import { EmptyState } from './EmptyState'
import { CheckboxField, SearchField, SelectField, TextField } from './Form'
import { Menu } from './Menu'
import { Pagination } from './Pagination'
import { LoadingState } from './Spinner'
import { StatusBadge } from './StatusBadge'
import { Tabs } from './Tabs'
import { Tooltip } from './Tooltip'

describe('Button', () => {
  it('is a non-submitting button by default and runs its handler', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick} icon={Lock}>Lock</Button>)

    const button = screen.getByRole('button', { name: 'Lock' })
    expect(button).toHaveAttribute('type', 'button')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('while loading keeps its label, is busy, and cannot be pressed again', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick} loading>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('names an icon button with its label', async () => {
    const { container } = render(<IconButton icon={RefreshCw} label="Refresh locks" />)

    expect(screen.getByRole('button', { name: 'Refresh locks' })).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })
})

describe('StatusBadge, Banner, Card, EmptyState, LoadingState', () => {
  it('always shows the status as text', () => {
    render(<StatusBadge tone="warning" label="Degraded" />)

    expect(screen.getByText('Degraded')).toBeVisible()
  })

  it('announces danger banners as alerts and others as status', () => {
    render(
      <>
        <Banner tone="danger" title="Bridge unreachable" />
        <Banner tone="warning" title="Cloud degraded" />
        <Banner tone="info" title="Loaded with the page" live="none" />
      </>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Bridge unreachable')
    expect(screen.getByRole('status')).toHaveTextContent('Cloud degraded')
  })

  it('lets a banner be dismissed', async () => {
    const onDismiss = vi.fn()
    render(<Banner tone="info" title="Heads up" onDismiss={onDismiss} />)

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('renders cards with a heading at the requested level', async () => {
    const { container } = render(
      <main>
        <h1>Page</h1>
        <Card title="Locks" description="Two registered" actions={<Button size="sm">Add</Button>}>
          <Metric label="Online" value={2} />
        </Card>
        <Card title="Nested" headingLevel={3}>
          <EmptyState title="No alerts" description="Nothing needs attention." />
          <LoadingState label="Loading activity…" />
        </Card>
      </main>,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Locks' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Nested' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading activity…')
    await expectNoAxeViolations(container)
  })
})

describe('form fields', () => {
  it('label the control and read the hint and error with it', async () => {
    const { container } = render(
      <form>
        <TextField label="Display name" hint="Shown in the activity log." error="Enter a name." required />
        <SelectField
          label="Role"
          placeholder="Choose a role"
          options={[
            { value: 'admin', label: 'Administrator' },
            { value: 'member', label: 'Member' },
          ]}
        />
        <CheckboxField label="Send me alerts" hint="By email." />
        <SearchField label="Search users" placeholder="Search" />
      </form>,
    )

    const name = screen.getByRole('textbox', { name: /Display name/ })
    expect(name).toBeRequired()
    expect(name).toBeInvalid()
    expect(name).toHaveAccessibleDescription('Shown in the activity log. Enter a name.')
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: 'Send me alerts' })).toHaveAccessibleDescription('By email.')
    expect(screen.getByRole('searchbox', { name: 'Search users' })).toBeInTheDocument()
    expect(screen.getByRole('search')).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('is not marked invalid without an error', () => {
    render(<TextField label="Email" type="email" />)

    expect(screen.getByRole('textbox', { name: 'Email' })).not.toHaveAttribute('aria-invalid')
  })
})

describe('DataTable', () => {
  const columns = [
    { key: 'name', header: 'Lock', cell: (row: { id: number; name: string }) => row.name },
    { key: 'id', header: 'ID', cell: (row: { id: number; name: string }) => row.id, align: 'right' as const },
  ]

  it('renders a captioned table with column headers', async () => {
    const { container } = render(
      <DataTable caption="Locks" columns={columns} rows={[{ id: 1, name: 'Front Door' }]} rowKey={(r) => r.id} />,
    )

    const table = screen.getByRole('table', { name: 'Locks' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Lock', 'ID'])
    expect(within(table).getByRole('cell', { name: 'Front Door' })).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('shows the empty state and the loading state in place of rows', () => {
    const { rerender } = render(
      <DataTable caption="Locks" columns={columns} rows={[]} rowKey={(r) => r.id} empty={<EmptyState title="No locks yet" />} />,
    )
    expect(screen.getByText('No locks yet')).toBeInTheDocument()

    rerender(<DataTable caption="Locks" columns={columns} rows={[]} rowKey={(r) => r.id} loading />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
  })
})

describe('Tabs', () => {
  const tabs = [
    { id: 'overview', label: 'Overview', content: <p>Overview panel</p> },
    { id: 'activity', label: 'Activity', content: <p>Activity panel</p> },
    { id: 'settings', label: 'Settings', content: <p>Settings panel</p> },
  ]

  it('shows the selected panel and moves with the arrow, Home and End keys', async () => {
    const { container } = render(<Tabs label="Lock detail" tabs={tabs} />)
    const user = userEvent.setup()

    expect(screen.getByRole('tabpanel', { name: 'Overview' })).toHaveTextContent('Overview panel')
    await user.click(screen.getByRole('tab', { name: 'Overview' }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Activity' })).toHaveTextContent('Activity panel')
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveFocus()
    await expectNoAxeViolations(container)
  })

  it('keeps only the selected tab in the tab order', () => {
    render(<Tabs label="Lock detail" tabs={tabs} defaultValue="activity" />)

    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([-1, 0, -1])
  })
})

describe('Pagination', () => {
  function Paged() {
    const [page, setPage] = useState(1)
    return <Pagination page={page} pageCount={3} onPageChange={setPage} />
  }

  it('moves between pages and disables the ends', async () => {
    const { container } = render(<Paged />)

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('Page 2 of 3')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await expectNoAxeViolations(container)
  })

  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} onPageChange={() => {}} />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('Tooltip', () => {
  it('describes its trigger, shows on focus and hides on Escape', async () => {
    render(
      <Tooltip content="Re-reads every lock from Eufy">
        <Button>Sync</Button>
      </Tooltip>,
    )
    const button = screen.getByRole('button', { name: 'Sync' })
    expect(button).toHaveAccessibleDescription('Re-reads every lock from Eufy')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await userEvent.tab()
    expect(screen.getByRole('tooltip')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})

describe('Menu', () => {
  it('opens from the keyboard, skips disabled items, runs the choice and returns focus', async () => {
    const edit = vi.fn()
    const revoke = vi.fn()
    const { container } = render(
      <Menu
        label="Actions for Front Door"
        icon={Pencil}
        iconOnly
        items={[
          { label: 'Rename', onSelect: edit, icon: Pencil },
          { label: 'Disable commands', onSelect: vi.fn(), disabled: true },
          { label: 'Remove', onSelect: revoke, icon: Trash2, danger: true },
        ]}
      />,
    )
    const user = userEvent.setup()
    const trigger = screen.getByRole('button', { name: 'Actions for Front Door' })

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus()
    await expectNoAxeViolations(container)

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(revoke).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes on Escape and on a click outside', async () => {
    render(
      <>
        <Menu label="More" items={[{ label: 'Rename', onSelect: vi.fn() }]} />
        <p>Outside</p>
      </>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByText('Outside'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
