import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { documentFingerprint, readRecoveryDraft, writeRecoveryDraft } from './lib/drafts'
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
