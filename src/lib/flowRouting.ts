import type {
  BranchLabel,
  FlowNodeType,
  Program,
  ProgramEdge,
  ProgramNode,
} from './types'
import { isBranchNodeType } from './types'

export const WHILE_TRUE_HANDLE = 'while-true'
export const WHILE_TRUE_RIGHT_HANDLE = 'while-true-right'
export const WHILE_FALSE_HANDLE = 'while-false'
export const IF_TRUE_HANDLE = 'if-true'
export const IF_TRUE_RIGHT_HANDLE = 'if-true-right'
export const IF_FALSE_HANDLE = 'if-false'
export const FOR_TRUE_HANDLE = 'for-true'
export const FOR_TRUE_RIGHT_HANDLE = 'for-true-right'
export const FOR_FALSE_HANDLE = 'for-false'
export const DECISION_LOOPBACK_TARGET_HANDLE = 'decision-loopback-target'
export const CLASS_METHOD_NEW_HANDLE = 'class-method-new'
export const METHOD_OWNER_HANDLE = 'method-owner'

export function classMethodHandleId(methodNodeId: string): string {
  return `class-method-${methodNodeId}`
}

export type TrueBranchHandleSide = 'left' | 'right'

const DEFAULT_LOOPBACK_JOIN_OFFSET = 28
const MIN_LOOPBACK_JOIN_OFFSET = 16
const MAX_LOOPBACK_JOIN_OFFSET = 96
const BLOCK_SOURCE_HANDLE_Y_OFFSET = 82
const DECISION_SOURCE_HANDLE_Y_OFFSET = 137
const FUNCTION_SOURCE_HANDLE_Y_OFFSET = 46
const TOP_TARGET_HANDLE_Y_OFFSET = -6

export function branchLabelFromHandle(
  sourceHandle: string | null | undefined,
): BranchLabel | undefined {
  if (
    sourceHandle === WHILE_TRUE_HANDLE ||
    sourceHandle === WHILE_TRUE_RIGHT_HANDLE ||
    sourceHandle === IF_TRUE_HANDLE ||
    sourceHandle === IF_TRUE_RIGHT_HANDLE ||
    sourceHandle === FOR_TRUE_HANDLE ||
    sourceHandle === FOR_TRUE_RIGHT_HANDLE
  ) {
    return 'true'
  }

  if (
    sourceHandle === WHILE_FALSE_HANDLE ||
    sourceHandle === IF_FALSE_HANDLE ||
    sourceHandle === FOR_FALSE_HANDLE
  ) {
    return 'false'
  }

  return undefined
}

export function sourceHandleForBranch(
  nodeType: FlowNodeType,
  label: BranchLabel,
  side: TrueBranchHandleSide = 'left',
): string | undefined {
  if (nodeType === 'if') {
    if (label === 'true') {
      return side === 'right' ? IF_TRUE_RIGHT_HANDLE : IF_TRUE_HANDLE
    }

    return IF_FALSE_HANDLE
  }

  if (nodeType === 'while') {
    if (label === 'true') {
      return side === 'right' ? WHILE_TRUE_RIGHT_HANDLE : WHILE_TRUE_HANDLE
    }

    return WHILE_FALSE_HANDLE
  }

  if (nodeType === 'for') {
    if (label === 'true') {
      return side === 'right' ? FOR_TRUE_RIGHT_HANDLE : FOR_TRUE_HANDLE
    }

    return FOR_FALSE_HANDLE
  }

  return undefined
}

export function sourceHandleForBranchConnection(
  nodeType: FlowNodeType,
  label: BranchLabel,
  sourceHandle: string | null | undefined,
): string | undefined {
  if (label === 'true' && isTrueBranchHandleForNodeType(nodeType, sourceHandle)) {
    return sourceHandle
  }

  return sourceHandleForBranch(nodeType, label)
}

export function sourceHandleForProgramEdge(
  program: Program,
  edge: ProgramEdge,
  currentSourceHandle?: string | null,
): string | undefined {
  const sourceNode = program.nodes.find((node) => node.id === edge.source)
  const targetNode = program.nodes.find((node) => node.id === edge.target)

  if (sourceNode?.type === 'class' && targetNode?.type === 'method') {
    if (currentSourceHandle === CLASS_METHOD_NEW_HANDLE) {
      return currentSourceHandle
    }

    return classMethodHandleId(targetNode.id)
  }

  return sourceNode && edge.label
    ? sourceHandleForBranchConnection(
        sourceNode.type,
        edge.label,
        currentSourceHandle,
      )
    : undefined
}

