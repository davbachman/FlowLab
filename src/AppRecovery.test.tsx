import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { documentFingerprint, readRecoveryDraft, writeRecoveryDraft } from './lib/drafts'
import { objectSampleProgram } from './lib/objectSampleProgram'
import type { Program } from './lib/types'

const unfinishedProgram: Program = {
  version: 1,
  nodes: [{ id: 'unfinished-condition', type: 'while', text: 'n >', position: { x: 200, y: 100 } }],
  edges: [],
  inputQueue: '3\n4',
}

interface TestSaveWindow extends Window {
  showSaveFilePicker?: () => Promise<{
    name: string
    createWritable: () => Promise<{
      write: (blob: Blob) => Promise<void>
      close: () => Promise<void>
    }>
  }>
}

function toolbarAction(menu: string, name: string): void {
  fireEvent.click(screen.getByRole('button', { name: menu }))
  fireEvent.click(within(screen.getByRole('menu', { name: menu })).getByRole('menuitem', { name }))
}

function fileAction(name: string): void {
  toolbarAction('File', name)
}

function loadFile(contents: string, name = 'unfinished.json'): void {
  fileAction('Load')
  fireEvent.change(screen.getByLabelText(/^Import$/), {
    target: { files: [new File([contents], name, { type: 'application/json' })] },
  })
}

function currentDraftId(): string {
  const id = new URL(window.location.href).searchParams.get('draft')
  if (!id) throw new Error('Missing recovery document id.')
  return id
}

