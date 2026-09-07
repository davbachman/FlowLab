import { estimateProgramNodeDimensions, type FlowNodeDimensions } from './flowLayout'
import {
  isBranchNodeType,
  type BranchLabel,
  type FlowNodeType,
  type Program,
  type ProgramEdge,
  type ProgramNode,
  type ProgramPosition,
} from './types'

// A splice needs one incoming and one outgoing path. Branch and Return blocks
// require a different continuation, so offer them only when extending a wire.
export const WIRE_INSERT_NODE_TYPES: readonly FlowNodeType[] = [
  'process',
  'assignment',
  'call',
  'input',
  'output',
]

export const CONNECTED_NODE_TYPES: readonly FlowNodeType[] = [
  ...WIRE_INSERT_NODE_TYPES,
  'return',
  'if',
  'while',
  'for',
]

/** Preserve the existing layout by moving only the added block into nearby space. */
export function findFreeNodePosition(
  program: Program,
  newNode: ProgramNode,
  measuredDimensions?: ReadonlyMap<string, FlowNodeDimensions>,
): ProgramPosition {
  const gap = 24
  const addedSize = estimateProgramNodeDimensions(program, newNode)
  const neighbors = program.nodes.flatMap((node) => {
    const size = estimateProgramNodeDimensions(program, node, measuredDimensions?.get(node.id))
    const above = node.position.y + size.height + gap <= newNode.position.y
    const below = newNode.position.y + addedSize.height + gap <= node.position.y
    return above || below ? [] : [{ x: node.position.x, width: size.width }]
  })
  const candidates = [
    newNode.position.x,
    ...neighbors.flatMap((node) => [node.x - addedSize.width - gap, node.x + node.width + gap]),
  ].sort((left, right) =>
    Math.abs(left - newNode.position.x) - Math.abs(right - newNode.position.x) || left - right,
  )
  const x = candidates.find((candidate) =>
    neighbors.every((node) =>
      candidate + addedSize.width + gap <= node.x || node.x + node.width + gap <= candidate,
    ),
  ) ?? newNode.position.x
  return { x, y: newNode.position.y }
}

export function canInsertOnEdge(program: Program, edgeId: string): boolean {
  const edge = program.edges.find((candidate) => candidate.id === edgeId)
  if (!edge) return false

  const source = program.nodes.find((node) => node.id === edge.source)
  const target = program.nodes.find((node) => node.id === edge.target)
  return Boolean(
    source &&
      target &&
      source.type !== 'class' &&
      source.type !== 'return' &&
      target.type !== 'class' &&
      target.type !== 'function' &&
      target.type !== 'method',
  )
}

/** Keep the old edge ID and branch label on the source-to-new-node segment. */
export function insertNodeOnEdge(
  program: Program,
  edgeId: string,
  newNode: ProgramNode,
): Program | null {
  if (
    !WIRE_INSERT_NODE_TYPES.includes(newNode.type) ||
    program.nodes.some((node) => node.id === newNode.id) ||
    !canInsertOnEdge(program, edgeId)
  ) {
    return null
  }

  const originalEdge = program.edges.find((edge) => edge.id === edgeId)!
  const continuation: ProgramEdge = {
    id: uniqueEdgeId(newNode.id, originalEdge.target, program.edges),
    source: newNode.id,
    target: originalEdge.target,
  }

  return {
    ...program,
    nodes: [...program.nodes, { ...newNode, position: findFreeNodePosition(program, newNode) }],
    edges: program.edges.flatMap((edge) =>
      edge.id === edgeId
        ? [{ ...edge, target: newNode.id }, continuation]
        : [edge],
    ),
  }
}

/** Extend the dragged output, replacing only that output's existing wire. */
export function connectNewNode(
  program: Program,
  sourceId: string,
  newNode: ProgramNode,
  label?: BranchLabel,
): Program | null {
  const source = program.nodes.find((node) => node.id === sourceId)
  if (
    !source ||
    source.type === 'class' ||
    source.type === 'return' ||
    !CONNECTED_NODE_TYPES.includes(newNode.type) ||
    program.nodes.some((node) => node.id === newNode.id) ||
    (isBranchNodeType(source.type) && !label)
  ) {
    return null
  }

  const branchLabel = isBranchNodeType(source.type) ? label : undefined
  const retainedEdges = program.edges.filter(
    (edge) =>
      edge.source !== sourceId ||
      (isBranchNodeType(source.type) && edge.label !== branchLabel),
  )
  const edge: ProgramEdge = {
    id: uniqueEdgeId(sourceId, newNode.id, program.edges),
    source: sourceId,
    target: newNode.id,
    ...(branchLabel ? { label: branchLabel } : {}),
  }

  return {
    ...program,
    nodes: [...program.nodes, { ...newNode, position: findFreeNodePosition(program, newNode) }],
    edges: [...retainedEdges, edge],
  }
}

function uniqueEdgeId(
  source: string,
  target: string,
  edges: ProgramEdge[],
): string {
  const existingIds = new Set(edges.map((edge) => edge.id))
  const baseId = `edge-${source}-${target}`
  let id = baseId
  let suffix = 2
  while (existingIds.has(id)) {
    id = `${baseId}-${suffix++}`
  }
  return id
}
