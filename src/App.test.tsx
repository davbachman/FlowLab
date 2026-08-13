import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Position } from '@xyflow/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { LoopbackEdge } from './components/LoopbackEdge'
import { DELETE_KEY_CODES, programToEdges } from './lib/editorEdges'
import { registerFlowLabProgram } from './lib/imports'
import { objectSampleProgram } from './lib/objectSampleProgram'
import {
  CLASS_METHOD_NEW_HANDLE,
  DECISION_LOOPBACK_TARGET_HANDLE,
  METHOD_OWNER_HANDLE,
  classMethodHandleId,
  edgeTypeForProgramEdge,
  getLoopbackPath,
  loopbackJoinOffsetForProgramEdge,
  sourceHandleForProgramEdge,
  targetHandleForProgramEdge,
} from './lib/flowRouting'
import { sampleProgram } from './lib/sampleProgram'
import type { Program } from './lib/types'

type TestSaveFilePicker = (options: unknown) => Promise<{
  name?: string
  createWritable: () => Promise<{
    write: (value: Blob) => Promise<void>
    close: () => Promise<void>
  }>
}>

type TestDirectoryPicker = (options: unknown) => Promise<{
  name?: string
  getFileHandle: (
    name: string,
    options?: unknown,
  ) => Promise<{
    getFile: () => Promise<File>
    createWritable?: () => Promise<{
      write: (value: Blob) => Promise<void>
      close: () => Promise<void>
    }>
  }>
}>

interface TestWindowWithFilePickers extends Window {
  showSaveFilePicker?: TestSaveFilePicker
  showDirectoryPicker?: TestDirectoryPicker
}

const BLOCK_NODE_RENDERED_WIDTH = 194
const DECISION_NODE_RENDERED_WIDTH = 188

type TestUser = ReturnType<typeof userEvent.setup>

function toolbarMenu(name: string): HTMLElement {
  return screen.getByRole('menu', {
    name: new RegExp(`^${name}$`, 'i'),
  })
}

async function chooseToolbarAction(
  user: TestUser,
  menuName: string,
  actionName: string,
): Promise<void> {
  await user.click(
    screen.getByRole('button', {
      name: new RegExp(`^${menuName}$`, 'i'),
    }),
  )
  await user.click(
    within(toolbarMenu(menuName)).getByRole('menuitem', {
      name: new RegExp(`^${actionName}$`, 'i'),
    }),
  )
}

function importProgramFromFileMenu(file: File): void {
  fireEvent.click(screen.getByRole('button', { name: /^File$/i }))
  fireEvent.click(
    within(toolbarMenu('File')).getByRole('menuitem', { name: /^Load$/i }),
  )
  fireEvent.change(screen.getByLabelText(/^Import$/i), {
    target: { files: [file] },
  })
}

function viewportElement(container: HTMLElement): HTMLElement {
  const viewport = container.querySelector('.react-flow__viewport')

  if (!(viewport instanceof HTMLElement)) {
    throw new Error('Missing React Flow viewport.')
  }

  return viewport
}

function sampleNode(id: string) {
  const node = sampleProgram.nodes.find((candidate) => candidate.id === id)

  if (!node) {
    throw new Error(`Missing sample node: ${id}`)
  }

  return node
}

function nodeCenterX(
  node: { position: { x: number } },
  renderedWidth: number,
): number {
  return node.position.x + renderedWidth / 2
}

function placePendingNodeOnPane(pane: Element, x = 440, y = 300): void {
  fireEvent.pointerDown(pane, {
    button: 0,
    clientX: x,
    clientY: y,
    isPrimary: true,
    pointerId: 1,
  })
  fireEvent.pointerUp(pane, {
    button: 0,
    clientX: x,
    clientY: y,
    isPrimary: true,
    pointerId: 1,
  })
}

function svgViewBoxNumbers(element: Element): number[] {
  return (element.getAttribute('viewBox') ?? '')
    .split(/\s+/)
    .map((value) => Number(value))
}

function stubBoundingClientRect(element: Element, rect: Partial<DOMRect>): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    top: 0,
    right: 200,
    bottom: 200,
    left: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect)
}

const helperCallProgram: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    {
      id: 'init',
      type: 'assignment',
      text: `total <- helper([1, 2, 3], 'hello', 7)`,
      position: { x: 0, y: 100 },
    },
    { id: 'output', type: 'output', text: 'total', position: { x: 0, y: 200 } },
    { id: 'main-end', type: 'return', text: 'total', position: { x: 0, y: 300 } },
    {
      id: 'helper',
      type: 'function',
      text: 'helper',
      position: { x: 320, y: 0 },
    },
    { id: 'input-list', type: 'input', text: 'L', position: { x: 320, y: 100 } },
    {
      id: 'input-word',
      type: 'input',
      text: 'word',
      position: { x: 320, y: 200 },
    },
    { id: 'input-n', type: 'input', text: 'n', position: { x: 320, y: 300 } },
    {
      id: 'add',
      type: 'assignment',
      text: 'result <- L[0] + L[2] + n',
      position: { x: 320, y: 400 },
    },
    {
      id: 'helper-end',
      type: 'return',
      text: 'result',
      position: { x: 320, y: 500 },
    },
  ],
  edges: [
    { id: 'e1', source: 'main', target: 'init' },
    { id: 'e2', source: 'init', target: 'output' },
    { id: 'e3', source: 'output', target: 'main-end' },
    { id: 'e4', source: 'helper', target: 'input-list' },
    { id: 'e5', source: 'input-list', target: 'input-word' },
    { id: 'e6', source: 'input-word', target: 'input-n' },
    { id: 'e7', source: 'input-n', target: 'add' },
    { id: 'e8', source: 'add', target: 'helper-end' },
  ],
}

const importedHelperProgram: Program = {
  version: 1,
  nodes: [
    {
      id: 'import-main',
      type: 'function',
      text: 'main',
      position: { x: 0, y: 0 },
    },
    {
      id: 'import-main-return',
      type: 'return',
      text: '0',
      position: { x: 0, y: 100 },
    },
    {
      id: 'import-helper',
      type: 'function',
      text: 'helper',
      position: { x: 320, y: 0 },
    },
    {
      id: 'import-helper-input',
      type: 'input',
      text: 'x',
      position: { x: 320, y: 100 },
    },
    {
      id: 'import-helper-return',
      type: 'return',
      text: 'x + 1',
      position: { x: 320, y: 200 },
    },
  ],
  edges: [
    { id: 'import-e1', source: 'import-main', target: 'import-main-return' },
    { id: 'import-e2', source: 'import-helper', target: 'import-helper-input' },
    {
      id: 'import-e3',
      source: 'import-helper-input',
      target: 'import-helper-return',
    },
  ],
}

const folderHelperProgram: Program = {
  ...importedHelperProgram,
  nodes: importedHelperProgram.nodes.map((node) =>
    node.id === 'import-helper'
      ? { ...node, text: 'folderHelper' }
      : node,
  ),
}

const newlineOutputProgram: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    {
      id: 'output',
      type: 'output',
      text: '"hello\\ngoodbye"',
      position: { x: 0, y: 100 },
    },
    { id: 'return', type: 'return', text: '0', position: { x: 0, y: 200 } },
  ],
  edges: [
    { id: 'e1', source: 'main', target: 'output' },
    { id: 'e2', source: 'output', target: 'return' },
  ],
}

const askProgram: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    {
      id: 'ask',
      type: 'assignment',
      text: 'x <- ask() + 1',
      position: { x: 0, y: 100 },
    },
    { id: 'output', type: 'output', text: 'x', position: { x: 0, y: 200 } },
    { id: 'return', type: 'return', text: 'x', position: { x: 0, y: 300 } },
  ],
  edges: [
    { id: 'e1', source: 'main', target: 'ask' },
    { id: 'e2', source: 'ask', target: 'output' },
    { id: 'e3', source: 'output', target: 'return' },
  ],
}

