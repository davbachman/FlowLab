import { act, render, screen } from '@testing-library/react'
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
  screenToFlowPosition: (point: { x: number; y: number }) => point,
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

function dragOutputIntoBlankCanvas(sourceId: string, sourceHandle: string | null = null) {
  const endConnection = flowProps.at(-1)?.onConnectEnd as (
    event: globalThis.MouseEvent,
    state: Record<string, unknown>,
  ) => void
  expect(endConnection).toBeTypeOf('function')
  const event = new window.MouseEvent('mouseup', { clientX: 600, clientY: 400 })
  Object.defineProperty(event, 'target', { value: screen.getByTestId('flow-canvas') })
  act(() => endConnection(event, {
    isValid: false,
    fromNode: currentNodes().find((node) => node.id === sourceId),
    fromHandle: { id: sourceHandle, type: 'source', nodeId: sourceId },
    toNode: null,
    toHandle: null,
    from: { x: 200, y: 200 },
    to: { x: 600, y: 400 },
  }))
}

describe('connected block insertion', () => {
  beforeEach(() => {
    flowProps.length = 0
    window.localStorage.clear()
  })

  it('splices a selected block into a branch and restores the whole change with one Undo', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openBasicExample(user)

    const onConnect = flowProps.at(-1)?.onConnect as (connection: Record<string, string | null>) => void
    act(() => onConnect({
      source: 'while-n', target: 'add-n', sourceHandle: WHILE_TRUE_RIGHT_HANDLE, targetHandle: null,
    }))
    const before = graphSnapshot()
    const incoming = currentEdges().find((edge) => edge.source === 'while-n' && edge.label === 'true')!
    expect(incoming.data?.onInsert).toBeTypeOf('function')
    act(() => incoming.data?.onInsert?.({
      edgeId: incoming.id, clientX: 550, clientY: 350, flowPosition: { x: 350, y: 440 },
    }))

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
