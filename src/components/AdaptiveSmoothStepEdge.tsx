import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import type { EditorEdge } from '../lib/editorEdges'
import { adaptiveSmoothStepOffset } from '../lib/adaptiveSmoothStep'
import { EdgeInsertControl } from './EdgeInsertControl'

const DEFAULT_SMOOTH_STEP_OFFSET = 20

export function AdaptiveSmoothStepEdge(props: EdgeProps<EditorEdge>) {
  const configuredOffset =
    typeof props.pathOptions?.offset === 'number'
      ? props.pathOptions.offset
      : DEFAULT_SMOOTH_STEP_OFFSET
  const offset = adaptiveSmoothStepOffset({
    sourceY: props.sourceY,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    maxOffset: configuredOffset,
  })
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    ...props.pathOptions,
    offset,
  })
  const onInsert = props.data?.onInsert

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerStart={props.markerStart}
        markerEnd={props.markerEnd}
        style={props.style}
        interactionWidth={props.interactionWidth}
        label={props.label}
        labelX={labelX}
        labelY={labelY - (onInsert ? 27 : 0)}
        labelStyle={props.labelStyle}
        labelShowBg={props.labelShowBg}
        labelBgStyle={props.labelBgStyle}
        labelBgPadding={props.labelBgPadding}
        labelBgBorderRadius={props.labelBgBorderRadius}
      />
      {onInsert ? (
        <EdgeInsertControl
          edgeId={props.id}
          source={props.source}
          target={props.target}
          x={labelX}
          y={labelY}
          onInsert={onInsert}
        />
      ) : null}
    </>
  )
}
