import type { Edge, KeyCode } from '@xyflow/react'
import {
  edgeTypeForProgramEdge,
  loopbackJoinOffsetForProgramEdge,
  sourceHandleForProgramEdge,
  targetHandleForProgramEdge,
} from './flowRouting'
import {
  isBranchNodeType,
  type BranchLabel,
  type FlowNodeType,
  type Program,
} from './types'

export interface FlowEdgeData extends Record<string, unknown> {
  loopbackJoinOffset?: number
}

export type EditorEdge = Edge<FlowEdgeData>

export const DELETE_KEY_CODES = ['Backspace', 'Delete'] satisfies KeyCode

export function withoutReplacedOutgoingEdges(
  edges: EditorEdge[],
  sourceNodeId: string,
  sourceNodeType: FlowNodeType,
  branchLabel?: BranchLabel,
): EditorEdge[] {
  if (sourceNodeType === 'class') {
    return edges
  }

  if (isBranchNodeType(sourceNodeType)) {
    if (!branchLabel) {
      return edges
    }

    return edges.filter(
      (edge) => edge.source !== sourceNodeId || edge.label !== branchLabel,
    )
  }

  return edges.filter((edge) => edge.source !== sourceNodeId)
}

export function programToEdges(
  program: Program,
  currentEdges: EditorEdge[] = [],
): EditorEdge[] {
  const currentEdgesById = new Map(
    currentEdges.map((edge) => [edge.id, edge]),
  )

  return program.edges.map((edge) => {
    const currentEdge = currentEdgesById.get(edge.id)

    return {
      ...currentEdge,
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      sourceHandle: sourceHandleForProgramEdge(
        program,
        edge,
        currentEdge?.sourceHandle,
      ),
      targetHandle: targetHandleForProgramEdge(program, edge),
      type: edgeTypeForProgramEdge(program, edge),
      data: {
        ...currentEdge?.data,
        loopbackJoinOffset: loopbackJoinOffsetForProgramEdge(program, edge),
      },
    }
  })
}
