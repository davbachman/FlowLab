import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { WHILE_TRUE_RIGHT_HANDLE } from './lib/flowRouting'
import type { Program } from './lib/types'

const reactFlowProps: Record<string, unknown>[] = []
const fitView = vi.fn(() => Promise.resolve(true))
const reactFlowInstance = { fitView }

vi.mock('@xyflow/react', () => ({
  addEdge: vi.fn((edge, edges) => [...edges, edge]),
  applyEdgeChanges: vi.fn((_, edges) => edges),
  applyNodeChanges: vi.fn(
    (
      changes: Array<{
        id: string
        type: string
        dimensions?: { width: number; height: number }
      }>,
      nodes: Array<Record<string, unknown>>,
    ) =>
      nodes.map((node) => {
        const dimensions = changes.find(
          (change) => change.type === 'dimensions' && change.id === node.id,
        )?.dimensions

        return dimensions ? { ...node, measured: dimensions } : node
      }),
  ),
  Background: () => <div data-testid="react-flow-background" />,
  Controls: () => <div data-testid="react-flow-controls" />,
  ConnectionLineType: {
    SmoothStep: 'smoothstep',
  },
  Handle: () => <div data-testid="react-flow-handle" />,
  Position: {
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
    Top: 'top',
  },
  ReactFlow: function ReactFlow(props: Record<string, unknown>) {
    reactFlowProps.push(props)

    useEffect(() => {
      const onInit = props.onInit as
        | ((instance: typeof reactFlowInstance) => void)
        | undefined
      onInit?.(reactFlowInstance)
    }, [props.onInit])

    useEffect(() => {
      const nodes = (props.nodes ?? []) as Array<{
        id: string
        width?: number
        measured?: { width?: number; height?: number }
      }>
      const changes = nodes.flatMap((node) =>
        (node.measured?.width ?? 0) > 0 &&
        (node.measured?.height ?? 0) > 0
          ? []
          : [
              {
                id: node.id,
                type: 'dimensions',
                dimensions: {
                  width: node.width ?? 300,
                  height: 120,
                },
              },
            ],
      )
      const onNodesChange = props.onNodesChange as
        | ((nodeChanges: typeof changes) => void)
        | undefined

      if (changes.length) {
        onNodesChange?.(changes)
      }
    }, [props.nodes, props.onNodesChange])

    return <div data-testid="react-flow">{props.children as React.ReactNode}</div>
  },
  SelectionMode: {
    Partial: 'partial',
  },
}))

const fitCleanupProgram: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 500, y: 500 } },
    {
      id: 'first-process',
      type: 'process',
      text: 'x <- 1',
      position: { x: 800, y: 100 },
    },
    {
      id: 'second-process',
      type: 'process',
      text: 'y <- x + 1',
      position: { x: 100, y: 700 },
    },
    { id: 'return', type: 'return', text: 'y', position: { x: 900, y: 50 } },
  ],
  edges: [
    { id: 'main-first', source: 'main', target: 'first-process' },
    { id: 'first-second', source: 'first-process', target: 'second-process' },
    { id: 'second-return', source: 'second-process', target: 'return' },
  ],
}

