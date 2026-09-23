import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { resolveFlowLabImports } from './lib/imports'
import type { Program } from './lib/types'

const library: Program = {
  version: 1,
  nodes: [
    { id: 'library-main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    { id: 'library-main-end', type: 'return', text: '0', position: { x: 0, y: 100 } },
    { id: 'helper', type: 'function', text: 'helper', position: { x: 300, y: 0 } },
    { id: 'helper-return', type: 'return', text: '42', position: { x: 300, y: 100 } },
  ],
  edges: [
    { id: 'library-main-edge', source: 'library-main', target: 'library-main-end' },
    { id: 'helper-edge', source: 'helper', target: 'helper-return' },
  ],
}
const consumer: Program = {
  version: 1,
  imports: 'math',
  inputQueue: '7',
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 100, y: 0 } },
    { id: 'output', type: 'output', text: 'helper()', position: { x: 100, y: 150 } },
    { id: 'end', type: 'return', text: '0', position: { x: 100, y: 300 } },
  ],
  edges: [{ id: 'e1', source: 'main', target: 'output' }, { id: 'e2', source: 'output', target: 'end' }],
}

function selectLibrary(program = library, name = 'helpers.json'): void {
  fireEvent.change(screen.getByLabelText('Library file'), {
    target: { files: [new File([JSON.stringify(program)], name, { type: 'application/json' })] },
  })
}

async function loadConsumer(program = consumer): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'File' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Load' }))
  fireEvent.change(screen.getByLabelText('Import', { exact: true }), {
    target: { files: [new File([JSON.stringify(program)], 'consumer.json', { type: 'application/json' })] },
  })
  await waitFor(() => expect(screen.getByLabelText('Current document')).toHaveTextContent('consumer'))
}

function runButton(): HTMLElement {
  return within(screen.getByLabelText('Runtime sidebar')).getByRole('button', { name: 'Run' })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('adding a local library file', () => {
  it('opens a file picker and adds a usable library without replacing the program or input queue', async () => {
    render(<App />)
    await loadConsumer()
    const fileInput = screen.getByLabelText('Library file')
    const click = vi.spyOn(fileInput, 'click')
    fireEvent.click(screen.getByRole('button', { name: 'Add library…' }))
    expect(click).toHaveBeenCalledOnce()
    selectLibrary()
    await waitFor(() => expect(runButton()).toBeEnabled())
    expect(screen.getByLabelText('Current document')).toHaveTextContent('consumer')
    expect(screen.getAllByTestId(/^flow-node-/)).toHaveLength(3)
    expect(screen.getByTestId('flow-node-main')).toBeInTheDocument()
    expect(screen.queryByTestId('flow-node-library-main')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Input queue')).toHaveValue('7')
    expect(screen.getByLabelText('Imports list')).toHaveValue('math\nhelpers')
    expect(fileInput).toHaveValue('')
    fireEvent.click(runButton())
    expect(screen.getByRole('log')).toHaveTextContent('42')
    expect((await resolveFlowLabImports('helpers')).files[0].program).toEqual(library)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Undo' }))
    expect(screen.getByLabelText('Imports list')).toHaveValue('math')
    expect(screen.getAllByTestId(/^flow-node-/)).toHaveLength(3)
  })

  it('resolves an already-listed missing library and refreshes the same file without duplicating its name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    render(<App />)
    await loadConsumer({ ...consumer, imports: 'math\nhelpers.json' })
    await screen.findAllByText(/Use Add library/)
    selectLibrary()
    await waitFor(() => expect(runButton()).toBeEnabled())
    fireEvent.click(runButton())
    expect(screen.getByRole('log')).toHaveTextContent('42')
    selectLibrary({ ...library, nodes: library.nodes.map(node => node.id === 'helper-return' ? { ...node, text: '99' } : node) })
    await waitFor(() => expect(screen.getByRole('region', { name: 'Output' })).toHaveTextContent('No output yet'))
    await waitFor(() => expect(runButton()).toBeEnabled())
    expect(screen.getByLabelText('Imports list')).toHaveValue('math\nhelpers.json')
    fireEvent.click(runButton())
    expect(screen.getByRole('log')).toHaveTextContent('99')
  })

  it('keeps the current library and completed output when a replacement file is invalid', async () => {
    render(<App />)
    await loadConsumer()
    selectLibrary()
    await waitFor(() => expect(runButton()).toBeEnabled())
    fireEvent.click(runButton())
    fireEvent.change(screen.getByLabelText('Library file'), {
      target: { files: [new File(['{ invalid'], 'helpers.json', { type: 'application/json' })] },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add helpers.json')
    expect(screen.getByLabelText('Imports list')).toHaveValue('math\nhelpers')
    expect(screen.getByRole('log')).toHaveTextContent('42')
    expect(runButton()).toBeEnabled()
    expect((await resolveFlowLabImports('helpers')).files[0].program).toEqual(library)
  })

  it('uses a selected file even if browser storage cannot save a copy', async () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage full') })
    render(<App />)
    await loadConsumer()
    selectLibrary()
    await waitFor(() => expect(runButton()).toBeEnabled())
    fireEvent.click(runButton())
    expect(screen.getByRole('log')).toHaveTextContent('42')
  })

  it('does not add a slow-reading file to a different document', async () => {
    render(<App />)
    await loadConsumer()
    let finishRead!: (source: string) => void
    const file = new File([], 'helpers.json')
    vi.spyOn(file, 'text').mockImplementation(() => new Promise(resolve => { finishRead = resolve }))
    fireEvent.change(screen.getByLabelText('Library file'), { target: { files: [file] } })
    expect(screen.getByRole('button', { name: 'Add library…' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Examples' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Basic' }))
    await act(async () => finishRead(JSON.stringify(library)))
    expect(screen.getByLabelText('Imports list')).toHaveValue('math')
    expect(screen.getByRole('button', { name: 'Add library…' })).toBeEnabled()
    expect(screen.queryByText('Added helpers.json.')).not.toBeInTheDocument()
  })
})
