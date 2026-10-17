import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ComponentGallery from './ComponentGallery'
import { ToastProvider } from '../components/ui/ToastProvider'
import { expectNoAxeViolations } from '../test/axe'

function renderGallery() {
  return render(
    <ToastProvider>
      <ComponentGallery />
    </ToastProvider>,
  )
}

describe('component gallery', () => {
  it('says it is a preview with example values', () => {
    renderGallery()

    expect(screen.getByText('Development component gallery')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('DM LockGuard components')
  })

  it('has no automatically detectable accessibility violations', async () => {
    const { container } = renderGallery()

    await expectNoAxeViolations(container)
  })

  it('validates the example form', async () => {
    renderGallery()

    await userEvent.click(screen.getByRole('button', { name: 'Save example' }))
    expect(screen.getByRole('textbox', { name: /Display name/ })).toHaveAccessibleDescription(
      'Submit it empty to see validation. Enter a display name.',
    )

    await userEvent.type(screen.getByRole('textbox', { name: /Display name/ }), 'Sam')
    await userEvent.click(screen.getByRole('button', { name: 'Save example' }))
    expect(await screen.findByText('Example saved')).toBeInTheDocument()
  })
})
