import { parseCallExpression, parseExpression } from './expression'
import { classifyBackEdges } from './flowLayout'
import {
  parseAssignment,
  splitProcessStatements,
  type ProcessStatementSource,
} from './statements'
import type { Program, ProgramEdge, ProgramNode } from './types'

/**
 * Automatic cleanup keeps Process blocks short enough to scan comfortably.
 * Existing blocks over this limit are left intact rather than split.
 */
export const MAX_COMBINED_PROCESS_STATEMENTS = 8

export interface ProcessConsolidationResult {
  program: Program
  /** Maps every removed Process node ID to the surviving first node's ID. */
  absorbedNodeIds: ReadonlyMap<string, string>
  /** The number of nodes removed by consolidation. */
  mergedNodeCount: number
}

interface ParsedLinearNode {
  node: ProgramNode
  statements: ProcessStatementSource[]
}

interface MergeChain {
  nodes: ParsedLinearNode[]
}

/**
 * Returns the Function or Method declarations whose outgoing control flow can
 * reach each node. The traversal intentionally mirrors FlowLab validation's
 * executable-scope ownership rules, including ambiguous ownership in invalid
 * graphs.
 */
export function findExecutableOwners(
  program: Program,
): Map<string, Set<string>> {
  const outgoingByNode = groupEdges(program.edges, 'source')
  const ownersByNodeId = new Map<string, Set<string>>()
  const nodesById = new Map(program.nodes.map((node) => [node.id, node]))
  const roots = program.nodes.filter(
    (node) => node.type === 'function' || node.type === 'method',
  )

  for (const root of roots) {
    const visited = new Set<string>()
    const stack = [root.id]

    while (stack.length > 0) {
      const nodeId = stack.pop()
      if (!nodeId || visited.has(nodeId)) {
        continue
      }

      visited.add(nodeId)
      const node = nodesById.get(nodeId)
      if (!node) {
        continue
      }

      if (node.type !== 'function' && node.type !== 'method') {
        const owners = ownersByNodeId.get(node.id) ?? new Set<string>()
        owners.add(root.id)
        ownersByNodeId.set(node.id, owners)
      }

      const outgoing = outgoingByNode.get(nodeId) ?? []
      for (let index = outgoing.length - 1; index >= 0; index -= 1) {
        stack.push(outgoing[index].target)
      }
    }
  }

  return ownersByNodeId
}

/**
 * Classifies genuine control-flow back edges with a deterministic depth-first
 * traversal. Class-to-Method attachment edges are declarations, not control
 * flow, and are excluded.
 */
export function findBackEdgeIds(program: Program): ReadonlySet<string> {
  return classifyBackEdges(program)
}

/**
 * Combines every safe maximal chain of adjacent Process blocks. Chains are
 * greedily segmented at the readability limit, without ever splitting an
 * existing Process node.
 */
export function consolidateProcessBlocks(
  program: Program,
): ProcessConsolidationResult {
  const nodesById = new Map(program.nodes.map((node) => [node.id, node]))
  const incomingByNode = groupEdges(program.edges, 'target')
  const outgoingByNode = groupEdges(program.edges, 'source')
  const ownersByNodeId = findExecutableOwners(program)
  const backEdgeIds = findBackEdgeIds(program)
  const parsedByNodeId = new Map<string, ProcessStatementSource[] | null>()

  for (const node of program.nodes) {
    if (node.type === 'process') {
      parsedByNodeId.set(node.id, tryParseNodeStatements(node))
    }
  }

  const mergeableSuccessor = new Map<string, string>()
  const mergeablePredecessor = new Map<string, string>()

  for (const node of program.nodes) {
    if (node.type !== 'process') {
      continue
    }

    const outgoing = outgoingByNode.get(node.id) ?? []
    if (outgoing.length !== 1) {
      continue
    }

    const edge = outgoing[0]
    const target = nodesById.get(edge.target)
    if (
      !target ||
      target.type !== 'process' ||
      edge.label !== undefined ||
      backEdgeIds.has(edge.id) ||
      (incomingByNode.get(node.id)?.length ?? 0) > 1 ||
      (incomingByNode.get(target.id)?.length ?? 0) !== 1 ||
      (outgoingByNode.get(target.id)?.length ?? 0) > 1 ||
      !parsedByNodeId.get(node.id) ||
      !parsedByNodeId.get(target.id) ||
      !haveSameUniqueOwner(node.id, target.id, ownersByNodeId)
    ) {
      continue
    }

    mergeableSuccessor.set(node.id, target.id)
    mergeablePredecessor.set(target.id, node.id)
  }

  const visited = new Set<string>()
  const mergeChains: MergeChain[] = []

  function collectChain(startId: string): void {
    const linearNodes: ParsedLinearNode[] = []
    let nodeId: string | undefined = startId

    while (nodeId && !visited.has(nodeId)) {
      visited.add(nodeId)
      const node = nodesById.get(nodeId)
      const statements = parsedByNodeId.get(nodeId)
      if (!node || node.type !== 'process' || !statements) {
        break
      }

      linearNodes.push({ node, statements })
      nodeId = mergeableSuccessor.get(nodeId)
    }

    collectReadableSegments(linearNodes, mergeChains)
  }

  for (const node of program.nodes) {
    if (
      node.type === 'process' &&
      mergeableSuccessor.has(node.id) &&
      !mergeablePredecessor.has(node.id)
    ) {
      collectChain(node.id)
    }
  }

  // Back-edge removal gives ordinary cycles a head, but this fallback also
  // keeps malformed graphs deterministic if a cycle cannot be classified by ID.
  for (const node of program.nodes) {
    if (node.type === 'process' && !visited.has(node.id)) {
      collectChain(node.id)
    }
  }

  return applyMergeChains(program, mergeChains)
}

