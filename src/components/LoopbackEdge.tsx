import { type EdgeProps } from '@xyflow/react'
import { getLoopbackPath } from '../lib/flowRouting'
import type { EditorEdge } from '../lib/editorEdges'

export function LoopbackEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  data,
}: EdgeProps<EditorEdge>) {
  const path = getLoopbackPath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    data?.loopbackJoinOffset,
  )

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path loopback-edge"
        d={path}
        fill="none"
        markerEnd={markerEnd}
        style={style}
      />
      <path
        className="react-flow__edge-interaction"
        d={path}
        fill="none"
        strokeOpacity={0}
        strokeWidth={20}
      />
    </>
  )
}
