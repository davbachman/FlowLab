import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { sampleProgram } from './lib/sampleProgram'
import type { BranchLabel, Program, ProgramNode } from './lib/types'

function makeProgram(
  nodes: [string, ProgramNode['type'], string][],
  edges: [string, string, BranchLabel?][],
): Program {
  return {
    version: 1,
    nodes: nodes.map(([id, type, text], index) => ({ id, type, text, position: { x: 100, y: index * 120 } })),
    edges: edges.map(([source, target, label]) => ({ id: `${source}-${target}`, source, target, label })),
  }
}

function executionButton(name: string): HTMLElement {
  return within(screen.getByLabelText('Runtime sidebar')).getByRole('button', { name })
}

function output(): HTMLElement {
  return screen.getByRole('region', { name: 'Output' })
}

function steps(): number {
  const label = within(screen.getByLabelText('Runtime sidebar')).getByText('Steps', { exact: true })
  return Number(label.parentElement?.querySelector('dd')?.textContent)
}

async function loadProgram(program: Program): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'File' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Load' }))
  fireEvent.change(screen.getByLabelText('Import', { exact: true }), {
    target: { files: [new File([JSON.stringify(program)], 'debugger.json', { type: 'application/json' })] },
  })
  await waitFor(() => expect(screen.getByLabelText('Current document')).toHaveTextContent('debugger'))
  await waitFor(() => expect(executionButton('Run')).toBeEnabled())
}

function toggleBreakpoint(nodeId: string): void {
  fireEvent.click(within(screen.getByTestId(`flow-node-${nodeId}`)).getByLabelText(/Add breakpoint/))
}

const countingProgram = makeProgram([
  ['main', 'function', 'main'], ['init', 'assignment', 'n <- 0'],
  ['condition', 'while', 'True'], ['count', 'assignment', 'n <- n + 1'],
  ['end', 'return', 'n'],
], [
  ['main', 'init'], ['init', 'condition'], ['condition', 'count', 'true'],
  ['count', 'condition'], ['condition', 'end', 'false'],
])

