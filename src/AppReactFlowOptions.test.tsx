import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { WHILE_TRUE_RIGHT_HANDLE } from './lib/flowRouting'

const reactFlowProps: Record<string, unknown>[] = []

vi.mock('@xyflow/react', () => ({
  addEdge: vi.fn((edge, edges) => [...edges, edge]),
  applyEdgeChanges: vi.fn((_, edges) => edges),
  applyNodeChanges: vi.fn((_, nodes) => nodes),
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
  ReactFlow: (props: Record<string, unknown>) => {
    reactFlowProps.push(props)

    return <div data-testid="react-flow">{props.children as React.ReactNode}</div>
  },
  SelectionMode: {
    Partial: 'partial',
  },
}))

describe('React Flow options', () => {
  it('uses a rectilinear connection preview while dragging wires', () => {
    render(<App />)

    expect(reactFlowProps.at(-1)).toMatchObject({
      connectionLineType: 'smoothstep',
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
})
