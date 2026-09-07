import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

describe('compact workspace', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
  })

  it('starts on Canvas and preserves execution while switching to Console and back', async () => {
    const user = userEvent.setup()
    render(<App />)
    const tabs = within(screen.getByRole('navigation', { name: 'Workspace view' }))
    expect(tabs.getByRole('button', { name: 'Canvas' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Node palette')).not.toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Examples' }))
    await user.click(screen.getByRole('menuitem', { name: 'Basic' }))
    const canvas = within(screen.getByRole('region', { name: 'Visual editor' }))
    await user.click(canvas.getByRole('button', { name: 'Step' }))
    await user.click(canvas.getByRole('button', { name: 'Step' }))
    await user.click(tabs.getByRole('button', { name: 'Console' }))
    expect(screen.getByLabelText('Runtime sidebar')).toBeVisible()
    expect(within(screen.getByRole('region', { name: 'Variables' })).getByText('n')).toBeVisible()
    await user.click(tabs.getByRole('button', { name: 'Canvas' }))
    expect(screen.getByText('Paused · 2 steps')).toBeVisible()
    expect(screen.getByTestId('flow-node-init-total')).toHaveAttribute('data-current', 'true')
    expect(canvas.getByRole('button', { name: 'Continue' })).toBeEnabled()
    await user.click(canvas.getByRole('button', { name: 'Restart' }))
    expect(canvas.getByRole('button', { name: 'Run' })).toBeEnabled()
    expect(screen.getByText('Ready · 0 steps')).toBeVisible()
    await user.click(canvas.getByRole('button', { name: 'Run Block' }))
    expect(screen.getByTestId('flow-node-input-n')).toHaveAttribute('data-current', 'true')
    expect(canvas.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it('returns to Canvas after choosing a block and can collapse populated Imports', async () => {
    const user = userEvent.setup()
    render(<App />)
    const tabs = within(screen.getByRole('navigation', { name: 'Workspace view' }))
    await user.click(tabs.getByRole('button', { name: /Blocks/ }))
    const palette = within(screen.getByLabelText('Node palette'))
    await user.click(palette.getByRole('button', { name: 'Imports' }))
    fireEvent.change(palette.getByLabelText('Imports list'), { target: { value: 'turtle' } })
    await user.click(palette.getByRole('button', { name: 'Imports' }))
    expect(palette.getByLabelText('Imports list')).not.toBeVisible()
    await user.click(palette.getByRole('button', { name: 'Process' }))
    expect(tabs.getByRole('button', { name: 'Canvas' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: 'Visual editor' })).toHaveAttribute('data-node-placement-active', 'true')
  })
})