describe('React Flow options', () => {
  beforeEach(() => {
    reactFlowProps.length = 0
    fitView.mockClear()
  })

  it('uses a rectilinear connection preview while dragging wires', () => {
    render(<App />)

    expect(reactFlowProps.at(-1)).toMatchObject({
      connectionLineType: 'smoothstep',
      minZoom: 0.1,
    })
  })

  it('zooms with the wheel and reserves double click for quick add', () => {
    render(<App />)

    expect(reactFlowProps.at(-1)).toMatchObject({
      zoomOnScroll: true,
      panOnScroll: false,
      zoomOnDoubleClick: false,
    })
  })

  it('replaces an occupied logical output when a new wire is connected', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^Examples$/i }))
    await user.click(screen.getByRole('menuitem', { name: /^Basic$/i }))

    const connectOrdinary = reactFlowProps.at(-1)?.onConnect as
      | ((connection: Record<string, string | null>) => void)
      | undefined
    expect(connectOrdinary).toBeTypeOf('function')

    act(() => {
      connectOrdinary?.({
        source: 'input-n',
        target: 'return',
        sourceHandle: null,
        targetHandle: null,
      })
    })

    const ordinaryEdges = reactFlowProps.at(-1)?.edges as Array<{
      source: string
      target: string
      label?: string
    }>
    expect(
      ordinaryEdges.filter((edge) => edge.source === 'input-n'),
    ).toHaveLength(1)
    expect(ordinaryEdges).toContainEqual(
      expect.objectContaining({ source: 'input-n', target: 'return' }),
    )
    expect(ordinaryEdges).toContainEqual(
      expect.objectContaining({ source: 'main', target: 'input-n' }),
    )

    const connectBranch = reactFlowProps.at(-1)?.onConnect as
      | ((connection: Record<string, string | null>) => void)
      | undefined

    act(() => {
      connectBranch?.({
        source: 'while-n',
        target: 'return',
        sourceHandle: WHILE_TRUE_RIGHT_HANDLE,
        targetHandle: null,
      })
    })

    const branchEdges = reactFlowProps.at(-1)?.edges as Array<{
      source: string
      target: string
      label?: string
    }>
    expect(
      branchEdges.filter(
        (edge) => edge.source === 'while-n' && edge.label === 'true',
      ),
    ).toHaveLength(1)
    expect(branchEdges).toContainEqual(
      expect.objectContaining({
        source: 'while-n',
        target: 'return',
        label: 'true',
      }),
    )
    expect(branchEdges).toContainEqual(
      expect.objectContaining({
        source: 'while-n',
        target: 'show-total',
        label: 'false',
      }),
    )
  })

  it('fits the cleaned graph only after its updated nodes have rendered and been measured', async () => {
    const user = userEvent.setup()
    let nodesSeenByFitView: Array<{
      id: string
      measured?: { width?: number; height?: number }
    }> = []
    fitView.mockImplementation(() => {
      nodesSeenByFitView = (reactFlowProps.at(-1)?.nodes ?? []) as typeof nodesSeenByFitView
      return Promise.resolve(true)
    })

    render(<App />)

    await user.click(screen.getByRole('button', { name: /^File$/i }))
    await user.click(
      within(screen.getByRole('menu', { name: /^File$/i })).getByRole(
        'menuitem',
        { name: /^Load$/i },
      ),
    )
    fireEvent.change(screen.getByLabelText(/^Import$/i), {
      target: {
        files: [
          new File([JSON.stringify(fitCleanupProgram)], 'fit-cleanup.json', {
            type: 'application/json',
          }),
        ],
      },
    })

    await waitFor(() => {
      const nodes = (reactFlowProps.at(-1)?.nodes ?? []) as Array<{ id: string }>
      expect(nodes.map((node) => node.id)).toContain('second-process')
      expect(
        nodes.every((node) => {
          const measured = (node as {
            measured?: { width?: number; height?: number }
          }).measured
          return (measured?.width ?? 0) > 0 && (measured?.height ?? 0) > 0
        }),
      ).toBe(true)
    })
    expect(fitView).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /^Edit$/i }))
    await user.click(
      within(screen.getByRole('menu', { name: /^Edit$/i })).getByRole(
        'menuitem',
        { name: /^Clean up code$/i },
      ),
    )

    await waitFor(() => expect(fitView).toHaveBeenCalledTimes(1))
    expect(nodesSeenByFitView.map((node) => node.id)).not.toContain(
      'second-process',
    )
    expect(
      nodesSeenByFitView.every(
        (node) =>
          (node.measured?.width ?? 0) > 0 &&
          (node.measured?.height ?? 0) > 0,
      ),
    ).toBe(true)
    expect(fitView).toHaveBeenCalledWith({ padding: 0.08 })
  })
})