describe('debugger controls and feedback', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1440)
    vi.stubGlobal('innerHeight', 1000)
  })

  afterEach(() => {
    localStorage.clear()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('continues the current execution and restarts at main with cleared output', async () => {
    render(<App />)
    await loadProgram(makeProgram([
      ['main', 'function', 'main'], ['first', 'output', '"first"'],
      ['second', 'output', '"second"'], ['end', 'return', '0'],
    ], [['main', 'first'], ['first', 'second'], ['second', 'end']]))
    fireEvent.click(executionButton('Step'))
    fireEvent.click(executionButton('Step'))
    expect(output()).toHaveTextContent('first')
    fireEvent.click(executionButton('Continue'))
    await screen.findByText('Completed', { exact: true })
    expect(within(output()).getAllByText('first', { exact: true })).toHaveLength(1)
    expect(within(output()).getAllByText('second', { exact: true })).toHaveLength(1)

    fireEvent.click(executionButton('Restart'))
    expect(steps()).toBe(0)
    expect(output()).toHaveTextContent('No output yet')
    expect(screen.getByTestId('flow-node-main')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Ready', { exact: true })).toBeInTheDocument()
    fireEvent.click(executionButton('Run'))
    await screen.findByText('Completed', { exact: true })
    expect(within(output()).getAllByText('first', { exact: true })).toHaveLength(1)
  })

  it.each(['Run', 'Auto Step'])('honors a starting breakpoint after Restart with %s and continues from it', async (action) => {
    render(<App />)
    await loadProgram(makeProgram([
      ['main', 'function', 'main'], ['output', 'output', '"done"'], ['end', 'return', '0'],
    ], [['main', 'output'], ['output', 'end']]))
    toggleBreakpoint('main')
    fireEvent.click(executionButton('Restart'))
    expect(executionButton('Run')).toBeEnabled()

    vi.useFakeTimers()
    fireEvent.click(executionButton(action))
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(steps()).toBe(0)
    expect(screen.getByText('Breakpoint', { exact: true })).toBeInTheDocument()
    expect(output()).toHaveTextContent('No output yet')

    fireEvent.click(executionButton('Continue'))
    await act(async () => { vi.runOnlyPendingTimers() })
    expect(screen.getByText('Completed', { exact: true })).toBeInTheDocument()
    expect(within(output()).getAllByText('done', { exact: true })).toHaveLength(1)
    expect(executionButton('Run')).toBeEnabled()
  })

  it('stops an unfinished run and cancels future chunks when code is edited', async () => {
    render(<App />)
    await loadProgram(countingProgram)
    vi.useFakeTimers()
    fireEvent.click(executionButton('Run'))
    expect(steps()).toBeGreaterThan(0)
    expect(steps()).toBeLessThan(1000000)
    fireEvent.click(executionButton('Stop'))
    const stoppedSteps = steps()
    await act(async () => { vi.advanceTimersByTime(200) })
    expect(steps()).toBe(stoppedSteps)
    expect(screen.getByText('Stopped', { exact: true })).toBeInTheDocument()
    fireEvent.click(executionButton('Continue'))
    expect(steps()).toBeGreaterThan(stoppedSteps)
    fireEvent.change(screen.getByDisplayValue('n <- n + 1'), { target: { value: 'n <- n + 2' } })
    await act(async () => { vi.advanceTimersByTime(200) })
    expect(steps()).toBe(0)
    expect(executionButton('Run')).toBeEnabled()
    expect(screen.queryByText('Maximum step count', { exact: false })).not.toBeInTheDocument()
  })

  it('resumes a breakpoint once and shows branch and variable feedback while stepping', async () => {
    render(<App />)
    await loadProgram({ ...sampleProgram, inputQueue: '3' })
    toggleBreakpoint('while-n')
    fireEvent.click(executionButton('Run'))
    expect(screen.getByText('Breakpoint', { exact: true })).toBeInTheDocument()
    expect(screen.getByTestId('flow-node-while-n')).toHaveAttribute('aria-current', 'step')
    const before = steps()
    fireEvent.click(executionButton('Continue'))
    expect(steps()).toBe(before + 2)
    expect(screen.getByText('Breakpoint', { exact: true })).toBeInTheDocument()
    fireEvent.click(executionButton('Step'))
    expect(screen.getByLabelText('Last branch')).toHaveTextContent('n > 0 → True')
    expect(screen.getByTestId('flow-node-add-n')).toHaveAttribute('aria-current', 'step')
    fireEvent.click(executionButton('Step'))
    const variables = screen.getByRole('region', { name: 'Variables' })
    expect(within(variables).getByText('n', { exact: true }).closest('.variable-row')).toHaveClass('variable-row-changed')
    expect(within(variables).getByText('total', { exact: true }).closest('.variable-row')).toHaveClass('variable-row-changed')
  })

  it('honors a starting breakpoint in Auto Step and skips it once when resumed', async () => {
    render(<App />)
    await loadProgram({ ...sampleProgram, inputQueue: '3' })
    toggleBreakpoint('main')
    vi.useFakeTimers()
    fireEvent.click(executionButton('Auto Step'))
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(steps()).toBe(0)
    expect(screen.getByText('Breakpoint', { exact: true })).toBeInTheDocument()
    fireEvent.click(executionButton('Auto Step'))
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(steps()).toBe(1)
    expect(screen.getByText('Running', { exact: true })).toBeInTheDocument()
    fireEvent.click(executionButton('Pause'))
  })

  it('shows nested calls and steps over recursive calls back to the caller', async () => {
    const source = makeProgram([
      ['main', 'function', 'main'], ['calculate', 'assignment', 'result <- factorial(4)'],
      ['output', 'output', 'result'], ['end', 'return', 'result'],
      ['factorial', 'function', 'factorial'], ['input', 'input', 'n'],
      ['condition', 'if', 'n < 2'], ['base', 'return', '1'],
      ['recursive', 'return', 'n * factorial(n - 1)'],
    ], [
      ['main', 'calculate'], ['calculate', 'output'], ['output', 'end'], ['factorial', 'input'],
      ['input', 'condition'], ['condition', 'base', 'true'], ['condition', 'recursive', 'false'],
    ])
    render(<App />)
    await loadProgram(source)
    fireEvent.click(executionButton('Step'))
    fireEvent.click(executionButton('Step'))
    const stack = screen.getByRole('navigation', { name: 'Call stack' })
    expect(stack).toHaveTextContent('main')
    expect(stack).toHaveTextContent('factorial')
    fireEvent.click(executionButton('Restart'))
    fireEvent.click(executionButton('Step'))
    fireEvent.click(executionButton('Run Block'))
    await screen.findByText('Block complete', { exact: true })
    expect(screen.getByTestId('flow-node-output')).toHaveAttribute('aria-current', 'step')
    expect(output()).toHaveTextContent('No output yet')
    const variable = within(screen.getByRole('region', { name: 'Variables' })).getByText('result', { exact: true }).closest('.variable-row')
    expect(variable).toHaveClass('variable-row-changed')
    expect(variable).toHaveTextContent('24')
    expect(screen.getByRole('navigation', { name: 'Call stack' })).not.toHaveTextContent('factorial')
  })

  it('preserves Run Block through an input dialog and pauses before output', async () => {
    render(<App />)
    await loadProgram(makeProgram([
      ['main', 'function', 'main'], ['ask', 'assignment', 'answer <- ask()'],
      ['output', 'output', 'answer'], ['end', 'return', 'answer'],
    ], [['main', 'ask'], ['ask', 'output'], ['output', 'end']]))
    fireEvent.click(executionButton('Step'))
    fireEvent.click(executionButton('Run Block'))
    const dialog = await screen.findByRole('dialog', { name: 'Input requested' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Input' }), { target: { value: '42' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit' }))
    await screen.findByText('Block complete', { exact: true })
    expect(output()).toHaveTextContent('No output yet')
    expect(screen.getByTestId('flow-node-output')).toHaveAttribute('aria-current', 'step')
    fireEvent.click(executionButton('Continue'))
    await screen.findByText('Completed', { exact: true })
    expect(output()).toHaveTextContent('42')
  })

  it('preserves Run Block through a native text load and resumes with Continue', async () => {
    let finishFetch: ((value: unknown) => void) | undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { finishFetch = resolve })))
    render(<App />)
    await loadProgram({
      ...makeProgram([
        ['main', 'function', 'main'], ['load', 'assignment', 'text <- text_from_url("https://example.com/data")'],
        ['output', 'output', 'text'], ['end', 'return', '0'],
      ], [['main', 'load'], ['load', 'output'], ['output', 'end']]),
      imports: 'text',
    })
    fireEvent.click(executionButton('Step'))
    fireEvent.click(executionButton('Run Block'))
    await screen.findByText('Loading', { exact: true })
    await act(async () => {
      finishFetch?.({ ok: true, status: 200, text: async () => 'Loaded text' })
    })
    await screen.findByText('Block complete', { exact: true })
    expect(output()).toHaveTextContent('No output yet')
    fireEvent.click(executionButton('Continue'))
    await screen.findByText('Completed', { exact: true })
    expect(output()).toHaveTextContent('Loaded text')
  })
})
