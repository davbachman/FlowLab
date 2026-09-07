import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Position } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
import { AdaptiveSmoothStepEdge } from './AdaptiveSmoothStepEdge'
import { LoopbackEdge } from './LoopbackEdge'

const edgeProps = {
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceX: 0,
  sourceY: 0,
  targetX: 0,
  targetY: 160,
  sourcePosition: Position.Bottom,
  targetPosition: Position.Top,
}

describe('wire insertion controls', () => {
  it('opens insertion at the edge midpoint using keyboard activation', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()
    render(<svg><AdaptiveSmoothStepEdge {...edgeProps} data={{ onInsert }} /></svg>)
    await user.tab()
    expect(screen.getByRole('button', { name: 'Insert block on wire source to target' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onInsert).toHaveBeenCalledWith({
      edgeId: 'edge', clientX: 0, clientY: 0, flowPosition: { x: 0, y: 80 },
    })
  })

  it('positions the loop-back control on the outside vertical segment', () => {
    const onInsert = vi.fn()
    render(
      <svg>
        <LoopbackEdge
          {...edgeProps}
          sourceX={100}
          sourceY={500}
          targetX={300}
          targetY={350}
          data={{ onInsert, loopbackJoinOffset: 20 }}
        />
      </svg>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onInsert).toHaveBeenCalledWith({
      edgeId: 'edge', clientX: 0, clientY: 0, flowPosition: { x: -80, y: 429 },
    })
  })

  it('does not expose insertion for an edge without an insertion callback', () => {
    render(<svg><AdaptiveSmoothStepEdge {...edgeProps} /></svg>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
