import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

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
})