const turtleDrawingProgram: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    {
      id: 'forward',
      type: 'call',
      text: 'forward(100)',
      position: { x: 0, y: 100 },
    },
    {
      id: 'left',
      type: 'call',
      text: 'left(90)',
      position: { x: 0, y: 200 },
    },
    {
      id: 'up',
      type: 'call',
      text: 'forward(50)',
      position: { x: 0, y: 300 },
    },
    { id: 'return', type: 'return', text: '0', position: { x: 0, y: 400 } },
  ],
  edges: [
    { id: 'e1', source: 'main', target: 'forward' },
    { id: 'e2', source: 'forward', target: 'left' },
    { id: 'e3', source: 'left', target: 'up' },
    { id: 'e4', source: 'up', target: 'return' },
  ],
}

const textFromUrlProgram: Program = {
  version: 1,
  imports: 'text',
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    {
      id: 'load-text',
      type: 'assignment',
      text: 'page <- text_from_url("https://example.edu/page.txt")',
      position: { x: 0, y: 100 },
    },
    {
      id: 'output-text',
      type: 'output',
      text: 'page',
      position: { x: 0, y: 200 },
    },
    { id: 'return', type: 'return', text: '0', position: { x: 0, y: 300 } },
  ],
  edges: [
    { id: 'e1', source: 'main', target: 'load-text' },
    { id: 'e2', source: 'load-text', target: 'output-text' },
    { id: 'e3', source: 'output-text', target: 'return' },
  ],
}

const multilineVariableProgram: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    {
      id: 'set-text',
      type: 'assignment',
      text: 'text <- "line one\\nline two\\nline three\\nline four\\nline five\\nline six"',
      position: { x: 0, y: 100 },
    },
    { id: 'return', type: 'return', text: '0', position: { x: 0, y: 200 } },
  ],
  edges: [
    { id: 'e1', source: 'main', target: 'set-text' },
    { id: 'e2', source: 'set-text', target: 'return' },
  ],
}

const objectProgramWithTwoMethods: Program = {
  ...objectSampleProgram,
  nodes: [
    ...objectSampleProgram.nodes,
    {
      id: 'point-reset',
      type: 'method',
      text: 'reset',
      position: { x: 220, y: 150 },
    },
    {
      id: 'reset-return',
      type: 'return',
      text: 'Point(0, 0)',
      position: { x: 220, y: 260 },
    },
  ],
  edges: [
    ...objectSampleProgram.edges,
    {
      id: 'edge-point-reset',
      source: 'point-class',
      target: 'point-reset',
    },
    {
      id: 'edge-reset-return',
      source: 'point-reset',
      target: 'reset-return',
    },
  ],
}