describe('document recovery and editable drafts', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/FlowLab/')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
  })

  afterEach(() => {
    cleanup()
    delete (window as TestSaveWindow).showSaveFilePicker
    localStorage.clear()
    window.history.replaceState({}, '', '/FlowLab/')
    vi.restoreAllMocks()
  })

  it('saves notes with the document, recovers them, and clears them when loading a file without notes', async () => {
    const write = vi.fn<(blob: Blob) => Promise<void>>().mockResolvedValue(undefined)
    const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    ;(window as TestSaveWindow).showSaveFilePicker = async () => ({
      name: 'notes.json', createWritable: async () => ({ write, close }),
    })
    render(<App />)
    const buildPanel = screen.getByRole('tabpanel', { name: 'Build' })
    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))
    expect(screen.getByRole('tabpanel', { name: 'Notes' })).toBeVisible()
    expect(buildPanel).not.toBeVisible()
    fireEvent.change(screen.getByLabelText('Document notes'), { target: { value: 'Try recursion.\nCheck the base case.' } })
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Unsaved changes')
    await screen.findByText('Recovery saved')
    cleanup()
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))
    expect(screen.getByLabelText('Document notes')).toHaveValue('Try recursion.\nCheck the base case.')
    fileAction('Save')
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    const saved = JSON.parse(await write.mock.calls[0][0].text()) as Program
    expect(saved.notes).toBe('Try recursion.\nCheck the base case.')
    loadFile(JSON.stringify(unfinishedProgram))
    await screen.findByDisplayValue('n >')
    expect(screen.getByLabelText('Document notes')).toHaveValue('')
    toolbarAction('Edit', 'Undo')
    expect(screen.getByLabelText('Document notes')).toHaveValue(saved.notes)
    loadFile(JSON.stringify(saved), 'notes.json')
    await waitFor(() => expect(screen.getByLabelText('Current document')).toHaveTextContent('notes'))
    expect(screen.getByLabelText('Document notes')).toHaveValue(saved.notes)
  })

  it('loads a file with invalid expressions and lets its error select and focus the block', async () => {
    render(<App />)
    loadFile(JSON.stringify(unfinishedProgram))

    const field = await screen.findByDisplayValue('n >')
    expect(screen.getByLabelText('Current document')).toHaveTextContent('unfinished')
    expect(screen.getByLabelText('Input queue')).toHaveValue('3\n4')
    const error = within(screen.getByLabelText('Graph validation')).getByRole('button', {
      name: /Add an expression after ">"/,
    })
    fireEvent.click(error)
    await waitFor(() => expect(field).toHaveFocus())
    expect(field.closest('.react-flow__node')).toHaveClass('selected')
  })

  it.each(['{broken', '{"version":1,"nodes":[null],"edges":[]}'])(
    'rejects malformed file contents while retaining the existing draft: %s', async (contents) => {
    render(<App />)
    loadFile(JSON.stringify(unfinishedProgram))
    await screen.findByDisplayValue('n >')

    loadFile(contents, 'broken.json')
    await screen.findByText(/Import failed:/)
    expect(screen.getByDisplayValue('n >')).toBeInTheDocument()
    expect(screen.getByLabelText('Current document')).toHaveTextContent('unfinished')
    },
  )

  it('recovers edits and their saved-file state when the document is reopened', async () => {
    const first = render(<App />)
    loadFile(JSON.stringify(unfinishedProgram))
    const field = await screen.findByDisplayValue('n >')
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Saved to file')

    fireEvent.change(field, { target: { value: 'n > 0' } })
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Unsaved changes')
    await screen.findByText('Recovery saved')
    const id = currentDraftId()
    const stored = readRecoveryDraft(localStorage, id)
    expect(stored.ok && stored.value?.program.nodes[0].text).toBe('n > 0')
    expect(stored.ok && stored.value?.savedFingerprint).toBe(documentFingerprint(unfinishedProgram, 'unfinished'))

    first.unmount()
    render(<App />)
    expect(screen.getByDisplayValue('n > 0')).toBeInTheDocument()
    expect(screen.getByLabelText('Current document')).toHaveTextContent('unfinished')
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Unsaved changes')
    expect(currentDraftId()).toBe(id)
  })

  it('opens File New at a unique blank document address and preserves the old draft', async () => {
    const first = render(<App />)
    loadFile(JSON.stringify(unfinishedProgram))
    await screen.findByDisplayValue('n >')
    const originalId = currentDraftId()
    const newWindow = { opener: window }
    const open = vi.spyOn(window, 'open').mockReturnValue(newWindow as unknown as Window)

    fileAction('New')
    expect(open).toHaveBeenCalledTimes(1)
    const newUrl = new URL(String(open.mock.calls[0][0]))
    expect(newUrl.searchParams.get('draft')).toBeTruthy()
    expect(newUrl.searchParams.get('draft')).not.toBe(originalId)
    expect(screen.getByDisplayValue('n >')).toBeInTheDocument()

    first.unmount()
    window.history.replaceState({}, '', newUrl)
    render(<App />)
    expect(screen.queryByTestId('flow-node-unfinished-condition')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Current document')).toHaveTextContent('untitled')
    const previous = readRecoveryDraft(localStorage, originalId)
    expect(previous.ok && previous.value?.program.nodes[0].text).toBe('n >')
  })

  it('clears only the canvas and restores the graph with one Undo or Redo', async () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 200, y: 100 } },
        { id: 'return', type: 'return', text: '0', position: { x: 200, y: 250 } },
      ],
      edges: [{ id: 'main-return', source: 'main', target: 'return' }],
      imports: 'math\ntext',
      inputQueue: '3\n4',
    }
    const { container } = render(<App />)
    loadFile(JSON.stringify(program), 'library-lesson.json')
    await screen.findByText('Native libraries: math, text')
    await waitFor(() => expect(screen.getByLabelText('Graph validation')).toHaveTextContent('Valid program'))
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Saved to file')
    const id = currentDraftId()
    const savedFingerprint = documentFingerprint(program, 'library-lesson')
    fireEvent.change(screen.getByRole('slider', { name: 'Auto Step speed' }), { target: { value: '4' } })

    fileAction('Clear')

    expect(container.querySelectorAll('.react-flow__node')).toHaveLength(0)
    expect(container.querySelectorAll('.react-flow__edge')).toHaveLength(0)
    expect(screen.getByLabelText('Imports list')).toHaveValue('math\ntext')
    expect(screen.getByText('Native libraries: math, text')).toBeInTheDocument()
    expect(screen.getByLabelText('Input queue')).toHaveValue('3\n4')
    expect(screen.getByRole('slider', { name: 'Auto Step speed' })).toHaveValue('4')
    expect(screen.getByLabelText('Current document')).toHaveTextContent('library-lesson')
    expect(currentDraftId()).toBe(id)
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Unsaved changes')
    await waitFor(() => {
      const draft = readRecoveryDraft(localStorage, id)
      expect(draft.ok && draft.value).toMatchObject({
        id,
        documentName: 'library-lesson',
        savedFingerprint,
        program: { ...program, nodes: [], edges: [] },
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    const clear = within(screen.getByRole('menu', { name: 'File' })).getByRole('menuitem', { name: 'Clear' })
    expect(clear).toBeDisabled()
    fireEvent.click(clear)
    fireEvent.keyDown(clear, { key: 'Escape' })

    toolbarAction('Edit', 'Undo')
    expect(screen.getByTestId('flow-node-main')).toBeInTheDocument()
    expect(screen.getByTestId('flow-node-return')).toBeInTheDocument()
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Saved to file')
    expect(currentDraftId()).toBe(id)
    await waitFor(() => {
      const draft = readRecoveryDraft(localStorage, id)
      expect(draft.ok && draft.value?.program).toEqual(program)
    })

    toolbarAction('Edit', 'Redo')
    expect(container.querySelectorAll('.react-flow__node')).toHaveLength(0)
    expect(container.querySelectorAll('.react-flow__edge')).toHaveLength(0)
    expect(screen.getByLabelText('Imports list')).toHaveValue('math\ntext')
    expect(screen.getByLabelText('Input queue')).toHaveValue('3\n4')
    expect(screen.getByRole('slider', { name: 'Auto Step speed' })).toHaveValue('4')
    expect(screen.getByLabelText('Current document')).toHaveTextContent('library-lesson')
    expect(currentDraftId()).toBe(id)
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Unsaved changes')
    await waitFor(() => {
      const draft = readRecoveryDraft(localStorage, id)
      expect(draft.ok && draft.value?.program).toEqual({ ...program, nodes: [], edges: [] })
    })
  })

  it('keeps browser recovery distinct from a successful file save', async () => {
    const write = vi.fn<(blob: Blob) => Promise<void>>().mockResolvedValue(undefined)
    const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    ;(window as TestSaveWindow).showSaveFilePicker = async () => ({
      name: 'unfinished.json',
      createWritable: async () => ({ write, close }),
    })
    render(<App />)
    loadFile(JSON.stringify(unfinishedProgram))
    const field = await screen.findByDisplayValue('n >')
    fireEvent.change(field, { target: { value: 'n > 0' } })
    await screen.findByText('Recovery saved')
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Unsaved changes')

    fileAction('Save')
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Saved to file')
    const saved = JSON.parse(await write.mock.calls[0][0].text()) as Program
    expect(saved.nodes[0].text).toBe('n > 0')

    toolbarAction('Edit', 'Undo')
    expect(screen.getByDisplayValue('n >')).toBeInTheDocument()
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Unsaved changes')
  })

  it('saves and restores individual collapsed functions with their complete bodies and positions', async () => {
    const write = vi.fn<(blob: Blob) => Promise<void>>().mockResolvedValue(undefined)
    const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    ;(window as TestSaveWindow).showSaveFilePicker = async () => ({
      name: 'collapsed.json', createWritable: async () => ({ write, close }),
    })
    const source: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'main-end', type: 'return', text: 'helper()', position: { x: 0, y: 150 } },
        { id: 'helper', type: 'function', text: 'helper', comment: 'Returns seven.', position: { x: 350, y: 0 } },
        { id: 'helper-end', type: 'return', text: '7', position: { x: 350, y: 150 } },
      ],
      edges: [
        { id: 'main-wire', source: 'main', target: 'main-end' },
        { id: 'helper-wire', source: 'helper', target: 'helper-end' },
      ],
    }
    const first = render(<App />)
    loadFile(JSON.stringify(source), 'collapsed.json')
    await screen.findByTestId('flow-node-helper')
    fireEvent.click(screen.getByLabelText('Collapse function helper'))
    expect(screen.queryByTestId('flow-node-helper-end')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Unsaved changes')
    toolbarAction('Edit', 'Undo')
    expect(screen.getByTestId('flow-node-helper-end')).toBeInTheDocument()
    toolbarAction('Edit', 'Redo')
    expect(screen.queryByTestId('flow-node-helper-end')).not.toBeInTheDocument()

    fileAction('Save')
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    const saved = JSON.parse(await write.mock.calls[0][0].text()) as Program
    expect(saved.nodes).toEqual(source.nodes.map(node => node.id === 'helper' ? { ...node, collapsed: true } : node))
    expect(saved.edges).toEqual(source.edges)
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Saved to file')

    fireEvent.click(screen.getByLabelText('Expand function helper'))
    expect(screen.getByTestId('flow-node-helper-end')).toBeInTheDocument()
    loadFile(JSON.stringify(saved), 'collapsed.json')
    await waitFor(() => expect(screen.getByLabelText('Save status')).toHaveTextContent('Saved to file'))
    expect(screen.getByTestId('flow-node-helper')).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByTestId('flow-node-helper')).toHaveTextContent('Returns seven.')
    expect(screen.queryByTestId('flow-node-helper-end')).not.toBeInTheDocument()
    expect(screen.getByTestId('flow-node-main-end')).toBeInTheDocument()
    await screen.findByText('Recovery saved')
    first.unmount()
    render(<App />)
    expect(screen.getByTestId('flow-node-helper')).toHaveAttribute('data-collapsed', 'true')
    expect(screen.queryByTestId('flow-node-helper-end')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Expand function helper'))
    expect(screen.getByTestId('flow-node-helper-end')).toBeInTheDocument()
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Unsaved changes')
    fileAction('Save')
    await waitFor(() => expect(close).toHaveBeenCalledTimes(2))
    const expanded = JSON.parse(await write.mock.calls[1][0].text()) as Program
    expect(expanded.nodes.find(node => node.id === 'helper')?.collapsed).toBe(false)
    fireEvent.click(screen.getByLabelText('Collapse function helper'))
    loadFile(JSON.stringify(expanded), 'collapsed.json')
    await waitFor(() => expect(screen.getByLabelText('Save status')).toHaveTextContent('Saved to file'))
    expect(screen.getByTestId('flow-node-helper-end')).toBeInTheDocument()
  })

  it('saves and recovers Class and Method collapse states independently', async () => {
    const write = vi.fn<(blob: Blob) => Promise<void>>().mockResolvedValue(undefined)
    const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    ;(window as TestSaveWindow).showSaveFilePicker = async () => ({
      name: 'collapsed-class.json', createWritable: async () => ({ write, close }),
    })
    const first = render(<App />)
    loadFile(JSON.stringify(objectSampleProgram), 'collapsed-class.json')
    await screen.findByTestId('flow-node-point-class')
    fireEvent.click(screen.getByLabelText('Collapse method move'))
    fireEvent.click(screen.getByLabelText('Collapse class Point'))
    fileAction('Save')
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    const saved = JSON.parse(await write.mock.calls[0][0].text()) as Program
    expect(saved.nodes).toEqual(objectSampleProgram.nodes.map(node =>
      ['point-class', 'point-move'].includes(node.id) ? { ...node, collapsed: true } : node,
    ))
    expect(saved.edges).toEqual(objectSampleProgram.edges)

    fireEvent.click(screen.getByLabelText('Expand class Point'))
    fireEvent.click(screen.getByLabelText('Expand method move'))
    loadFile(JSON.stringify(saved), 'collapsed-class.json')
    await waitFor(() => expect(screen.getByTestId('flow-node-point-class')).toHaveAttribute('data-collapsed', 'true'))
    expect(screen.queryByTestId('flow-node-point-move')).not.toBeInTheDocument()
    await screen.findByText('Recovery saved')
    first.unmount()
    render(<App />)
    expect(screen.getByTestId('flow-node-point-class')).toHaveAttribute('data-collapsed', 'true')
    fireEvent.click(screen.getByLabelText('Expand class Point'))
    expect(screen.getByTestId('flow-node-point-move')).toHaveAttribute('data-collapsed', 'true')
    expect(screen.queryByTestId('flow-node-move-dx')).not.toBeInTheDocument()
    expect(screen.getByTestId('flow-node-point-repr')).toHaveAttribute('data-collapsed', 'false')
    expect(screen.getByTestId('flow-node-repr-return')).toBeInTheDocument()

    fileAction('Save')
    await waitFor(() => expect(close).toHaveBeenCalledTimes(2))
    const expanded = JSON.parse(await write.mock.calls[1][0].text()) as Program
    expect(expanded.nodes.find(node => node.id === 'point-class')?.collapsed).toBe(false)
    expect(expanded.nodes.find(node => node.id === 'point-move')?.collapsed).toBe(true)
    expect(expanded.nodes.map(node => node.position)).toEqual(objectSampleProgram.nodes.map(node => node.position))
    fireEvent.click(screen.getByLabelText('Expand method move'))
    expect(screen.getByTestId('flow-node-move-dx')).toBeInTheDocument()
  })

  it('reopens a named browser draft from File Recover draft', async () => {
    writeRecoveryDraft(localStorage, {
      version: 1,
      id: 'older-draft',
      program: unfinishedProgram,
      documentName: 'Lesson in progress',
      savedFingerprint: null,
      updatedAt: Date.now() - 60_000,
    })
    render(<App />)
    fileAction('Recover draft')
    const dialog = screen.getByRole('dialog', { name: 'Recover a draft' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Lesson in progress/ }))

    expect(await screen.findByDisplayValue('n >')).toBeInTheDocument()
    expect(screen.getByLabelText('Current document')).toHaveTextContent('Lesson in progress')
    expect(currentDraftId()).toBe('older-draft')
    expect(screen.queryByRole('dialog', { name: 'Recover a draft' })).not.toBeInTheDocument()
  })

  it('resolves a recovered document when its imports match the current document', async () => {
    const turtleProgram: Program = {
      version: 1,
      imports: 'turtle',
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'return', type: 'return', text: '0', position: { x: 0, y: 120 } },
      ],
      edges: [{ id: 'main-return', source: 'main', target: 'return' }],
    }
    writeRecoveryDraft(localStorage, {
      version: 1,
      id: 'turtle-b',
      program: turtleProgram,
      documentName: 'Turtle B',
      savedFingerprint: documentFingerprint(turtleProgram, 'Turtle B'),
      updatedAt: Date.now() - 60_000,
    })
    render(<App />)
    loadFile(JSON.stringify(turtleProgram), 'turtle-a.json')
    await screen.findByText('Native libraries: turtle')
    fileAction('Recover draft')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Recover a draft' })).getByRole('button', { name: /Turtle B/ }))

    await waitFor(() => expect(screen.getByLabelText('Graph validation')).toHaveTextContent('Valid program'))
    expect(screen.getByText('Native libraries: turtle')).toBeInTheDocument()
    expect(currentDraftId()).toBe('turtle-b')
  })

  it('restores each document identity and saved baseline across Undo and Redo', async () => {
    const firstProgram = { ...unfinishedProgram, imports: 'turtle' }
    const secondProgram: Program = {
      ...unfinishedProgram,
      nodes: [{ ...unfinishedProgram.nodes[0], text: 'n <' }],
      imports: '',
      inputQueue: '9',
    }
    render(<App />)
    loadFile(JSON.stringify(firstProgram), 'document-a.json')
    await screen.findByDisplayValue('n >')
    const firstId = currentDraftId()
    loadFile(JSON.stringify(secondProgram), 'document-b.json')
    await screen.findByDisplayValue('n <')
    const secondId = currentDraftId()

    toolbarAction('Edit', 'Undo')
    expect(currentDraftId()).toBe(firstId)
    expect(screen.getByDisplayValue('n >')).toBeInTheDocument()
    expect(screen.getByLabelText('Current document')).toHaveTextContent('document-a')
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Saved to file')
    expect(screen.getByLabelText('Imports list')).toHaveValue('turtle')
    expect(screen.getByLabelText('Input queue')).toHaveValue('3\n4')
    await screen.findByText('Recovery saved')
    const retained = readRecoveryDraft(localStorage, secondId)
    expect(retained.ok && retained.value?.program.nodes[0].text).toBe('n <')
    expect(retained.ok && retained.value?.documentName).toBe('document-b')

    toolbarAction('Edit', 'Redo')
    expect(currentDraftId()).toBe(secondId)
    expect(screen.getByDisplayValue('n <')).toBeInTheDocument()
    expect(screen.getByLabelText('Current document')).toHaveTextContent('document-b')
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Saved to file')
    expect(screen.getByLabelText('Imports list')).toHaveValue('')
    expect(screen.getByLabelText('Input queue')).toHaveValue('9')
  })

  it('finishes saving the original document without renaming a newly opened document', async () => {
    let finishSave: (() => void) | undefined
    const close = vi.fn(() => new Promise<void>((resolve) => { finishSave = resolve }))
    ;(window as TestSaveWindow).showSaveFilePicker = async () => ({
      name: 'saved-a.json',
      createWritable: async () => ({ write: async () => {}, close }),
    })
    render(<App />)
    loadFile(JSON.stringify(unfinishedProgram), 'document-a.json')
    const field = await screen.findByDisplayValue('n >')
    fireEvent.change(field, { target: { value: 'n > 0' } })
    const firstId = currentDraftId()
    fileAction('Save')
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))

    const secondProgram: Program = {
      ...unfinishedProgram,
      nodes: [{ ...unfinishedProgram.nodes[0], text: 'n <' }],
    }
    loadFile(JSON.stringify(secondProgram), 'document-b.json')
    await screen.findByDisplayValue('n <')
    const secondId = currentDraftId()
    await act(async () => { finishSave?.() })

    expect(currentDraftId()).toBe(secondId)
    expect(screen.getByLabelText('Current document')).toHaveTextContent('document-b')
    expect(screen.getByLabelText('Save status')).toHaveTextContent('Saved to file')
    expect(screen.getByDisplayValue('n <')).toBeInTheDocument()
    const savedOriginal = readRecoveryDraft(localStorage, firstId)
    expect(savedOriginal.ok && savedOriginal.value?.documentName).toBe('saved-a')
    expect(savedOriginal.ok && savedOriginal.value?.savedFingerprint).toBe(documentFingerprint({
      ...unfinishedProgram,
      nodes: [{ ...unfinishedProgram.nodes[0], text: 'n > 0' }],
    }, 'saved-a'))
  })

  it('preserves an unreadable recovery record and keeps its message after saving a fresh draft', async () => {
    const damagedKey = 'flowlab:draft:v1:damaged'
    const damagedContents = '{interrupted recovery record'
    localStorage.setItem(damagedKey, damagedContents)
    window.history.replaceState({}, '', '/FlowLab/?draft=damaged')
    render(<App />)

    expect(currentDraftId()).not.toBe('damaged')
    expect(screen.getAllByText(/This browser draft could not be recovered/).length).toBeGreaterThan(0)
    await screen.findByText('Recovery saved')
    expect(localStorage.getItem(damagedKey)).toBe(damagedContents)
    expect(screen.getAllByText(/This browser draft could not be recovered/).length).toBeGreaterThan(0)
  })
})
