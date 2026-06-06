import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Position } from '@xyflow/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { LoopbackEdge } from './components/LoopbackEdge'
import { DELETE_KEY_CODES, programToEdges } from './lib/editorEdges'
import { registerFlowLabProgram } from './lib/imports'
import {
  DECISION_LOOPBACK_TARGET_HANDLE,
  edgeTypeForProgramEdge,
  getLoopbackPath,
  loopbackJoinOffsetForProgramEdge,
  sourceHandleForProgramEdge,
  targetHandleForProgramEdge,
} from './lib/flowRouting'
import { sampleProgram } from './lib/sampleProgram'
import type { Program } from './lib/types'

type TestSaveFilePicker = (options: unknown) => Promise<{
  createWritable: () => Promise<{
    write: (value: Blob) => Promise<void>
    close: () => Promise<void>
  }>
}>

interface TestWindowWithSavePicker extends Window {
  showSaveFilePicker?: TestSaveFilePicker
}

const BLOCK_NODE_RENDERED_WIDTH = 194
const DECISION_NODE_RENDERED_WIDTH = 188

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
      text: 'result <- len(L) + len(word) + n',
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

describe('App', () => {
  afterEach(() => {
    delete (window as TestWindowWithSavePicker).showSaveFilePicker
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders the classroom editor shell', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: /FlowLab/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Add Assignment/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Add Function/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Add Return/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Add Call/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Add For/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Export JSON/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clear/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Input queue/i)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Imports/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/FlowLab files/i)).toBeInTheDocument()
  })

  it('loads callable helper functions from named FlowLab files', async () => {
    const user = userEvent.setup()
    registerFlowLabProgram('helpers.json', importedHelperProgram)
    render(<App />)

    await user.type(screen.getByLabelText(/FlowLab files/i), 'helpers')

    expect(await screen.findByText(/Callable: helper/i)).toBeInTheDocument()
  })

  it('runs block expressions that call imported helper functions', async () => {
    const user = userEvent.setup()
    registerFlowLabProgram('helpers.json', importedHelperProgram)
    render(<App />)

    await user.type(screen.getByLabelText(/FlowLab files/i), 'helpers')
    await screen.findByText(/Callable: helper/i)
    await user.click(screen.getByRole('button', { name: /Load Sample/i }))

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

    await user.click(screen.getByRole('button', { name: /Load Sample/i }))

    expect(screen.getByTestId('flow-node-main')).toBeInTheDocument()
    expect(screen.getByDisplayValue('total <- 0')).toBeInTheDocument()
    expect(screen.getByLabelText(/Input queue/i)).toHaveValue('3')
  })

  it('clears all flowchart nodes from the top toolbar', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Load Sample/i }))

    expect(screen.getByTestId('flow-node-main')).toBeInTheDocument()
    expect(screen.getByDisplayValue('total <- 0')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Clear/i }))

    expect(screen.queryByTestId('flow-node-main')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('total <- 0')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Input queue/i)).toHaveValue('3')
    expect(screen.getByText(/exactly one main Function/i)).toBeInTheDocument()
  })

  it('lets students edit flowchart node text', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Load Sample/i }))

    const assignment = screen.getByDisplayValue('total <- 0')
    await user.clear(assignment)
    await user.type(assignment, 'total <- 1')

    expect(screen.getByDisplayValue('total <- 1')).toBeInTheDocument()
  })

  it('lets students edit function names', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Load Sample/i }))

    const mainFunction = screen.getByDisplayValue('main')
    await user.clear(mainFunction)
    await user.type(mainFunction, 'helper')

    expect(screen.getByDisplayValue('helper')).toBeInTheDocument()
  })

  it('opens a save-file dialog when exporting JSON', async () => {
    const user = userEvent.setup()
    const write = vi.fn<(value: Blob) => Promise<void>>(() => Promise.resolve())
    const close = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const createWritable = vi.fn(() => Promise.resolve({ write, close }))
    const showSaveFilePicker = vi.fn<TestSaveFilePicker>(() =>
      Promise.resolve({ createWritable }),
    )

    ;(window as TestWindowWithSavePicker).showSaveFilePicker = showSaveFilePicker

    render(<App />)

    await user.click(screen.getByRole('button', { name: /Export JSON/i }))

    await waitFor(() => expect(showSaveFilePicker).toHaveBeenCalledTimes(1))
    expect(showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: 'flowlab-program.json',
      types: [
        {
          description: 'FlowLab program JSON',
          accept: { 'application/json': ['.json'] },
        },
      ],
    })
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))

    const exportedBlob = write.mock.calls[0]?.[0]
    expect(exportedBlob).toBeInstanceOf(Blob)
    expect(JSON.parse(await exportedBlob.text())).toMatchObject({
      version: 1,
      nodes: expect.any(Array),
      edges: expect.any(Array),
    })
  })

  it('falls back to download-link export when save-file dialogs are unavailable', async () => {
    const user = userEvent.setup()
    const click = vi.fn()
    const createElement = vi.spyOn(document, 'createElement')
    createElement.mockImplementation((tagName, options) => {
      const element = Document.prototype.createElement.call(
        document,
        tagName,
        options,
      )

      if (tagName.toLowerCase() === 'a') {
        Object.defineProperty(element, 'click', {
          configurable: true,
          value: click,
        })
      }

      return element
    })

    render(<App />)

    await user.click(screen.getByRole('button', { name: /Export JSON/i }))

    expect(click).toHaveBeenCalledTimes(1)
  })

  it('runs the sample program with queued input and shows output', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Load Sample/i }))

    await user.clear(screen.getByLabelText(/Input queue/i))
    await user.type(screen.getByLabelText(/Input queue/i), '3')
    await user.click(screen.getByRole('button', { name: /Run/i }))

    expect(screen.getByRole('region', { name: /Output/i })).toHaveTextContent(
      '6',
    )
    expect(screen.getByText(/Halted/i)).toBeInTheDocument()
  })

  it('shows current variable values in the right sidebar', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Load Sample/i }))

    await user.clear(screen.getByLabelText(/Input queue/i))
    await user.type(screen.getByLabelText(/Input queue/i), '3')
    await user.click(screen.getByRole('button', { name: /Run/i }))

    const variables = screen.getByLabelText(/Variables/i)

    expect(variables).toHaveTextContent('n')
    expect(variables).toHaveTextContent('0')
    expect(variables).toHaveTextContent('total')
    expect(variables).toHaveTextContent('6')
  })

  it('highlights the current node during step-through execution', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Load Sample/i }))

    await user.click(screen.getByRole('button', { name: /Reset/i }))

    expect(screen.getByTestId('flow-node-main')).toHaveAttribute(
      'data-current',
      'true',
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
    fireEvent.change(screen.getByLabelText(/Import JSON/i), {
      target: { files: [programFile] },
    })

    await screen.findByDisplayValue(`total <- helper([1, 2, 3], 'hello', 7)`)
    await user.click(screen.getByRole('button', { name: /Reset/i }))
    await user.click(screen.getByRole('button', { name: /Step/i }))
    await user.click(screen.getByRole('button', { name: /Step/i }))

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
    await user.click(screen.getByRole('button', { name: /Load Sample/i }))

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
    await user.click(screen.getByRole('button', { name: /Load Sample/i }))

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
    await user.click(screen.getByRole('button', { name: /Load Sample/i }))

    const mainNode = screen.getByTestId('flow-node-main')
    fireEvent.click(mainNode)

    expect(mainNode.closest('.react-flow__node')).toHaveClass('selected')
  })

  it('copies, pastes, and undoes selected blocks with keyboard shortcuts', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Load Sample/i }))

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

  it('selects a palette block and places it on the next canvas click', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const addIfButton = screen.getByRole('button', { name: /Add If/i })

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
      name: /Add Function/i,
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

  it('places Return blocks with editable return text', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const addReturnButton = screen.getByRole('button', { name: /Add Return/i })

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
    const addForButton = screen.getByRole('button', { name: /Add For/i })

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
})
