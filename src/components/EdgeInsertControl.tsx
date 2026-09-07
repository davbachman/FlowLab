import type { FlowEdgeData } from '../lib/editorEdges'
import './EdgeInsertControl.css'

interface EdgeInsertControlProps {
  edgeId: string
  source: string
  target: string
  x: number
  y: number
  onInsert: NonNullable<FlowEdgeData['onInsert']>
}

/** An HTML button inside the edge SVG remains reachable by keyboard. */
export function EdgeInsertControl({
  edgeId,
  source,
  target,
  x,
  y,
  onInsert,
}: EdgeInsertControlProps) {
  return (
    <foreignObject
      className="edge-insert-control nodrag nopan"
      x={x - 16}
      y={y - 16}
      width={32}
      height={32}
    >
      <button
        type="button"
        className="edge-insert-button nodrag nopan"
        aria-label={`Insert block on wire ${source} to ${target}`}
        title="Insert a block on this wire"
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          const rect = event.currentTarget.getBoundingClientRect()
          onInsert({
            edgeId,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            flowPosition: { x, y },
          })
        }}
      >
        <span aria-hidden="true">+</span>
      </button>
    </foreignObject>
  )
}
