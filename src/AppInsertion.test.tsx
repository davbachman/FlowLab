import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { EditorEdge } from './lib/editorEdges'
import { CLASS_INIT_HANDLE, CLASS_METHOD_NEW_HANDLE, classMethodHandleId, METHOD_OWNER_HANDLE, WHILE_TRUE_RIGHT_HANDLE } from './lib/flowRouting'

interface TestNode {
  id: string
  position: { x: number; y: number }
  hidden?: boolean
  selected?: boolean
  width?: number
  data: { nodeType: string; text: string; onToggleCollapse?: (id: string) => void }
}

const flowProps: Record<string, unknown>[] = []
const flowInstance = {
  fitView: vi.fn(() => Promise.resolve(true)),
  screenToFlowPosition: vi.fn((point: { x: number; y: number }) => point),
}

vi.mock('@xyflow/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...original,
    Background: () => null,
    Controls: () => null,
    ReactFlow: function MockReactFlow(props: Record<string, unknown>) {
      flowProps.push(props)
      useEffect(() => {
        const onInit = props.onInit as ((instance: typeof flowInstance) => void)
        onInit?.(flowInstance)
      }, [props.onInit])
      return <div data-testid="flow-canvas" className="react-flow__pane">{props.children as React.ReactNode}</div>
    },
  }
})

function currentEdges(): EditorEdge[] {
  return flowProps.at(-1)?.edges as EditorEdge[]
}

function currentNodes(): TestNode[] {
  return flowProps.at(-1)?.nodes as TestNode[]
}

function graphSnapshot() {
  return {
    nodes: currentNodes().map((node) => ({
      id: node.id,
      position: node.position,
      type: node.data.nodeType,
      text: node.data.text,
    })),
    edges: currentEdges().map(({ id, source, target, label, sourceHandle }) => ({
      id, source, target, label, sourceHandle,
    })),
  }
}

async function openBasicExample(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Examples$/i }))
  await user.click(screen.getByRole('menuitem', { name: /^Basic$/i }))
}

function dragOutputIntoBlankCanvas(
  sourceId: string,
  sourceHandle: string | null = null,
  point = { x: 600, y: 400 },
) {
  const endConnection = flowProps.at(-1)?.onConnectEnd as (
    event: globalThis.MouseEvent,
    state: Record<string, unknown>,
  ) => void
  expect(endConnection).toBeTypeOf('function')
  const event = new window.MouseEvent('mouseup', { clientX: point.x, clientY: point.y })
  Object.defineProperty(event, 'target', { value: screen.getByTestId('flow-canvas') })
  act(() => endConnection(event, {
    isValid: false,
    fromNode: currentNodes().find((node) => node.id === sourceId),
    fromHandle: { id: sourceHandle, type: 'source', nodeId: sourceId },
    toNode: null,
    toHandle: null,
    from: { x: 200, y: 200 },
    to: point,
  }))
}

function doubleClickWire(edge: EditorEdge) {
  const onDoubleClick = flowProps.at(-1)?.onEdgeDoubleClick as (
    event: globalThis.MouseEvent,
    edge: EditorEdge,
  ) => void
  expect(onDoubleClick).toBeTypeOf('function')
  const event = new window.MouseEvent('dblclick', { clientX: 550, clientY: 350, cancelable: true })
  const stopPropagation = vi.spyOn(event, 'stopPropagation')
  act(() => onDoubleClick(event, edge))
  expect(event.defaultPrevented).toBe(true)
  expect(stopPropagation).toHaveBeenCalled()
}