function isTrueBranchHandleForNodeType(
  nodeType: FlowNodeType,
  sourceHandle: string | null | undefined,
): sourceHandle is string {
  return (
    sourceHandle === sourceHandleForBranch(nodeType, 'true', 'left') ||
    sourceHandle === sourceHandleForBranch(nodeType, 'true', 'right')
  )
}

export function targetHandleForProgramEdge(
  program: Program,
  edge: ProgramEdge,
): string | undefined {
  const sourceNode = program.nodes.find((node) => node.id === edge.source)
  const targetNode = program.nodes.find((node) => node.id === edge.target)

  if (sourceNode?.type === 'class' && targetNode?.type === 'method') {
    return METHOD_OWNER_HANDLE
  }

  if (isLoopBackToDecision(program, edge)) {
    return undefined
  }

  return undefined
}

export function edgeTypeForProgramEdge(
  program: Program,
  edge: ProgramEdge,
): 'loopback' | 'smoothstep' {
  return isLoopBackToDecision(program, edge) ? 'loopback' : 'smoothstep'
}

export function loopbackJoinOffsetForProgramEdge(
  program: Program,
  edge: ProgramEdge,
): number | undefined {
  if (!isLoopBackToDecision(program, edge)) {
    return undefined
  }

  return loopbackTargetOffsetForDecisionNode(program, edge.target)
}

export function loopbackTargetOffsetForDecisionNode(
  program: Program,
  targetNodeId: string,
): number | undefined {
  const targetNode = program.nodes.find((node) => node.id === targetNodeId)

  if (!targetNode || !isBranchNodeType(targetNode.type)) {
    return undefined
  }

  const incomingSourceNode = findNearestIncomingNodeAboveTarget(
    program,
    targetNodeId,
  )

  if (!incomingSourceNode) {
    return DEFAULT_LOOPBACK_JOIN_OFFSET
  }

  const incomingWireLength =
    estimatedTopTargetY(targetNode) - estimatedSourceHandleY(incomingSourceNode)

  if (incomingWireLength <= 0) {
    return DEFAULT_LOOPBACK_JOIN_OFFSET
  }

  return clamp(
    incomingWireLength / 2,
    MIN_LOOPBACK_JOIN_OFFSET,
    MAX_LOOPBACK_JOIN_OFFSET,
  )
}

export function getLoopbackPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  nodeEntryOffset = 0,
): string {
  const bottomY = sourceY + 28
  const outsideX = Math.min(sourceX, targetX) - 180
  const joinY = targetY - nodeEntryOffset

  const path = [
    `M${sourceX} ${sourceY}`,
    `L${sourceX} ${bottomY}`,
    `L${outsideX} ${bottomY}`,
    `L${outsideX} ${joinY}`,
    `L${targetX} ${joinY}`,
  ]

  if (nodeEntryOffset > 0) {
    path.push(`L${targetX} ${targetY}`)
  }

  return path.join('')
}

function isLoopBackToDecision(program: Program, edge: ProgramEdge): boolean {
  const sourceNode = program.nodes.find((node) => node.id === edge.source)
  const targetNode = program.nodes.find((node) => node.id === edge.target)

  if (!sourceNode || !targetNode) {
    return false
  }

  const targetsDecision = isBranchNodeType(targetNode.type)
  const returnsFromBelow = sourceNode.position.y > targetNode.position.y

  return targetsDecision && returnsFromBelow
}

function findNearestIncomingNodeAboveTarget(
  program: Program,
  targetNodeId: string,
): ProgramNode | undefined {
  const targetNode = program.nodes.find((node) => node.id === targetNodeId)

  if (!targetNode) {
    return undefined
  }

  return program.edges
    .filter(
      (incomingEdge) =>
        incomingEdge.target === targetNodeId,
    )
    .map((incomingEdge) =>
      program.nodes.find((node) => node.id === incomingEdge.source),
    )
    .filter((node): node is ProgramNode => {
      if (!node) {
        return false
      }

      return node.position.y < targetNode.position.y
    })
    .sort((left, right) => right.position.y - left.position.y)[0]
}

function estimatedSourceHandleY(node: ProgramNode): number {
  if (isBranchNodeType(node.type)) {
    return node.position.y + DECISION_SOURCE_HANDLE_Y_OFFSET
  }

  if (node.type === 'function') {
    return node.position.y + FUNCTION_SOURCE_HANDLE_Y_OFFSET
  }

  return node.position.y + BLOCK_SOURCE_HANDLE_Y_OFFSET
}

function estimatedTopTargetY(node: ProgramNode): number {
  return node.position.y + TOP_TARGET_HANDLE_Y_OFFSET
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
