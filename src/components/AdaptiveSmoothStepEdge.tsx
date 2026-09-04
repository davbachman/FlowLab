import { SmoothStepEdge, type EdgeProps } from '@xyflow/react'
import type { EditorEdge } from '../lib/editorEdges'
import { adaptiveSmoothStepOffset } from '../lib/adaptiveSmoothStep'

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

  return (
    <SmoothStepEdge
      {...props}
      pathOptions={{
        ...props.pathOptions,
        offset,
      }}
    />
  )
}
