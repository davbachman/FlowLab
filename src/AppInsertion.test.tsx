import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { EditorEdge } from './lib/editorEdges'
import { WHILE_TRUE_RIGHT_HANDLE } from './lib/flowRouting'

interface TestNode {
  id: string
  position: { x: number; y: number }
  data: { nodeType: string; text: string }
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
    expect(currentEdges().filter((edge) => edge.source === 'while-n' && edge.label === 'true')).toEqual([
      expect.objectContaining({ source: 'while-n', target: inserted.id, label: 'true', sourceHandle: WHILE_TRUE_RIGHT_HANDLE }),
    ])
    expect(currentEdges()).toContainEqual(expect.objectContaining({ source: 'while-n', target: 'show-total', label: 'false' }))

    await user.click(screen.getByRole('button', { name: /^Edit$/i }))
    await user.click(screen.getByRole('menuitem', { name: /^Undo$/i }))
    expect(graphSnapshot()).toEqual(before)
  })
})
