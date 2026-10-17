import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { Dialog } from './Dialog'
import { useToast } from './toast-context'
import { TOAST_DURATION_MS, ToastProvider } from './ToastProvider'

function DialogHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Edit lock</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit lock"
        description="Change how this lock appears."
        footer={<Button onClick={() => setOpen(false)}>Save</Button>}
      >
        <input aria-label="Name" />
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('moves focus in, keeps Tab inside, hides the page behind, and returns focus on Escape', async () => {
    render(<DialogHarness />)
    const user = userEvent.setup()
    const opener = screen.getByRole('button', { name: 'Edit lock' })

    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Edit lock' })
    expect(dialog).toHaveAccessibleDescription('Change how this lock appears.')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    await expectNoAxeViolations(dialog)

    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('marks everything outside the dialog inert while open', async () => {
    render(<DialogHarness />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit lock' }))
    const outside = Array.from(document.body.children).filter((el) => !el.hasAttribute('data-dialog-root'))
    expect(outside.length).toBeGreaterThan(0)
    expect(outside.every((el) => (el as HTMLElement).inert)).toBe(true)

    await userEvent.keyboard('{Escape}')
    expect(outside.some((el) => (el as HTMLElement).inert)).toBe(false)
  })
})

describe('ConfirmDialog', () => {
  const base = {
    open: true,
    title: 'Revoke access?',
    consequence: 'Sam will no longer be able to lock or unlock Front Door.',
    confirmLabel: 'Revoke access',
    tone: 'danger' as const,
  }

  it('explains the consequence, starts on Cancel, and confirms only on purpose', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog {...base} onConfirm={onConfirm} onCancel={onCancel} />)
    const user = userEvent.setup()

    const dialog = screen.getByRole('alertdialog', { name: 'Revoke access?' })
    expect(dialog).toHaveAccessibleDescription(base.consequence)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    await expectNoAxeViolations(dialog)

    await user.keyboard('{Enter}')
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Revoke access' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('requires the exact phrase when one is set', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog {...base} confirmPhrase="REVOKE" onConfirm={onConfirm} onCancel={vi.fn()} />)
    const user = userEvent.setup()

    const confirm = screen.getByRole('button', { name: 'Revoke access' })
    const phrase = screen.getByRole('textbox', { name: 'Type REVOKE to confirm' })
    expect(phrase).toHaveFocus()
    expect(confirm).toBeDisabled()

    await user.type(phrase, 'revoke{Enter}')
    expect(onConfirm).not.toHaveBeenCalled()
    await user.clear(phrase)
    await user.type(phrase, 'REVOKE{Enter}')
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('cannot be dismissed while busy and shows a failure inside the dialog', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog {...base} busy error="The server did not respond." onConfirm={vi.fn()} onCancel={onCancel} />)

    await userEvent.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Revoke access' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('The server did not respond.')
  })
})

function ToastButtons() {
  const toast = useToast()
  return (
    <>
      <Button onClick={() => toast({ tone: 'success', title: 'Role saved' })}>Save</Button>
      <Button onClick={() => toast({ tone: 'danger', title: 'Could not save', message: 'Try again.' })}>Fail</Button>
    </>
  )
}

describe('toasts', () => {
  it('announces successes politely and lets them expire', async () => {
    vi.useFakeTimers()
    try {
      render(
        <ToastProvider>
          <ToastButtons />
        </ToastProvider>,
      )

      act(() => screen.getByRole('button', { name: 'Save' }).click())
      expect(screen.getByRole('status')).toHaveTextContent('Role saved')
      act(() => vi.advanceTimersByTime(TOAST_DURATION_MS))
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    } finally {
      vi.useRealTimers()
    }
  })

  it('announces failures assertively and keeps them until dismissed', async () => {
    const { container } = render(
      <ToastProvider>
        <ToastButtons />
      </ToastProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Fail' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not saveTry again.')
    await expectNoAxeViolations(container)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  })

  it('needs a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ToastButtons />)).toThrow('useToast must be used inside a ToastProvider.')
  })
})
