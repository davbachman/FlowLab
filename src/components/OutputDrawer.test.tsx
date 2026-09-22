import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OutputDrawer } from './OutputDrawer'

const defaults = { runId: 1, lines: [] as string[], viewportHeight: 1000 }

describe('output drawer', () => {
  it('opens for the first output, then respects collapse and counts unseen messages including errors', () => {
    const { rerender } = render(<OutputDrawer {...defaults} />)
    expect(screen.getByRole('button', { name: 'Expand output' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('log')).not.toBeInTheDocument()
    rerender(<OutputDrawer {...defaults} lines={['first']} />)
    expect(screen.getByRole('log')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse output' }))
    rerender(<OutputDrawer {...defaults} lines={['first', 'second']} error="Division by zero" />)
    expect(screen.getByRole('button', { name: 'Expand output' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('status')).toHaveTextContent('2 new')
    fireEvent.click(screen.getByRole('button', { name: 'Expand output' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('log')).toHaveTextContent('second')
    expect(screen.getByRole('alert')).toHaveTextContent('Division by zero')
  })

  it('opens again for a new run even when its output is identical', () => {
    const { rerender } = render(<OutputDrawer {...defaults} lines={['same']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse output' }))
    rerender(<OutputDrawer {...defaults} runId={2} lines={['same']} />)
    expect(screen.getByRole('log')).toBeVisible()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('opens for an error before any output and clears it when execution resets', () => {
    const { rerender } = render(<OutputDrawer {...defaults} error="Unknown variable" />)
    expect(screen.getByRole('alert')).toBeVisible()
    rerender(<OutputDrawer {...defaults} runId={null} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('log')).toHaveTextContent('No output yet')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse output' }))
    rerender(<OutputDrawer {...defaults} runId={2} />)
    expect(screen.queryByRole('log')).not.toBeInTheDocument()
    rerender(<OutputDrawer {...defaults} runId={2} lines={['new run']} />)
    expect(screen.getByRole('log')).toBeVisible()
  })

  it('resizes with the keyboard, enforces viewport limits, and remembers height after collapsing', () => {
    const { rerender } = render(<OutputDrawer {...defaults} lines={['text']} />)
    const drawer = screen.getByRole('region', { name: 'Output' })
    const resize = screen.getByRole('separator', { name: 'Resize output drawer' })
    expect(drawer).toHaveStyle({ height: '180px' })
    fireEvent.keyDown(resize, { key: 'ArrowUp' })
    expect(drawer).toHaveStyle({ height: '200px' })
    fireEvent.click(screen.getByRole('button', { name: 'Collapse output' }))
    expect(drawer).toHaveStyle({ height: '36px' })
    fireEvent.click(screen.getByRole('button', { name: 'Expand output' }))
    expect(drawer).toHaveStyle({ height: '200px' })
    const reopenedResize = screen.getByRole('separator')
    fireEvent.keyDown(reopenedResize, { key: 'Home' })
    fireEvent.keyDown(reopenedResize, { key: 'ArrowDown' })
    expect(drawer).toHaveStyle({ height: '96px' })
    fireEvent.keyDown(reopenedResize, { key: 'End' })
    expect(drawer).toHaveStyle({ height: '425px' })
    rerender(<OutputDrawer {...defaults} lines={['text']} viewportHeight={390} />)
    expect(drawer).toHaveStyle({ height: '120px' })
  })

  it('follows new output only while the reader is at the bottom', () => {
    const { rerender } = render(<OutputDrawer {...defaults} lines={['first']} />)
    const log = screen.getByRole('log')
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 100 })
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 500 })
    rerender(<OutputDrawer {...defaults} lines={['first', 'second']} />)
    expect(log.scrollTop).toBe(500)
    log.scrollTop = 100
    fireEvent.scroll(log)
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 600 })
    rerender(<OutputDrawer {...defaults} lines={['first', 'second', 'third']} />)
    expect(log.scrollTop).toBe(100)
    log.scrollTop = 500
    fireEvent.scroll(log)
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 700 })
    rerender(<OutputDrawer {...defaults} lines={['first', 'second', 'third', 'fourth']} />)
    expect(log.scrollTop).toBe(700)
  })
})
