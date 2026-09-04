import { Position } from '@xyflow/react'

const DEFAULT_SMOOTH_STEP_OFFSET = 20

interface AdaptiveSmoothStepOffsetOptions {
  sourceY: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  maxOffset?: number
}

export function adaptiveSmoothStepOffset({
  sourceY,
  targetY,
  sourcePosition,
  targetPosition,
  maxOffset = DEFAULT_SMOOTH_STEP_OFFSET,
}: AdaptiveSmoothStepOffsetOptions): number {
  const normalizedMaxOffset = Math.max(0, maxOffset)

  if (
    sourcePosition !== Position.Bottom ||
    targetPosition !== Position.Top ||
    targetY <= sourceY
  ) {
    return normalizedMaxOffset
  }

  // Both end stubs must fit inside the gap or the route doubles back on itself.
  return Math.min(normalizedMaxOffset, (targetY - sourceY) / 2)
}