/**
 * Canonical implementation for the editor's manual "Combine into Process"
 * command. `nodeIds` must be in execution order and may contain Assignment,
 * Call, and Process nodes. Unsafe or malformed requests are returned as no-ops.
 */
export function combineNodesIntoProcess(
  program: Program,
  nodeIds: readonly string[],
): ProcessConsolidationResult {
  if (nodeIds.length < 2 || new Set(nodeIds).size !== nodeIds.length) {
    return unchanged(program)
  }

  const nodesById = new Map(program.nodes.map((node) => [node.id, node]))
  const parsedNodes: ParsedLinearNode[] = []
  for (const nodeId of nodeIds) {
    const node = nodesById.get(nodeId)
    if (
      !node ||
      (node.type !== 'assignment' &&
        node.type !== 'call' &&
        node.type !== 'process')
    ) {
      return unchanged(program)
    }

    const statements = tryParseNodeStatements(node)
    if (!statements) {
      return unchanged(program)
    }
    parsedNodes.push({ node, statements })
  }

  const selectedIds = new Set(nodeIds)
  const backEdgeIds = findBackEdgeIds(program)
  const internalEdges = program.edges.filter(
    (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
  )
  if (internalEdges.length !== nodeIds.length - 1) {
    return unchanged(program)
  }

  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    const connectingEdges = internalEdges.filter(
      (edge) =>
        edge.source === nodeIds[index] && edge.target === nodeIds[index + 1],
    )
    if (
      connectingEdges.length !== 1 ||
      connectingEdges[0].label !== undefined ||
      backEdgeIds.has(connectingEdges[0].id)
    ) {
      return unchanged(program)
    }
  }

  const entryId = nodeIds[0]
  const exitId = nodeIds[nodeIds.length - 1]
  if (
    program.edges.some(
      (edge) =>
        !selectedIds.has(edge.source) &&
        selectedIds.has(edge.target) &&
        edge.target !== entryId,
    ) ||
    program.edges.some(
      (edge) =>
        selectedIds.has(edge.source) &&
        !selectedIds.has(edge.target) &&
        edge.source !== exitId,
    )
  ) {
    return unchanged(program)
  }

  return applyMergeChains(program, [{ nodes: parsedNodes }])
}

function collectReadableSegments(
  linearNodes: ParsedLinearNode[],
  result: MergeChain[],
): void {
  let segment: ParsedLinearNode[] = []
  let statementCount = 0

  function finishSegment(): void {
    if (segment.length > 1) {
      result.push({ nodes: segment })
    }
    segment = []
    statementCount = 0
  }

  for (const node of linearNodes) {
    const nodeStatementCount = node.statements.length
    if (nodeStatementCount > MAX_COMBINED_PROCESS_STATEMENTS) {
      finishSegment()
      continue
    }

    if (
      segment.length > 0 &&
      statementCount + nodeStatementCount > MAX_COMBINED_PROCESS_STATEMENTS
    ) {
      finishSegment()
    }

    segment.push(node)
    statementCount += nodeStatementCount
  }

  finishSegment()
}