describe('connected block insertion', () => {
  beforeEach(() => {
    flowProps.length = 0
    window.localStorage.clear()
    flowInstance.screenToFlowPosition.mockImplementation((point) => point)
  })

  it('creates and attaches a Method at a Class wire drop after pan and zoom, with one Undo and Redo', async () => {
    const user = userEvent.setup()
    flowInstance.screenToFlowPosition.mockImplementation(({ x, y }) => ({
      x: (x - 300) / 0.5,
      y: (y - 80) / 0.5,
    }))
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Examples' }))
    await user.click(screen.getByRole('menuitem', { name: 'Object' }))
    const source = currentNodes().find((node) => node.data.nodeType === 'class')!
    // A customized Class must still grow to fit its extra Method connector.
    const changeNodes = flowProps.at(-1)?.onNodesChange as (changes: unknown[]) => void
    act(() => changeNodes([{ id: source.id, type: 'dimensions', dimensions: { width: 224, height: 138 }, setAttributes: true }]))
    const before = graphSnapshot()

    dragOutputIntoBlankCanvas(source.id, CLASS_METHOD_NEW_HANDLE, { x: 600, y: 400 })

    const method = currentNodes().find((node) => !before.nodes.some((original) => original.id === node.id))!
    expect(method).toMatchObject({
      position: { x: 503, y: 599 },
      selected: true,
      data: { nodeType: 'method', text: '' },
    })
    expect(screen.queryByRole('dialog', { name: /block/i })).not.toBeInTheDocument()
    expect(currentNodes().find((node) => node.id === source.id)?.width).toBe(394)
    await waitFor(() => expect(currentEdges()).toContainEqual(expect.objectContaining({
      source: source.id,
      sourceHandle: classMethodHandleId(method.id),
      target: method.id,
      targetHandle: METHOD_OWNER_HANDLE,
    })))
    expect(currentEdges()).toHaveLength(before.edges.length + 1)
    expect(graphSnapshot().edges).toEqual(expect.arrayContaining(before.edges))
    expect(graphSnapshot().nodes.slice(0, -1)).toEqual(before.nodes)
    const connected = graphSnapshot()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('menuitem', { name: 'Undo' }))
    expect(graphSnapshot()).toEqual(before)
    expect(currentNodes().find((node) => node.id === source.id)?.width).toBe(224)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('menuitem', { name: 'Redo' }))
    expect(graphSnapshot()).toEqual(connected)
    expect(currentNodes().find((node) => node.id === source.id)?.width).toBe(394)

    dragOutputIntoBlankCanvas(source.id, CLASS_METHOD_NEW_HANDLE, { x: 750, y: 450 })
    expect(currentNodes()).toHaveLength(before.nodes.length + 2)
    expect(new Set(currentNodes().map((node) => node.id)).size).toBe(currentNodes().length)
    expect(currentEdges()).toHaveLength(before.edges.length + 2)
  })

  it('ignores drops from an existing Class Method connector', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Examples' }))
    await user.click(screen.getByRole('menuitem', { name: 'Object' }))
    const source = currentNodes().find((node) => node.data.nodeType === 'class')!
    const before = graphSnapshot()
    const attachment = currentEdges().find((edge) => edge.source === source.id && edge.sourceHandle !== CLASS_INIT_HANDLE)!

    dragOutputIntoBlankCanvas(source.id, attachment.sourceHandle)

    expect(graphSnapshot()).toEqual(before)
    expect(screen.queryByRole('dialog', { name: /block/i })).not.toBeInTheDocument()
  })

  it('creates init Inputs from Class drops, preserves Methods, and extends the init with another Input', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Examples' }))
    await user.click(screen.getByRole('menuitem', { name: 'Object' }))
    const source = currentNodes().find((node) => node.data.nodeType === 'class')!
    const before = graphSnapshot()
    const methods = currentEdges().filter((edge) => edge.source === source.id && edge.sourceHandle !== CLASS_INIT_HANDLE)

    dragOutputIntoBlankCanvas(source.id, CLASS_INIT_HANDLE, { x: 800, y: 500 })
    const input = currentNodes().at(-1)!
    expect(input).toMatchObject({ position: { x: 703, y: 450.5 }, selected: true, data: { nodeType: 'input', text: '' } })
    expect(currentEdges().filter((edge) => edge.source === source.id && edge.sourceHandle === CLASS_INIT_HANDLE)).toEqual([
      expect.objectContaining({ target: input.id }),
    ])
    expect(currentEdges()).toEqual(expect.arrayContaining(methods))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const connected = graphSnapshot()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('menuitem', { name: 'Undo' }))
    expect(graphSnapshot()).toEqual(before)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('menuitem', { name: 'Redo' }))
    expect(graphSnapshot()).toEqual(connected)

    dragOutputIntoBlankCanvas(input.id, null, { x: 800, y: 700 })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.click(screen.getByRole('option', { name: 'Input' }))
    expect(currentNodes().at(-1)?.data.nodeType).toBe('input')
    expect(currentEdges()).toContainEqual(expect.objectContaining({ source: input.id, target: currentNodes().at(-1)!.id }))

    const valid = flowProps.at(-1)?.isValidConnection as (connection: Record<string, string | null>) => boolean
    expect(valid({ source: source.id, sourceHandle: CLASS_INIT_HANDLE, target: 'point-move', targetHandle: METHOD_OWNER_HANDLE })).toBe(false)
    expect(valid({ source: source.id, sourceHandle: CLASS_METHOD_NEW_HANDLE, target: input.id, targetHandle: null })).toBe(false)
    expect(valid({ source: source.id, sourceHandle: CLASS_INIT_HANDLE, target: 'move-dx', targetHandle: null })).toBe(false)
    expect(valid({ source: input.id, sourceHandle: null, target: 'move-x', targetHandle: null })).toBe(false)
    expect(valid({ source: currentNodes().at(-1)!.id, sourceHandle: null, target: input.id, targetHandle: null })).toBe(false)
  })

  it('places connected blocks over hidden function bodies without moving or removing those bodies', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openBasicExample(user)
    const hiddenBlock = currentNodes().find((node) => node.id === 'input-n')!
    const main = currentNodes().find((node) => node.id === 'main')!
    act(() => main.data.onToggleCollapse!(main.id))
    expect(currentNodes().find((node) => node.id === hiddenBlock.id)?.hidden).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Function' }))
    const place = flowProps.at(-1)?.onPaneClick as (event: globalThis.MouseEvent) => void
    act(() => place(new window.MouseEvent('click', { clientX: 2000, clientY: 1000 })))
    const source = currentNodes().at(-1)!
    dragOutputIntoBlankCanvas(source.id, null, { x: hiddenBlock.position.x + 142, y: hiddenBlock.position.y + 56 })
    await user.click(screen.getByRole('option', { name: 'Process' }))
    expect(currentNodes().at(-1)?.position).toEqual(hiddenBlock.position)
    expect(currentNodes().find((node) => node.id === hiddenBlock.id)).toMatchObject({
      hidden: true, position: hiddenBlock.position,
    })
  })

  it.each([
    { name: 'Return', width: 194, height: 82 },
    { name: 'Process', width: 284, height: 112 },
    { name: 'If', width: 188, height: 142 },
  ])('centers a connected $name at the wire drop near another block after pan and zoom', async ({ name, width, height }) => {
    const user = userEvent.setup()
    flowInstance.screenToFlowPosition.mockImplementation(({ x, y }) => ({
      x: (x - 300) / 0.5,
      y: (y - 80) / 0.5,
    }))
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Function' }))
    const placeNode = flowProps.at(-1)?.onPaneClick as (event: globalThis.MouseEvent) => void
    act(() => placeNode(new window.MouseEvent('click', { clientX: 348.5, clientY: 100.5 })))
    const source = currentNodes()[0]
    expect(source.position).toEqual({ x: 0, y: 0 })
    const before = graphSnapshot()

    // Leave 12 flow pixels below the source: visible blank space, but inside
    // the old automatic layout margin that moved connected blocks sideways.
    const drop = { x: 360, y: 80 + (94 + height / 2) * 0.5 }
    dragOutputIntoBlankCanvas(source.id, null, drop)
    await user.type(screen.getByRole('combobox'), name)
    await user.click(screen.getByRole('option', { name }))

    const added = currentNodes().find((node) => node.id !== source.id)!
    expect(added.position).toEqual({ x: 120 - width / 2, y: 94 })
    expect(added.data.text).toBe('')
    expect(currentNodes().find((node) => node.id === source.id)?.position).toEqual(source.position)
    expect(currentEdges()).toContainEqual(expect.objectContaining({ source: source.id, target: added.id }))
    const connected = graphSnapshot()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('menuitem', { name: 'Undo' }))
    expect(graphSnapshot()).toEqual(before)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('menuitem', { name: 'Redo' }))
    expect(graphSnapshot()).toEqual(connected)
  })

  it('double-clicks a branch wire to insert a block and restores the whole change with one Undo', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openBasicExample(user)

    const onConnect = flowProps.at(-1)?.onConnect as (connection: Record<string, string | null>) => void
    act(() => onConnect({
      source: 'while-n', target: 'add-n', sourceHandle: WHILE_TRUE_RIGHT_HANDLE, targetHandle: null,
    }))
    const before = graphSnapshot()
    const incoming = currentEdges().find((edge) => edge.source === 'while-n' && edge.label === 'true')!
    doubleClickWire(incoming)

    expect(screen.getByRole('dialog', { name: /block/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Return$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^If$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Function$/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /^Output$/i }))

    const inserted = currentNodes().find((node) => !before.nodes.some((original) => original.id === node.id))!
    expect(inserted.data.nodeType).toBe('output')
    expect(inserted.data.text).toBe('')
    expect(currentEdges()).toContainEqual(expect.objectContaining({
      id: incoming.id, source: 'while-n', target: inserted.id, label: 'true', sourceHandle: WHILE_TRUE_RIGHT_HANDLE,
    }))
    expect(currentEdges()).toContainEqual(expect.objectContaining({ source: inserted.id, target: 'add-n' }))
    expect(currentEdges()).toContainEqual(expect.objectContaining({ source: 'while-n', target: 'show-total', label: 'false' }))

    await user.click(screen.getByRole('button', { name: /^Edit$/i }))
    await user.click(screen.getByRole('menuitem', { name: /^Undo$/i }))
    expect(graphSnapshot()).toEqual(before)
  })

  it('opens insertion on a loopback wire and leaves the graph unchanged when cancelled', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openBasicExample(user)
    const before = graphSnapshot()
    const loopback = currentEdges().find((edge) => edge.source === 'add-n' && edge.target === 'while-n')!
    expect(loopback.type).toBe('loopback')
    doubleClickWire(loopback)
    expect(screen.getByRole('option', { name: 'Output' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(graphSnapshot()).toEqual(before)
  })

  it('keeps empty-canvas double click separate from wire insertion', async () => {
    render(<App />)
    fireEvent.doubleClick(screen.getByTestId('flow-canvas'), { clientX: 500, clientY: 300 })
    expect(screen.getByRole('option', { name: 'Function' })).toBeInTheDocument()
    expect(currentNodes()).toHaveLength(0)
  })

  it('offers Process and excludes Assignment in quick add and wire insertion', async () => {
    const user = userEvent.setup()
    render(<App />)
    fireEvent.doubleClick(screen.getByTestId('flow-canvas'), { clientX: 500, clientY: 300 })
    await user.type(screen.getByRole('combobox'), 'Assignment')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await openBasicExample(user)
    dragOutputIntoBlankCanvas('input-n')
    expect(screen.getByRole('option', { name: 'Process' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Assignment' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    doubleClickWire(currentEdges().find((edge) => edge.source === 'input-n')!)
    expect(screen.getByRole('option', { name: 'Process' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Assignment' })).not.toBeInTheDocument()
  })

  it('ignores double click on class-to-method attachments', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Examples' }))
    await user.click(screen.getByRole('menuitem', { name: 'Object' }))
    const before = graphSnapshot()
    const classIds = new Set(currentNodes().filter((node) => node.data.nodeType === 'class').map((node) => node.id))
    const attachment = currentEdges().find((edge) => classIds.has(edge.source))!
    expect(attachment).toBeDefined()
    doubleClickWire(attachment)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(graphSnapshot()).toEqual(before)
  })

  it('offers keyboard insertion for a selected wire through the Edit menu', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openBasicExample(user)
    const edge = currentEdges().find((candidate) => candidate.source === 'input-n')!
    const select = flowProps.at(-1)?.onEdgesChange as (changes: unknown[]) => void
    act(() => select([{ id: edge.id, type: 'select', selected: true }]))
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('menuitem', { name: 'Insert block on selected wire' }))
    expect(screen.getByRole('combobox')).toHaveFocus()
    expect(screen.getByRole('option', { name: 'Process' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Function' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus()
  })

  it('keeps an occupied wire intact when the connected chooser is cancelled', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openBasicExample(user)
    const before = graphSnapshot()

    dragOutputIntoBlankCanvas('input-n')
    expect(screen.getByRole('dialog', { name: /block/i })).toBeInTheDocument()
    expect(graphSnapshot()).toEqual(before)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: /block/i })).not.toBeInTheDocument()
    expect(graphSnapshot()).toEqual(before)
  })

  it('connects a block dropped from a branch output while preserving the other branch', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openBasicExample(user)
    const before = graphSnapshot()

    dragOutputIntoBlankCanvas('while-n', WHILE_TRUE_RIGHT_HANDLE)
    expect(screen.queryByRole('option', { name: /^Function$/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /^Return$/i }))

    const inserted = currentNodes().find((node) => !before.nodes.some((original) => original.id === node.id))!
    expect(inserted.data.nodeType).toBe('return')
    expect(inserted.data.text).toBe('')
    expect(currentEdges().filter((edge) => edge.source === 'while-n' && edge.label === 'true')).toEqual([
      expect.objectContaining({ source: 'while-n', target: inserted.id, label: 'true', sourceHandle: WHILE_TRUE_RIGHT_HANDLE }),
    ])
    expect(currentEdges()).toContainEqual(expect.objectContaining({ source: 'while-n', target: 'show-total', label: 'false' }))

    await user.click(screen.getByRole('button', { name: /^Edit$/i }))
    await user.click(screen.getByRole('menuitem', { name: /^Undo$/i }))
    expect(graphSnapshot()).toEqual(before)
  })
})
