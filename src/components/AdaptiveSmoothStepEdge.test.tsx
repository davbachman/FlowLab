import { render } from '@testing-library/react'
import { Position } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { adaptiveSmoothStepOffset } from '../lib/adaptiveSmoothStep'
import { AdaptiveSmoothStepEdge } from './AdaptiveSmoothStepEdge'

describe('adaptiveSmoothStepOffset', () => {
  it.each([
    [80, 20],
    [40, 20],
    [30, 15],
    [20, 10],
    [10, 5],
    [0, 20],
    [-10, 20],
  ])('adapts the offset for a %s pixel forward gap', (gap, expected) => {
    expect(
      adaptiveSmoothStepOffset({
        sourceY: 100,
        targetY: 100 + gap,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      }),
    ).toBe(expected)
  })

  it('leaves side-originating branch routes unchanged', () => {
    expect(
      adaptiveSmoothStepOffset({
        sourceY: 100,
        targetY: 120,
        sourcePosition: Position.Left,
        targetPosition: Position.Top,
      }),
    ).toBe(20)
  })

  it('respects a configured maximum offset', () => {
    expect(
      adaptiveSmoothStepOffset({
        sourceY: 100,
        targetY: 200,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        maxOffset: 12,
      }),
    ).toBe(12)
  })
})

describe('AdaptiveSmoothStepEdge', () => {
  it('renders a close forward route without doubling back past either handle', () => {
    const { container } = render(
      <svg>
        <AdaptiveSmoothStepEdge
          id="close-edge"
          source="source"
          target="target"
          sourceX={0}
          sourceY={0}
          sourcePosition={Position.Bottom}
          targetX={80}
          targetY={12}
          targetPosition={Position.Top}
          markerEnd="url(#arrow)"
        />
      </svg>,
    )

    const path = container.querySelector<SVGPathElement>(
      '.react-flow__edge-path',
    )

    const pathCoordinates = (
      path?.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g) ?? []
    ).map(Number)
    const pathYCoordinates = pathCoordinates.filter((_, index) => index % 2 === 1)

    expect(pathYCoordinates.length).toBeGreaterThan(0)
    expect(Math.min(...pathYCoordinates)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...pathYCoordinates)).toBeLessThanOrEqual(12)
    expect(path).toHaveAttribute('marker-end', 'url(#arrow)')
  })
})
