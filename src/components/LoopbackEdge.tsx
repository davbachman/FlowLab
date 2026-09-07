import { BaseEdge, type EdgeProps } from '@xyflow/react'
import { getLoopbackPath } from '../lib/flowRouting'
import type { EditorEdge } from '../lib/editorEdges'
import { EdgeInsertControl } from './EdgeInsertControl'

export function LoopbackEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerStart,
  markerEnd,
  style,
  data,
  interactionWidth,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}: EdgeProps<EditorEdge>) {
  const path = getLoopbackPath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    data?.loopbackJoinOffset,
  )
  const labelX = Math.min(sourceX, targetX) - 180
  const labelY = (sourceY + 28 + targetY - (data?.loopbackJoinOffset ?? 0)) / 2

  return (
    <>
      <BaseEdge
        id={id}
        className="loopback-edge"
        path={path}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={interactionWidth}
        label={label}
        labelX={labelX}
        labelY={labelY - (data?.onInsert ? 27 : 0)}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
      />
      {data?.onInsert ? (
        <EdgeInsertControl
          edgeId={id}
          source={source}
          target={target}
          x={labelX}
          y={labelY}
          onInsert={data.onInsert}
        />
      ) : null}
    </>
  )
}
