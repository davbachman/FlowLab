import type { Edge, KeyCode } from '@xyflow/react'
import {
  edgeTypeForProgramEdge,
  loopbackJoinOffsetForProgramEdge,
  sourceHandleForProgramEdge,
  targetHandleForProgramEdge,
} from './flowRouting'
import type { Program } from './types'

export interface FlowEdgeData extends Record<string, unknown> {
  loopbackJoinOffset?: number
}

export type EditorEdge = Edge<FlowEdgeData>

export const DELETE_KEY_CODES = ['Backspace', 'Delete'] satisfies KeyCode

export function programToEdges(
  program: Program,
  currentEdges: EditorEdge[] = [],
): EditorEdge[] {
  const currentEdgesById = new Map(
    currentEdges.map((edge) => [edge.id, edge]),
  )

  return program.edges.map((edge) => ({
    ...currentEdgesById.get(edge.id),
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    sourceHandle: sourceHandleForProgramEdge(program, edge),
    targetHandle: targetHandleForProgramEdge(program, edge),
    type: edgeTypeForProgramEdge(program, edge),
    data: {
      ...currentEdgesById.get(edge.id)?.data,
      loopbackJoinOffset: loopbackJoinOffsetForProgramEdge(program, edge),
    },
  }))
}