describe('App', () => {
  afterEach(() => {
    delete (window as TestWindowWithFilePickers).showSaveFilePicker
    delete (window as TestWindowWithFilePickers).showDirectoryPicker
    localStorage.clear()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders the classroom editor shell', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: /FlowLab/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        /Build flowchart programs, validate them, and step through execution/i,
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Process$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Function$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Class$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Method$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /^Definitions$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /^Steps$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Return$/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Assignment$/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Call$/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Add Call/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^For$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText(/Current document/i),
    ).toHaveTextContent('untitled')
    expect(
      screen.getByRole('navigation', { name: /Application menus/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^FlowLab$/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^File$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Edit$/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Examples$/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^Import$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Input queue/i)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Imports/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Imports list/i)).toBeInTheDocument()
  })

  it('shows the exact FlowLab, File, and Examples disclosure menus exclusively', async () => {
    const user = userEvent.setup()
    render(<App />)

    const menuBar = screen.getByRole('navigation', {
      name: /Application menus/i,
    })
    const flowLabTrigger = within(menuBar).getByRole('button', {
      name: /^FlowLab$/i,
    })
    const fileTrigger = within(menuBar).getByRole('button', {
      name: /^File$/i,
    })
    const examplesTrigger = within(menuBar).getByRole('button', {
      name: /^Examples$/i,
    })

    expect(within(flowLabTrigger).getByText('FlowLab').tagName).toBe('STRONG')
    expect(flowLabTrigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(flowLabTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(fileTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(examplesTrigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(flowLabTrigger)
    const flowLabMenu = toolbarMenu('FlowLab')
    expect(
      within(flowLabMenu).getByRole('menuitem', { name: /^About$/i }),
    ).toBeInTheDocument()
    expect(
      within(flowLabMenu).getByRole('menuitem', { name: /^Instructions$/i }),
    ).toBeInTheDocument()
    expect(flowLabTrigger).toHaveAttribute('aria-expanded', 'true')

    await user.click(fileTrigger)
    expect(
      screen.queryByRole('menu', { name: /^FlowLab$/i }),
    ).not.toBeInTheDocument()
    expect(flowLabTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(fileTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(toolbarMenu('File'))
        .getAllByRole('menuitem')
        .map((button) => button.textContent),
    ).toEqual(['New', 'Save', 'Load'])

    await user.click(examplesTrigger)
    expect(
      screen.queryByRole('menu', { name: /^File$/i }),
    ).not.toBeInTheDocument()
    expect(fileTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(examplesTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(toolbarMenu('Examples'))
        .getAllByRole('menuitem')
        .map((button) => button.textContent),
    ).toEqual([
      'Basic',
      'Process Basics',
      'Number Guess',
      'List Statistics',
      'Dictionary Inventory',
      'Object',
      'Bank Account Class',
      'Turtle Polygon',
    ])
  })

  it('shows the exact About copy, links, and emphasis and restores focus when closed', async () => {
    const user = userEvent.setup()
    render(<App />)

    const flowLabTrigger = screen.getByRole('button', { name: /^FlowLab$/i })
    await chooseToolbarAction(user, 'FlowLab', 'About')

    const dialog = screen.getByRole('dialog', { name: /^About FlowLab$/i })
    const description = dialog.querySelector('#about-flowlab-description')

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(description?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Created by David Bachman with GPT 5.5 and GPT 5.6 sol. To learn more about David see https://pzacad.pitzer.edu/~dbachman/, and subscribe to his AI podcast Entropy Bonus at https://profbachman.substack.com/.',
    )
    const davidLink = within(dialog).getByRole('link', {
      name: 'https://pzacad.pitzer.edu/~dbachman/',
    })
    const podcastLink = within(dialog).getByRole('link', {
      name: 'https://profbachman.substack.com/',
    })
    expect(davidLink).toHaveAttribute(
      'href',
      'https://pzacad.pitzer.edu/~dbachman/',
    )
    expect(podcastLink).toHaveAttribute(
      'href',
      'https://profbachman.substack.com/',
    )
    expect(within(dialog).getByText('Entropy Bonus').tagName).toBe('EM')

    await user.click(within(dialog).getByRole('button', { name: /^Close$/i }))
    expect(
      screen.queryByRole('dialog', { name: /^About FlowLab$/i }),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(flowLabTrigger).toHaveFocus())

    await chooseToolbarAction(user, 'FlowLab', 'About')
    await user.keyboard('{Escape}')
    expect(
      screen.queryByRole('dialog', { name: /^About FlowLab$/i }),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(flowLabTrigger).toHaveFocus())
  })

  it('links Instructions directly to the GitHub README in a separate tab', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^FlowLab$/i }))
    const instructions = within(toolbarMenu('FlowLab')).getByRole('menuitem', {
      name: /^Instructions$/i,
    })

    expect(instructions).toHaveAttribute(
      'href',
      'https://github.com/davbachman/FlowLab/blob/main/README.md',
    )
    expect(instructions).toHaveAttribute('target', '_blank')
    expect(instructions).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('closes toolbar menus with Escape or an outside pointer press', async () => {
    const user = userEvent.setup()
    render(<App />)

    const fileTrigger = screen.getByRole('button', { name: /^File$/i })
    await user.click(fileTrigger)
    expect(toolbarMenu('File')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(
      screen.queryByRole('menu', { name: /^File$/i }),
    ).not.toBeInTheDocument()
    expect(fileTrigger).toHaveFocus()

    const examplesTrigger = screen.getByRole('button', { name: /^Examples$/i })
    await user.click(examplesTrigger)
    expect(toolbarMenu('Examples')).toBeInTheDocument()

    fireEvent.pointerDown(
      screen.getByRole('region', { name: /Flowchart workspace/i }),
    )
    expect(
      screen.queryByRole('menu', { name: /^Examples$/i }),
    ).not.toBeInTheDocument()
  })

  it('returns focus to a menu trigger after an action closes its menu', async () => {
    const user = userEvent.setup()
    render(<App />)

    const examplesTrigger = screen.getByRole('button', {
      name: /^Examples$/i,
    })
    await chooseToolbarAction(user, 'Examples', 'Basic')
    expect(examplesTrigger).toHaveFocus()

    const fileTrigger = screen.getByRole('button', { name: /^File$/i })
    await chooseToolbarAction(user, 'File', 'Load')
    expect(fileTrigger).toHaveFocus()
  })

  it('does not run canvas shortcuts behind the About dialog', async () => {
    const user = userEvent.setup()
    render(<App />)

    await chooseToolbarAction(user, 'Examples', 'Basic')
    expect(screen.getByLabelText(/^Function text$/i)).toHaveValue('main')

    await chooseToolbarAction(user, 'FlowLab', 'About')
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(screen.getByLabelText(/^Function text$/i)).toHaveValue('main')

    await user.click(screen.getByRole('button', { name: /^Close$/i }))
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() =>
      expect(
        screen.queryByLabelText(/^Function text$/i),
      ).not.toBeInTheDocument(),
    )
  })

  it('sizes the shell from the browser visual viewport', () => {
    vi.stubGlobal('visualViewport', {
      width: 1728,
      height: 1040,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    const { container } = render(<App />)
    const shell = container.querySelector('.app-shell')

    expect(shell).toHaveAttribute(
      'style',
      expect.stringContaining('--app-viewport-width: 1728px'),
    )
    expect(shell).toHaveAttribute(
      'style',
      expect.stringContaining('--app-viewport-height: 1040px'),
    )
  })

  it('starts the blank canvas at a modest default zoom', () => {
    const { container } = render(<App />)

    expect(viewportElement(container).style.transform).toContain('scale(0.85)')
  })

  it('loads callable helper functions from named imported programs', async () => {
    const user = userEvent.setup()
    registerFlowLabProgram('helpers.json', importedHelperProgram)
    render(<App />)

    await user.type(screen.getByLabelText(/Imports list/i), 'helpers.json')

    expect(await screen.findByText(/Imported files: helpers/i)).toBeInTheDocument()
    expect(await screen.findByText(/Functions: helper/i)).toBeInTheDocument()
  })

  it('lists imported Classes separately from imported Functions', async () => {
    const user = userEvent.setup()
    registerFlowLabProgram('objects.json', objectSampleProgram)
    render(<App />)

    await user.type(screen.getByLabelText(/Imports list/i), 'objects')

    expect(await screen.findByText('Classes: Point')).toBeInTheDocument()
    expect(screen.queryByText(/^Functions:/)).not.toBeInTheDocument()
    expect(screen.queryByText('No imported callables')).not.toBeInTheDocument()
  })

  it('loads turtle as a native library from the imports panel', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/Imports list/i), 'turtle')

    expect(
      await screen.findByText(/Native libraries: turtle/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent?.startsWith('Functions:') === true &&
          element.textContent.includes('forward') &&
          element.textContent.includes('right') &&
          !element.textContent.includes('fd') &&
          !element.textContent.includes('rt'),
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Turtle/i })).toBeInTheDocument()
  })

  it('runs block expressions that call imported helper functions', async () => {
    const user = userEvent.setup()
    registerFlowLabProgram('helpers.json', importedHelperProgram)
    render(<App />)

    await user.type(screen.getByLabelText(/Imports list/i), 'helpers')
    await screen.findByText(/Functions: helper/i)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    const initialTotal = screen.getByDisplayValue('total <- 0')
    await user.clear(initialTotal)
    await user.type(initialTotal, 'total <- helper(5)')
    await user.clear(screen.getByLabelText(/Input queue/i))
    await user.type(screen.getByLabelText(/Input queue/i), '0')
    await user.click(screen.getByRole('button', { name: /Run/i }))

    expect(screen.getByRole('region', { name: /Output/i })).toHaveTextContent(
      '6',
    )
    expect(screen.getByText(/Halted/i)).toBeInTheDocument()
  })

  it('starts with a blank canvas and loads the default sample on request', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByTestId('flow-node-main')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('total <- 0')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Input queue/i)).toHaveValue('')

    await chooseToolbarAction(user, 'Examples', 'Basic')

    expect(screen.getByTestId('flow-node-main')).toBeInTheDocument()
    expect(screen.getByDisplayValue('total <- 0')).toBeInTheDocument()
    expect(screen.getByLabelText(/Input queue/i)).toHaveValue('3')
  })

  it('loads all six additional sample programs from the Examples menu', async () => {
    const user = userEvent.setup()
    render(<App />)

    await chooseToolbarAction(user, 'Examples', 'Process Basics')
    expect(screen.getByTestId('flow-node-calculate-area')).toBeInTheDocument()
    expect(screen.getByLabelText(/Process text/i)).toHaveValue(
      'width <- 8\nheight <- 5\narea <- width * height\nlabel <- "Area: " + area',
    )

    await chooseToolbarAction(user, 'Examples', 'Number Guess')
    expect(screen.getByTestId('flow-node-guess-low-check')).toHaveAttribute(
      'data-shape',
      'diamond',
    )

    await chooseToolbarAction(user, 'Examples', 'List Statistics')
    expect(screen.getByTestId('flow-node-stats-loop')).toHaveAttribute(
      'data-shape',
      'diamond',
    )

    await chooseToolbarAction(user, 'Examples', 'Dictionary Inventory')
    expect(screen.getByTestId('flow-node-inventory-setup')).toBeInTheDocument()

    await chooseToolbarAction(user, 'Examples', 'Bank Account Class')
    expect(screen.getByTestId('flow-node-account-class')).toHaveAttribute(
      'data-shape',
      'declaration',
    )

    await chooseToolbarAction(user, 'Examples', 'Turtle Polygon')
    expect(screen.getByTestId('flow-node-polygon-draw')).toBeInTheDocument()
    expect(screen.getByLabelText(/Imports list/i)).toHaveValue('turtle')
    expect(
      await screen.findByRole('region', { name: /Turtle/i }),
    ).toBeInTheDocument()
  })

  it('keeps a compact special-method reference beside the node palette', () => {
    render(<App />)

    const reference = screen.getByLabelText(/Special methods reference/i)
    expect(reference).toHaveTextContent('__repr__')
    expect(reference).toHaveTextContent('__add__')
    expect(reference).toHaveTextContent('__eq__')
    expect(reference).toHaveTextContent('1 Input · Boolean')
  })

  it('loads and runs the object sample with shared object identities and fields', async () => {
    const user = userEvent.setup()
    render(<App />)

    await chooseToolbarAction(user, 'Examples', 'Object')

    const classNode = screen.getByTestId('flow-node-point-class')
    const methodNode = screen.getByTestId('flow-node-point-move')
    const reprNode = screen.getByTestId('flow-node-point-repr')

    expect(classNode).toHaveAttribute('data-shape', 'declaration')
    expect(
      classNode.querySelector(
        `[data-handleid="${classMethodHandleId('point-move')}"]`,
      ),
    ).toBeInTheDocument()
    expect(
      classNode.querySelector(
        `[data-handleid="${classMethodHandleId('point-repr')}"]`,
      ),
    ).toBeInTheDocument()
    expect(
      classNode.querySelector(`[data-handleid="${CLASS_METHOD_NEW_HANDLE}"]`),
    ).toBeInTheDocument()
    expect(
      methodNode.querySelector(`[data-handleid="${METHOD_OWNER_HANDLE}"]`),
    ).toHaveAttribute('data-handlepos', 'top')
    expect(methodNode.querySelector('[data-handlepos="bottom"]')).toBeInTheDocument()
    expect(
      reprNode.querySelector(`[data-handleid="${METHOD_OWNER_HANDLE}"]`),
    ).toHaveAttribute('data-handlepos', 'top')
    expect(screen.getByDisplayValue('move')).toBeInTheDocument()
    expect(screen.getByDisplayValue('__repr__')).toBeInTheDocument()
    expect(screen.getByDisplayValue('x <- x + dx')).toBeInTheDocument()
    expect(screen.getByDisplayValue('y <- y + dy')).toBeInTheDocument()
    expect(
      within(classNode).getByLabelText(/Method connections/i),
    ).toHaveTextContent('move__repr__+ method')
    expect(within(classNode).getByLabelText(/Declared fields/i)).toHaveTextContent(
      'xy',
    )

    await user.click(screen.getByRole('button', { name: /^Run$/i }))

    const output = screen.getByRole('region', { name: /Output/i })
    expect(within(output).getByText('Point(7, 2)')).toBeInTheDocument()
    expect(within(output).getByText('7')).toBeInTheDocument()
    expect(within(output).getByText('2')).toBeInTheDocument()

    const variables = screen.getByRole('region', { name: /Variables/i })
    const pRow = within(variables).getByText('p').closest('.variable-row')
    const aliasRow = within(variables)
      .getByText('same_point')
      .closest('.variable-row')

    expect(pRow).not.toBeNull()
    expect(aliasRow).not.toBeNull()
    expect(
      within(pRow as HTMLElement).getByText('Point #1'),
    ).toBeInTheDocument()
    expect(
      within(aliasRow as HTMLElement).getByText('Point #1'),
    ).toBeInTheDocument()

    await user.click(within(pRow as HTMLElement).getByText('Point #1'))

    expect(within(pRow as HTMLElement).getByText('x')).toBeInTheDocument()
    expect(within(pRow as HTMLElement).getByText('7')).toBeInTheDocument()
    expect(within(pRow as HTMLElement).getByText('y')).toBeInTheDocument()
    expect(within(pRow as HTMLElement).getByText('2')).toBeInTheDocument()
  })

  it('expands a Class connector row for every attached Method plus one open slot', async () => {
    render(<App />)

    importProgramFromFileMenu(
      new File(
        [JSON.stringify(objectProgramWithTwoMethods)],
        'two-methods.json',
        { type: 'application/json' },
      ),
    )

    await screen.findByDisplayValue('reset')
    const classNode = screen.getByTestId('flow-node-point-class')
    const connectorRow = within(classNode).getByLabelText(/Method connections/i)

    expect(classNode).toHaveStyle({
      '--class-method-slot-count': '4',
      '--class-node-width': '300px',
    })
    expect(connectorRow).toHaveTextContent('move__repr__reset+ method')
    expect(
      connectorRow.querySelector(
        `[data-handleid="${classMethodHandleId('point-move')}"]`,
      ),
    ).toBeInTheDocument()
    expect(
      connectorRow.querySelector(
        `[data-handleid="${classMethodHandleId('point-repr')}"]`,
      ),
    ).toBeInTheDocument()
    expect(
      connectorRow.querySelector(
        `[data-handleid="${classMethodHandleId('point-reset')}"]`,
      ),
    ).toBeInTheDocument()
    expect(
      connectorRow.querySelector(
        `[data-handleid="${CLASS_METHOD_NEW_HANDLE}"]`,
      ),
    ).toBeInTheDocument()
  })

  it('shows the active method flow and highlights its root while stepping', async () => {
    const user = userEvent.setup()
    render(<App />)

    await chooseToolbarAction(user, 'Examples', 'Object')
    await user.click(screen.getByRole('button', { name: /^Reset$/i }))

    const flowStatus = screen.getByText('Flow').closest('div')
    const methodNode = screen.getByTestId('flow-node-point-move')

    expect(flowStatus).toHaveTextContent('main')

    for (let step = 0; step < 4; step += 1) {
      await user.click(screen.getByRole('button', { name: /^Step$/i }))
    }

    expect(flowStatus).toHaveTextContent('Point.move')
    expect(methodNode).toHaveAttribute('data-current', 'true')
    expect(methodNode).toHaveAttribute('aria-current', 'step')
  })

  it('starts a new blank program from File > New', async () => {
    const user = userEvent.setup()
    render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    expect(screen.getByTestId('flow-node-main')).toBeInTheDocument()
    expect(screen.getByDisplayValue('total <- 0')).toBeInTheDocument()

    await chooseToolbarAction(user, 'File', 'New')

    expect(screen.queryByTestId('flow-node-main')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('total <- 0')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Input queue/i)).toHaveValue('3')
    expect(screen.getByText(/exactly one main Function/i)).toBeInTheDocument()
  })

  it('lets students edit flowchart node text', async () => {
    const user = userEvent.setup()
    render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    const assignment = screen.getByDisplayValue('total <- 0')
    await user.clear(assignment)
    await user.type(assignment, 'total <- 1')

    expect(screen.getByDisplayValue('total <- 1')).toBeInTheDocument()
  })

  it('lets students edit function names', async () => {
    const user = userEvent.setup()
    render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    const mainFunction = screen.getByDisplayValue('main')
    await user.clear(mainFunction)
    await user.type(mainFunction, 'helper')

    expect(screen.getByDisplayValue('helper')).toBeInTheDocument()
  })

  it('falls back to a save-file dialog when folder export is unavailable', async () => {
    const user = userEvent.setup()
    const write = vi.fn<(value: Blob) => Promise<void>>(() => Promise.resolve())
    const close = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const createWritable = vi.fn(() => Promise.resolve({ write, close }))
    const showSaveFilePicker = vi.fn<TestSaveFilePicker>(() =>
      Promise.resolve({ name: 'lesson-one.json', createWritable }),
    )

    ;(window as TestWindowWithFilePickers).showSaveFilePicker = showSaveFilePicker

    render(<App />)

    await chooseToolbarAction(user, 'File', 'Save')

    await waitFor(() => expect(showSaveFilePicker).toHaveBeenCalledTimes(1))
    expect(showSaveFilePicker).toHaveBeenCalledWith({
      id: 'flowlab-programs',
      suggestedName: 'untitled.json',
      types: [
        {
          description: 'FlowLab program JSON',
          accept: { 'application/json': ['.json'] },
        },
      ],
    })
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText(/Current document/i)).toHaveTextContent(
      'lesson-one',
    )

    const exportedBlob = write.mock.calls[0]?.[0]
    expect(exportedBlob).toBeInstanceOf(Blob)
    expect(JSON.parse(await exportedBlob.text())).toMatchObject({
      version: 1,
      nodes: expect.any(Array),
      edges: expect.any(Array),
    })
  })

  it('exports the imports list and input queue with the program', async () => {
    const user = userEvent.setup()
    const write = vi.fn<(value: Blob) => Promise<void>>(() => Promise.resolve())
    const close = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const createWritable = vi.fn(() => Promise.resolve({ write, close }))
    const showSaveFilePicker = vi.fn<TestSaveFilePicker>(() =>
      Promise.resolve({ name: 'with-runtime-state.json', createWritable }),
    )

    ;(window as TestWindowWithFilePickers).showSaveFilePicker = showSaveFilePicker

    render(<App />)

    fireEvent.change(screen.getByLabelText(/Imports list/i), {
      target: { value: 'turtle' },
    })
    fireEvent.change(screen.getByLabelText(/Input queue/i), {
      target: { value: '5\n6' },
    })
    await chooseToolbarAction(user, 'File', 'Save')

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    const exportedBlob = write.mock.calls[0]?.[0]

    expect(exportedBlob).toBeInstanceOf(Blob)
    expect(JSON.parse(await exportedBlob.text())).toMatchObject({
      imports: 'turtle',
      inputQueue: '5\n6',
    })
  })

  it('imports the saved imports list and input queue before validating the program', async () => {
    render(<App />)

    importProgramFromFileMenu(
      new File(
        [
          JSON.stringify({
            ...turtleDrawingProgram,
            imports: 'turtle',
            inputQueue: '9\n10',
          }),
        ],
        'saved-turtle.json',
        { type: 'application/json' },
      ),
    )

    await screen.findByDisplayValue('forward(100)')
    expect(screen.getByLabelText(/Imports list/i)).toHaveValue('turtle')
    expect(screen.getByLabelText(/Input queue/i)).toHaveValue('9\n10')
    expect(
      await screen.findByText(/Native libraries: turtle/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Current document/i)).toHaveTextContent(
      'saved-turtle',
    )
  })

  it('loads imports from the export folder before cached files', async () => {
    const user = userEvent.setup()
    const write = vi.fn<(value: Blob) => Promise<void>>(() => Promise.resolve())
    const close = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const createWritable = vi.fn(() => Promise.resolve({ write, close }))
    const getFileHandle = vi.fn((name: string, options?: unknown) => {
      if (
        name === 'lesson-one.json' &&
        JSON.stringify(options) === JSON.stringify({ create: true })
      ) {
        return Promise.resolve({
          getFile: () =>
            Promise.resolve(new File([], name, { type: 'application/json' })),
          createWritable,
        })
      }

      if (name !== 'helpers.json') {
        return Promise.reject(new DOMException('Missing file', 'NotFoundError'))
      }

      return Promise.resolve({
        getFile: () =>
          Promise.resolve(
            new File([JSON.stringify(folderHelperProgram)], name, {
              type: 'application/json',
            }),
          ),
      })
    })
    const showSaveFilePicker = vi.fn<TestSaveFilePicker>(() =>
      Promise.resolve({ name: 'lesson-one.json', createWritable }),
    )
    const showDirectoryPicker = vi.fn<TestDirectoryPicker>(() =>
      Promise.resolve({ name: 'Programs', getFileHandle }),
    )

    registerFlowLabProgram('helpers.json', importedHelperProgram)
    ;(window as TestWindowWithFilePickers).showSaveFilePicker = showSaveFilePicker
    ;(window as TestWindowWithFilePickers).showDirectoryPicker =
      showDirectoryPicker

    render(<App />)

    await chooseToolbarAction(user, 'File', 'Save')

    await waitFor(() => expect(showDirectoryPicker).toHaveBeenCalledTimes(1))
    expect(showDirectoryPicker).toHaveBeenCalledWith({
      id: 'flowlab-programs',
      mode: 'readwrite',
    })
    expect(showSaveFilePicker).not.toHaveBeenCalled()

    const filenameInput = await screen.findByRole('textbox', {
      name: /^Filename$/i,
    })
    expect(filenameInput).toHaveValue('untitled.json')
    await user.clear(filenameInput)
    await user.type(filenameInput, 'lesson-one')
    await user.click(screen.getByRole('button', { name: /^Save$/i }))

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    expect(getFileHandle).toHaveBeenCalledWith('lesson-one.json', {
      create: true,
    })
    expect(screen.getByLabelText(/Current document/i)).toHaveTextContent(
      'lesson-one',
    )

    await user.type(screen.getByLabelText(/Imports list/i), 'helpers')

    expect(await screen.findByText('Imported files: helpers')).toBeInTheDocument()
    expect(screen.getByText('Functions: folderHelper')).toBeInTheDocument()
    expect(screen.queryByText('Functions: helper')).not.toBeInTheDocument()
  })

  it('reuses the export folder on later exports and only asks for a filename', async () => {
    const user = userEvent.setup()
    const write = vi.fn<(value: Blob) => Promise<void>>(() => Promise.resolve())
    const close = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const createWritable = vi.fn(() => Promise.resolve({ write, close }))
    const getFileHandle = vi.fn((name: string) =>
      Promise.resolve({
        getFile: () =>
          Promise.resolve(new File([], name, { type: 'application/json' })),
        createWritable,
      }),
    )
    const showDirectoryPicker = vi.fn<TestDirectoryPicker>(() =>
      Promise.resolve({ name: 'Programs', getFileHandle }),
    )

    ;(window as TestWindowWithFilePickers).showDirectoryPicker =
      showDirectoryPicker

    render(<App />)

    await chooseToolbarAction(user, 'File', 'Save')
    await user.clear(
      await screen.findByRole('textbox', { name: /^Filename$/i }),
    )
    await user.type(
      screen.getByRole('textbox', { name: /^Filename$/i }),
      'first',
    )
    await user.click(screen.getByRole('button', { name: /^Save$/i }))
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))

    await chooseToolbarAction(user, 'File', 'Save')

    expect(showDirectoryPicker).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByRole('textbox', { name: /^Filename$/i }),
    ).toHaveValue('first.json')
  })

  it('falls back to browser download export when save-file dialogs are unavailable', async () => {
    const user = userEvent.setup()
    const click = vi.fn()
    const clickedAnchors: HTMLAnchorElement[] = []
    const anchors: HTMLAnchorElement[] = []
    const createElement = vi.spyOn(document, 'createElement')
    createElement.mockImplementation((tagName, options) => {
      const element = Document.prototype.createElement.call(
        document,
        tagName,
        options,
      )

      if (tagName.toLowerCase() === 'a') {
        anchors.push(element as HTMLAnchorElement)
        Object.defineProperty(element, 'click', {
          configurable: true,
          value() {
            clickedAnchors.push(element as HTMLAnchorElement)
            click()
          },
        })
      }

      return element
    })

    render(<App />)

    await chooseToolbarAction(user, 'File', 'Save')

    expect(
      screen.queryByRole('textbox', { name: /^Filename$/i }),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(anchors).toContain(clickedAnchors[0])
    expect(clickedAnchors[0]?.download).toBe('untitled.json')
    expect(screen.getByLabelText(/Current document/i)).toHaveTextContent(
      'untitled',
    )
  })

  it('runs the sample program with queued input and shows output', async () => {
    const user = userEvent.setup()
    render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    await user.clear(screen.getByLabelText(/Input queue/i))
    await user.type(screen.getByLabelText(/Input queue/i), '3')
    await user.click(screen.getByRole('button', { name: /Run/i }))

    expect(screen.getByRole('region', { name: /Output/i })).toHaveTextContent(
      '6',
    )
    expect(screen.getByText(/Halted/i)).toBeInTheDocument()
  })

  it('runs turtle Call blocks and renders the drawing in the sidebar', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/Imports list/i), 'turtle')
    await screen.findByText(/Native libraries: turtle/i)
    importProgramFromFileMenu(
      new File([JSON.stringify(turtleDrawingProgram)], 'turtle.json', {
        type: 'application/json',
      }),
    )

    await screen.findByDisplayValue('forward(100)')
    await user.click(screen.getByRole('button', { name: /Run/i }))

    const turtle = screen.getByRole('region', { name: /Turtle/i })
    expect(within(turtle).getByTestId('turtle-canvas')).toBeInTheDocument()
    expect(within(turtle).getAllByTestId('turtle-segment')).toHaveLength(2)
    expect(within(turtle).getByTestId('turtle-marker').tagName).toBe('polygon')
    expect(screen.getByText(/Halted/i)).toBeInTheDocument()
  })

  it('loads URL text from the text native library and resumes running', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('Fetched text from class data'),
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    importProgramFromFileMenu(
      new File([JSON.stringify(textFromUrlProgram)], 'url-text.json', {
        type: 'application/json',
      }),
    )

    await screen.findByDisplayValue(
      'page <- text_from_url("https://example.edu/page.txt")',
    )
    await screen.findByText(/Native libraries: text/i)
    await user.click(screen.getByRole('button', { name: /Run/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.edu/page.txt',
        { cache: 'no-store' },
      ),
    )
    expect(screen.getByRole('region', { name: /Output/i })).toHaveTextContent(
      'Fetched text from class data',
    )
    expect(screen.getByText(/Halted/i)).toBeInTheDocument()
  })

  it('pans the turtle canvas with a right-click drag', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/Imports list/i), 'turtle')
    await screen.findByRole('region', { name: /Turtle/i })
    const canvas = screen.getByTestId('turtle-canvas')
    stubBoundingClientRect(canvas, { width: 200, height: 200 })
    Object.defineProperty(canvas, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(canvas, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    })

    const before = svgViewBoxNumbers(canvas)
    fireEvent.pointerDown(canvas, {
      button: 2,
      buttons: 2,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    })
    fireEvent.pointerMove(canvas, {
      button: 2,
      buttons: 2,
      clientX: 140,
      clientY: 120,
      pointerId: 1,
    })
    fireEvent.pointerUp(canvas, {
      button: 2,
      buttons: 0,
      clientX: 140,
      clientY: 120,
      pointerId: 1,
    })

    const after = svgViewBoxNumbers(canvas)
    expect(after[0]).toBeLessThan(before[0])
    expect(after[1]).toBeLessThan(before[1])
  })

  it('zooms in on the turtle canvas when a trackpad unpinch matches the main canvas wheel direction', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/Imports list/i), 'turtle')
    await screen.findByRole('region', { name: /Turtle/i })
    const canvas = screen.getByTestId('turtle-canvas')
    stubBoundingClientRect(canvas, { width: 200, height: 200 })

    const before = svgViewBoxNumbers(canvas)
    fireEvent.wheel(canvas, {
      clientX: 100,
      clientY: 100,
      ctrlKey: true,
      deltaY: -120,
    })
    const after = svgViewBoxNumbers(canvas)

    expect(after[2]).toBeLessThan(before[2])
    expect(after[3]).toBeLessThan(before[3])
  })

  it('zooms out on the turtle canvas when a trackpad pinch matches the main canvas wheel direction', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/Imports list/i), 'turtle')
    await screen.findByRole('region', { name: /Turtle/i })
    const canvas = screen.getByTestId('turtle-canvas')
    stubBoundingClientRect(canvas, { width: 200, height: 200 })

    const before = svgViewBoxNumbers(canvas)
    fireEvent.wheel(canvas, {
      clientX: 100,
      clientY: 100,
      ctrlKey: true,
      deltaY: 120,
    })
    const after = svgViewBoxNumbers(canvas)

    expect(after[2]).toBeGreaterThan(before[2])
    expect(after[3]).toBeGreaterThan(before[3])
  })

  it('registers turtle trackpad pinch handling with a non-passive wheel listener', async () => {
    const user = userEvent.setup()
    const addEventListener = vi.spyOn(SVGElement.prototype, 'addEventListener')
    render(<App />)

    await user.type(screen.getByLabelText(/Imports list/i), 'turtle')
    await screen.findByRole('region', { name: /Turtle/i })

    await waitFor(() =>
      expect(addEventListener).toHaveBeenCalledWith(
        'wheel',
        expect.any(Function),
        { passive: false },
      ),
    )
  })

  it('lets students resize the right sidebar', () => {
    render(<App />)

    const sidebar = screen.getByLabelText(/Runtime sidebar/i)
    const handle = screen.getByRole('separator', {
      name: /Resize right sidebar/i,
    })

    expect(sidebar).toHaveStyle({ width: '420px' })

    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 420, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 420, pointerId: 1 })

    expect(sidebar).toHaveStyle({ width: '500px' })
  })

  it('keeps execution controls in a sticky sidebar header', () => {
    render(<App />)

    const sidebar = screen.getByLabelText(/Runtime sidebar/i)
    const executionBar = sidebar.querySelector('.execution-bar')

    expect(executionBar).toBeInTheDocument()
    expect(executionBar).toContainElement(
      screen.getByRole('button', { name: /^Reset$/i }),
    )
    expect(executionBar).toContainElement(
      screen.getByRole('button', { name: /^Step$/i }),
    )
    expect(executionBar).toContainElement(
      screen.getByRole('button', { name: /^Auto Step$/i }),
    )
    expect(executionBar).toContainElement(
      screen.getByRole('button', { name: /^Run$/i }),
    )
    expect(executionBar).toContainElement(
      screen.getByRole('slider', { name: /^Auto Step speed$/i }),
    )
  })

  it('shows escape effects when output strings contain newlines', async () => {
    const user = userEvent.setup()
    render(<App />)

    importProgramFromFileMenu(
      new File([JSON.stringify(newlineOutputProgram)], 'newline.json', {
        type: 'application/json',
      }),
    )

    await screen.findByDisplayValue('"hello\\ngoodbye"')
    await user.click(screen.getByRole('button', { name: /Run/i }))

    const output = screen.getByRole('region', { name: /Output/i })
    const outputLine = output.querySelector('.console-line')

    expect(outputLine?.querySelector('br')).toBeInTheDocument()
    expect(outputLine?.childNodes[0]?.textContent).toBe('hello')
    expect(outputLine?.childNodes[2]?.textContent).toBe('goodbye')
  })

  it('asks for input from ask calls and resumes execution with the answer', async () => {
    const user = userEvent.setup()
    render(<App />)

    importProgramFromFileMenu(
      new File([JSON.stringify(askProgram)], 'ask.json', {
        type: 'application/json',
      }),
    )

    await screen.findByDisplayValue('x <- ask() + 1')
    await user.click(screen.getByRole('button', { name: /Run/i }))

    const dialog = await screen.findByRole('dialog', {
      name: /Input requested/i,
    })
    await user.type(
      within(dialog).getByRole('textbox', { name: /^Input$/i }),
      '6',
    )
    await user.click(within(dialog).getByRole('button', { name: /Submit/i }))

    expect(screen.queryByRole('dialog', { name: /Input requested/i })).toBeNull()
    expect(screen.getByRole('region', { name: /Output/i })).toHaveTextContent(
      '7',
    )
    expect(screen.getByText(/Halted/i)).toBeInTheDocument()
  })

  it('shows current variable values in the right sidebar', async () => {
    const user = userEvent.setup()
    render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    await user.clear(screen.getByLabelText(/Input queue/i))
    await user.type(screen.getByLabelText(/Input queue/i), '3')
    await user.click(screen.getByRole('button', { name: /Run/i }))

    const variables = screen.getByLabelText(/Variables/i)

    expect(variables).toHaveTextContent('n')
    expect(variables).toHaveTextContent('0')
    expect(variables).toHaveTextContent('total')
    expect(variables).toHaveTextContent('6')
  })

  it('truncates long multiline variable values in the right sidebar', async () => {
    const user = userEvent.setup()
    render(<App />)

    importProgramFromFileMenu(
      new File(
        [JSON.stringify(multilineVariableProgram)],
        'multiline.json',
        { type: 'application/json' },
      ),
    )

    await screen.findByDisplayValue(/line one/)
    await user.click(screen.getByRole('button', { name: /Run/i }))

    const variables = screen.getByLabelText(/Variables/i)
    const value = within(variables).getByText((_, element) => {
      return element?.tagName === 'DD'
    })

    expect(value.textContent).toBe(
      '"line one\nline two\nline three\nline four\n...',
    )
    expect(value).not.toHaveTextContent('line five')
    expect(value).not.toHaveTextContent('line six')
  })

  it('highlights the current node during step-through execution', async () => {
    const user = userEvent.setup()
    render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    await user.click(screen.getByRole('button', { name: /Reset/i }))

    expect(screen.getByTestId('flow-node-main')).toHaveAttribute(
      'data-current',
      'true',
    )
  })

  it('marks the current node semantically without a separate badge', async () => {
    const user = userEvent.setup()
    render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    await user.click(screen.getByRole('button', { name: /Reset/i }))

    const currentNode = screen.getByTestId('flow-node-main')
    expect(currentNode).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByTestId('current-node-marker')).not.toBeInTheDocument()
  })

  it('automatically steps at the selected speed and can be paused', async () => {
    const user = userEvent.setup()
    render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    vi.useFakeTimers()

    const stepsStatus = within(
      screen.getByLabelText(/Runtime sidebar/i),
    ).getByText(/^Steps$/i).closest('div')
    const speed = screen.getByRole('slider', { name: /^Auto Step speed$/i })

    fireEvent.click(screen.getByRole('button', { name: /^Auto Step$/i }))

    expect(screen.getByRole('button', { name: /^Pause$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Step$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Run$/i })).toBeDisabled()
    expect(screen.getByTestId('flow-node-main')).toHaveAttribute(
      'data-current',
      'true',
    )
    expect(stepsStatus).toHaveTextContent('0')

    act(() => vi.advanceTimersByTime(500))

    expect(stepsStatus).toHaveTextContent('1')
    expect(screen.getByTestId('flow-node-input-n')).toHaveAttribute(
      'data-current',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: /^Pause$/i }))
    act(() => vi.advanceTimersByTime(2_000))

    expect(stepsStatus).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /^Auto Step$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Step$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Run$/i })).toBeEnabled()

    fireEvent.change(speed, { target: { value: '4' } })
    expect(screen.getByText('4 steps/s')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Auto Step$/i }))

    act(() => vi.advanceTimersByTime(249))
    expect(stepsStatus).toHaveTextContent('1')

    act(() => vi.advanceTimersByTime(1))
    expect(stepsStatus).toHaveTextContent('2')

    for (let step = 0; step < 20; step += 1) {
      act(() => vi.advanceTimersByTime(250))
    }

    expect(screen.getByText(/^Halted$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Auto Step$/i })).toBeEnabled()
    expect(screen.getByRole('region', { name: /Output/i })).toHaveTextContent(
      '6',
    )
  })

  it('continues Auto Step slowly after an ask response', async () => {
    render(<App />)

    importProgramFromFileMenu(
      new File([JSON.stringify(askProgram)], 'ask.json', {
        type: 'application/json',
      }),
    )
    await screen.findByDisplayValue('x <- ask() + 1')

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: /^Auto Step$/i }))

    act(() => vi.advanceTimersByTime(500))
    act(() => vi.advanceTimersByTime(500))

    const dialog = screen.getByRole('dialog', {
      name: /Input requested/i,
    })
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /^Input$/i }),
      { target: { value: '6' } },
    )
    fireEvent.submit(dialog)

    expect(screen.queryByRole('dialog', { name: /Input requested/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^Pause$/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Output/i })).not.toHaveTextContent(
      '7',
    )

    act(() => vi.advanceTimersByTime(500))

    expect(screen.getByRole('region', { name: /Output/i })).toHaveTextContent(
      '7',
    )
  })

  it('shows the active function input queue while stepping through a helper', async () => {
    const user = userEvent.setup()
    render(<App />)

    const programFile = new File(
      [JSON.stringify(helperCallProgram)],
      'helper-call.json',
      { type: 'application/json' },
    )
    importProgramFromFileMenu(programFile)

    await screen.findByDisplayValue(`total <- helper([1, 2, 3], 'hello', 7)`)
    expect(screen.getByLabelText(/Current document/i)).toHaveTextContent(
      'helper-call',
    )
    await user.click(screen.getByRole('button', { name: /Reset/i }))
    await user.click(screen.getByRole('button', { name: /^Step$/i }))
    await user.click(screen.getByRole('button', { name: /^Step$/i }))

    expect(screen.getByTestId('flow-node-helper')).toHaveAttribute(
      'data-current',
      'true',
    )
    expect(screen.getByLabelText(/Input queue/i)).toHaveValue(
      '[1, 2, 3]\n"hello"\n7',
    )
  })

  it('renders While blocks as diamonds with the true branch from the side', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    expect(screen.getByTestId('flow-node-while-n')).toHaveAttribute(
      'data-shape',
      'diamond',
    )
    expect(
      container.querySelector('[data-handleid="while-true"]'),
    ).toHaveStyle({ left: '15px' })
    expect(
      container.querySelector('[data-handleid="while-true"]'),
    ).toHaveStyle({ transform: 'translateY(-50%)' })
    expect(
      container.querySelector('[data-handleid="while-true-right"]'),
    ).not.toBeInTheDocument()

    const trueEdge = sampleProgram.edges.find(
      (edge) => edge.id === 'edge-while-add',
    )
    const falseEdge = sampleProgram.edges.find(
      (edge) => edge.id === 'edge-while-output',
    )

    expect(trueEdge && sourceHandleForProgramEdge(sampleProgram, trueEdge)).toBe(
      'while-true',
    )
    expect(
      falseEdge && sourceHandleForProgramEdge(sampleProgram, falseEdge),
    ).toBe('while-false')
  })

  it('uses parallelograms only for Input and Output blocks', async () => {
    const user = userEvent.setup()
    render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    const inputNode = screen.getByTestId('flow-node-input-n')
    const outputNode = screen.getByTestId('flow-node-show-total')

    expect(inputNode).toHaveAttribute('data-shape', 'parallelogram')
    expect(outputNode).toHaveAttribute('data-shape', 'parallelogram')
    expect(inputNode.querySelector('[data-handlepos="top"]')).toBeInTheDocument()
    expect(inputNode.querySelector('[data-handlepos="bottom"]')).toBeInTheDocument()
    expect(outputNode.querySelector('[data-handlepos="top"]')).toBeInTheDocument()
    expect(outputNode.querySelector('[data-handlepos="bottom"]')).toBeInTheDocument()
    expect(screen.getByTestId('flow-node-init-total')).toHaveAttribute(
      'data-shape',
      'block',
    )
    expect(screen.getByTestId('flow-node-return')).toHaveAttribute(
      'data-shape',
      'block',
    )
    expect(screen.getByTestId('flow-node-while-n')).toHaveAttribute(
      'data-shape',
      'diamond',
    )
  })

  it('shows left and right true branch handles before a diamond branch is used', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const addIfButton = screen.getByRole('button', { name: /^If$/i })

    await user.click(addIfButton)
    placePendingNodeOnPane(container.querySelector('.react-flow__pane') as Element)

    const ifNode = screen.getByTestId('flow-node-if-1')

    expect(
      ifNode.querySelector('[data-handleid="if-true"]'),
    ).toHaveStyle({ left: '15px' })
    expect(
      ifNode.querySelector('[data-handleid="if-true-right"]'),
    ).toHaveStyle({
      right: '15px',
      transform: 'translateY(-50%)',
    })
  })

  it('keeps a right-side true branch handle when routed edges are recomputed', () => {
    const selectedEdges = programToEdges(sampleProgram).map((edge) =>
      edge.id === 'edge-while-add'
        ? { ...edge, sourceHandle: 'while-true-right' }
        : edge,
    )
    const routedEdges = programToEdges(sampleProgram, selectedEdges)
    const trueEdge = routedEdges.find((edge) => edge.id === 'edge-while-add')

    expect(trueEdge?.sourceHandle).toBe('while-true-right')
  })

  it('routes loop-back wires into the incoming wire above decision diamonds', () => {
    const loopBackEdge = sampleProgram.edges.find(
      (edge) => edge.id === 'edge-dec-while',
    )
    const joinOffset =
      loopBackEdge &&
      loopbackJoinOffsetForProgramEdge(sampleProgram, loopBackEdge)

    expect(
      loopBackEdge && edgeTypeForProgramEdge(sampleProgram, loopBackEdge),
    ).toBe('loopback')
    expect(
      loopBackEdge && targetHandleForProgramEdge(sampleProgram, loopBackEdge),
    ).toBeUndefined()
    expect(joinOffset).toBeGreaterThanOrEqual(16)

    const loopbackPath = getLoopbackPath(100, 500, 300, 350, 20)

    expect(loopbackPath).toBe(
      'M100 500L100 528L-80 528L-80 330L300 330L300 350',
    )
    expect(loopbackPath).not.toContain('C')
    expect(loopbackPath).toMatch(/300 350$/)
  })

  it('centers the default while block on the vertical flow spine', () => {
    const initTotal = sampleNode('init-total')
    const whileNode = sampleNode('while-n')
    const showTotal = sampleNode('show-total')

    const spineCenter = nodeCenterX(initTotal, BLOCK_NODE_RENDERED_WIDTH)

    expect(nodeCenterX(whileNode, DECISION_NODE_RENDERED_WIDTH)).toBe(
      spineCenter,
    )
    expect(nodeCenterX(showTotal, BLOCK_NODE_RENDERED_WIDTH)).toBe(spineCenter)
  })

  it('uses the normal top node point for loop-back targets', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    expect(
      container.querySelector(`[data-handleid="${DECISION_LOOPBACK_TARGET_HANDLE}"]`),
    ).not.toBeInTheDocument()
    expect(
      container.querySelector(
        '[data-testid="flow-node-while-n"] [data-handlepos="top"]:not([data-handleid])',
      ),
    ).toBeInTheDocument()
  })

  it('does not draw a duplicate dot on loop-back wires', () => {
    const { container } = render(
      <svg>
        <LoopbackEdge
          id="loopback-test"
          source="assignment"
          target="while"
          sourceX={100}
          sourceY={500}
          targetX={300}
          targetY={350}
          sourcePosition={Position.Bottom}
          targetPosition={Position.Top}
          data={{ loopbackJoinOffset: 20 }}
        />
      </svg>,
    )

    expect(container.querySelector('.loopback-edge-dot')).not.toBeInTheDocument()
    expect(container.querySelector('.loopback-edge')).toHaveAttribute(
      'd',
      'M100 500L100 528L-80 528L-80 330L300 330L300 350',
    )
  })

  it('keeps selected wires selected when routed edges are recomputed', () => {
    const selectedEdges = programToEdges(sampleProgram).map((edge) =>
      edge.id === 'edge-dec-while' ? { ...edge, selected: true } : edge,
    )
    const routedEdges = programToEdges(sampleProgram, selectedEdges)
    const loopBackEdge = routedEdges.find((edge) => edge.id === 'edge-dec-while')

    expect(loopBackEdge).toMatchObject({
      selected: true,
      type: 'loopback',
    })
  })

  it('supports common keyboard delete keys for selected wires', () => {
    expect(DELETE_KEY_CODES).toEqual(['Backspace', 'Delete'])
  })

  it('uses left-drag marquee selection instead of left-drag canvas panning', () => {
    const { container } = render(<App />)
    const pane = container.querySelector('.react-flow__pane')

    expect(pane).toHaveClass('selection')
    expect(pane).not.toHaveClass('draggable')
  })

  it('selects a block on left click', async () => {
    const user = userEvent.setup()
    render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    const mainNode = screen.getByTestId('flow-node-main')
    fireEvent.click(mainNode)

    expect(mainNode.closest('.react-flow__node')).toHaveClass('selected')
  })

  it('copies, pastes, and undoes selected blocks with keyboard shortcuts', async () => {
    const user = userEvent.setup()
    render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    fireEvent.click(screen.getByTestId('flow-node-main'))
    fireEvent.keyDown(window, { key: 'c', metaKey: true })

    await screen.findByText('1 block copied.')

    fireEvent.keyDown(window, { key: 'v', metaKey: true })

    expect(await screen.findByTestId('flow-node-main-copy')).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('main')).toHaveLength(2)

    fireEvent.keyDown(window, { key: 'z', metaKey: true })

    await waitFor(() =>
      expect(screen.queryByTestId('flow-node-main-copy')).not.toBeInTheDocument(),
    )
    expect(screen.getAllByDisplayValue('main')).toHaveLength(1)
  })

  it('combines and splits a selected straight-line chain', async () => {
    const user = userEvent.setup()
    render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    fireEvent.click(screen.getByTestId('flow-node-add-n'))
    await user.keyboard('{Shift>}')
    fireEvent.click(screen.getByTestId('flow-node-dec-n'), { shiftKey: true })
    await user.keyboard('{/Shift}')
    expect(
      screen.getByTestId('flow-node-add-n').closest('.react-flow__node'),
    ).toHaveClass('selected')
    expect(
      screen.getByTestId('flow-node-dec-n').closest('.react-flow__node'),
    ).toHaveClass('selected')
    await chooseToolbarAction(user, 'Edit', 'Combine into Process')

    expect(screen.getByText('2 blocks combined into one Process.')).toBeInTheDocument()
    expect(screen.queryByTestId('flow-node-dec-n')).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('flow-node-add-n')).getByLabelText(
        /Process text/i,
      ),
    ).toHaveValue('total <- total + n\nn <- n - 1')

    await chooseToolbarAction(user, 'Edit', 'Split Process')

    expect(screen.getByText('Process split into 2 blocks.')).toBeInTheDocument()
    expect(screen.getByTestId('flow-node-assignment-1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('total <- total + n')).toBeInTheDocument()
    expect(screen.getByDisplayValue('n <- n - 1')).toBeInTheDocument()
  })

  it('selects a palette block and places it on the next canvas click', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const addIfButton = screen.getByRole('button', { name: /^If$/i })

    await user.click(addIfButton)

    expect(addIfButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('flow-node-if-1')).not.toBeInTheDocument()

    const pane = container.querySelector('.react-flow__pane')
    expect(pane).toBeInTheDocument()
    placePendingNodeOnPane(pane as Element)

    expect(addIfButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('flow-node-if-1')).toHaveAttribute(
      'data-shape',
      'diamond',
    )
  })

  it('places Function blocks with editable main text', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const addFunctionButton = screen.getByRole('button', {
      name: /^Function$/i,
    })

    await user.click(addFunctionButton)

    const pane = container.querySelector('.react-flow__pane')
    expect(pane).toBeInTheDocument()
    placePendingNodeOnPane(pane as Element)

    expect(screen.getByTestId('flow-node-function-1')).toHaveAttribute(
      'data-shape',
      'block',
    )
    expect(screen.getAllByDisplayValue('main')).toHaveLength(1)
  })

  it('places Classes with an open Method connector and Methods with an owner input', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const pane = container.querySelector('.react-flow__pane')

    expect(pane).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Class$/i }))
    placePendingNodeOnPane(pane as Element, 360, 220)

    const classNode = screen.getByTestId('flow-node-class-1')
    const classInput = screen.getByDisplayValue('Point(x, y)')

    expect(classNode).toHaveAttribute('data-shape', 'declaration')
    expect(
      classNode.querySelector(`[data-handleid="${CLASS_METHOD_NEW_HANDLE}"]`),
    ).toHaveAttribute('data-handlepos', 'bottom')
    expect(within(classNode).getByText('x')).toHaveClass('class-field')
    expect(within(classNode).getByText('y')).toHaveClass('class-field')

    await user.clear(classInput)
    await user.type(classInput, 'Vector(dx, dy)')
    await user.click(screen.getByRole('button', { name: /^Method$/i }))
    placePendingNodeOnPane(pane as Element, 640, 220)

    const methodNode = screen.getByTestId('flow-node-method-1')

    expect(screen.getByDisplayValue('move')).toBeInTheDocument()
    expect(
      methodNode.querySelector(`[data-handleid="${METHOD_OWNER_HANDLE}"]`),
    ).toHaveAttribute('data-handlepos', 'top')
    expect(methodNode.querySelector('[data-handlepos="bottom"]')).toBeInTheDocument()
  })

  it('opens a right-click comment dialog and shows comments inside blocks', async () => {
    const user = userEvent.setup()
    render(<App />)
    await chooseToolbarAction(user, 'Examples', 'Basic')

    fireEvent.contextMenu(screen.getByTestId('flow-node-main'))

    const dialog = await screen.findByRole('dialog', {
      name: /Block comment/i,
    })
    await user.type(
      within(dialog).getByRole('textbox', { name: /^Comment$/i }),
      'Count input values',
    )
    await user.click(within(dialog).getByRole('button', { name: /Save/i }))

    const mainNode = screen.getByTestId('flow-node-main')
    const comment = within(mainNode).getByText('Count input values')

    expect(screen.queryByRole('dialog', { name: /Block comment/i })).toBeNull()
    expect(comment).toHaveClass('node-comment')
    expect(comment.compareDocumentPosition(screen.getByDisplayValue('main'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('places Return blocks with editable return text', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const addReturnButton = screen.getByRole('button', { name: /^Return$/i })

    await user.click(addReturnButton)

    const pane = container.querySelector('.react-flow__pane')
    expect(pane).toBeInTheDocument()
    placePendingNodeOnPane(pane as Element)

    expect(screen.getByTestId('flow-node-return-1')).toHaveAttribute(
      'data-shape',
      'block',
    )
    expect(screen.getByDisplayValue('0')).toBeInTheDocument()
  })

  it('places For blocks as decision diamonds', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const addForButton = screen.getByRole('button', { name: /^For$/i })

    await user.click(addForButton)

    const pane = container.querySelector('.react-flow__pane')
    expect(pane).toBeInTheDocument()
    placePendingNodeOnPane(pane as Element)

    expect(screen.getByTestId('flow-node-for-1')).toHaveAttribute(
      'data-shape',
      'diamond',
    )
    expect(screen.getByDisplayValue('item in L')).toBeInTheDocument()
  })

  it('places Process blocks with editable multiline text', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const addProcessButton = screen.getByRole('button', { name: /^Process$/i })

    await user.click(addProcessButton)

    const pane = container.querySelector('.react-flow__pane')
    expect(pane).toBeInTheDocument()
    placePendingNodeOnPane(pane as Element)

    const processNode = screen.getByTestId('flow-node-process-1')
    expect(processNode).toHaveAttribute(
      'data-shape',
      'block',
    )
    const editor = within(processNode).getByLabelText(/Process text/i)
    expect(editor.tagName).toBe('TEXTAREA')
    expect(editor).toHaveValue('x <- 1\nsqrt(x)')
  })
})