function applyMergeChains(
  program: Program,
  chains: MergeChain[],
): ProcessConsolidationResult {
  if (!chains.length) {
    return unchanged(program)
  }

  const replacementById = new Map<string, ProgramNode>()
  const chainByNodeId = new Map<string, number>()
  const outgoingSourceReplacement = new Map<string, string>()
  const absorbedNodeIds = new Map<string, string>()

  chains.forEach((chain, chainIndex) => {
    const first = chain.nodes[0].node
    const last = chain.nodes[chain.nodes.length - 1].node
    const comments = chain.nodes.flatMap(({ node }) =>
      node.comment === undefined ? [] : [node.comment],
    )
    const widths = chain.nodes.flatMap(({ node }) =>
      node.width === undefined ? [] : [node.width],
    )
    const replacement: ProgramNode = {
      ...first,
      type: 'process',
      text: chain.nodes
        .flatMap(({ statements }) => statements)
        .map((statement) => statement.text)
        .join('\n'),
      ...(comments.length ? { comment: comments.join('\n\n') } : {}),
      ...(widths.length ? { width: Math.max(...widths) } : {}),
    }

    replacementById.set(first.id, replacement)
    outgoingSourceReplacement.set(last.id, first.id)
    for (const { node } of chain.nodes) {
      chainByNodeId.set(node.id, chainIndex)
      if (node.id !== first.id) {
        absorbedNodeIds.set(node.id, first.id)
      }
    }
  })

  const nodes = program.nodes.flatMap((node) => {
    const replacement = replacementById.get(node.id)
    if (replacement) {
      return [replacement]
    }

    return absorbedNodeIds.has(node.id) ? [] : [node]
  })
  const edges = program.edges.flatMap((edge) => {
    const sourceChain = chainByNodeId.get(edge.source)
    const targetChain = chainByNodeId.get(edge.target)
    if (sourceChain !== undefined && sourceChain === targetChain) {
      return []
    }

    const source = outgoingSourceReplacement.get(edge.source)
    return source ? [{ ...edge, source }] : [edge]
  })

  return {
    program: { ...program, nodes, edges },
    absorbedNodeIds,
    mergedNodeCount: absorbedNodeIds.size,
  }
}

function tryParseNodeStatements(
  node: ProgramNode,
): ProcessStatementSource[] | null {
  try {
    if (node.type === 'assignment') {
      validateAssignment(node.text)
      return [{ kind: 'assignment', text: node.text.trim(), lineNumber: 1 }]
    }

    if (node.type === 'call') {
      parseCallExpression(node.text)
      return [{ kind: 'call', text: node.text.trim(), lineNumber: 1 }]
    }

    if (node.type !== 'process') {
      return null
    }

    const statements = splitProcessStatements(node.text)
    if (!statements.length) {
      return null
    }

    for (const statement of statements) {
      if (statement.kind === 'assignment') {
        validateAssignment(statement.text)
      } else {
        parseCallExpression(statement.text)
      }
    }

    return statements
  } catch {
    return null
  }
}

function validateAssignment(text: string): void {
  const assignment = parseAssignment(text)
  if (assignment.target.kind === 'index') {
    parseExpression(assignment.target.indexExpression)
  }
  parseExpression(assignment.expression)
}

function haveSameUniqueOwner(
  leftId: string,
  rightId: string,
  ownersByNodeId: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const leftOwner = uniqueOwner(leftId, ownersByNodeId)
  return Boolean(leftOwner && leftOwner === uniqueOwner(rightId, ownersByNodeId))
}

function uniqueOwner(
  nodeId: string,
  ownersByNodeId: ReadonlyMap<string, ReadonlySet<string>>,
): string | undefined {
  const owners = ownersByNodeId.get(nodeId)
  return owners?.size === 1 ? owners.values().next().value : undefined
}

function groupEdges(
  edges: ProgramEdge[],
  key: 'source' | 'target',
): Map<string, ProgramEdge[]> {
  const grouped = new Map<string, ProgramEdge[]>()
  for (const edge of edges) {
    const group = grouped.get(edge[key]) ?? []
    group.push(edge)
    grouped.set(edge[key], group)
  }
  return grouped
}

function unchanged(program: Program): ProcessConsolidationResult {
  return {
    program,
    absorbedNodeIds: new Map<string, string>(),
    mergedNodeCount: 0,
  }
}
