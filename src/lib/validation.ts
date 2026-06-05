import {
  findExpressionCallNames,
  isBuiltInFunctionName,
  parseExpression,
} from './expression'
import { isVariableName, parseAssignment, parseForLoop } from './statements'
import {
  isBranchLabel,
  isBranchNodeType,
  isFlowNodeType,
  NODE_TYPE_LABELS,
  type Program,
  type ProgramEdge,
  type ProgramNode,
  type ValidationResult,
} from './types'

export function normalizeImportedProgram(value: unknown): Program {
  if (!value || typeof value !== 'object') {
    return value as Program
  }

  const candidate = value as {
    version?: unknown
    nodes?: unknown
    edges?: unknown
  }

  if (!Array.isArray(candidate.nodes)) {
    return value as Program
  }

  return {
    version: candidate.version as 1,
    nodes: candidate.nodes.map((node) => {
      if (!node || typeof node !== 'object') {
        return node
      }

      const candidateNode = node as { type?: unknown; text?: unknown }
      if (candidateNode.type === 'start') {
        return {
          ...candidateNode,
          type: 'function',
          text: 'main',
        }
      }

      if (candidateNode.type !== 'end') {
        return node
      }

      return {
        ...candidateNode,
        type: 'return',
        text:
          typeof candidateNode.text === 'string' && candidateNode.text.trim()
            ? candidateNode.text
            : '0',
      }
    }) as ProgramNode[],
    edges: Array.isArray(candidate.edges)
      ? (candidate.edges as ProgramEdge[])
      : candidate.edges as ProgramEdge[],
  }
}

export function validateProgram(program: Program): ValidationResult {
  const errors: string[] = []

  if (!isProgramShape(program)) {
    return {
      valid: false,
      errors: ['Program JSON must contain version, nodes, and edges.'],
    }
  }

  const nodeIds = new Set<string>()
  const nodesById = new Map<string, ProgramNode>()

  for (const node of program.nodes) {
    if (!node.id.trim()) {
      errors.push('Every node needs a non-empty id.')
    }

    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node id "${node.id}".`)
    }

    nodeIds.add(node.id)
    nodesById.set(node.id, node)
    validateNodeText(node, errors)
  }

  const edgeIds = new Set<string>()
  for (const edge of program.edges) {
    if (!edge.id.trim()) {
      errors.push('Every edge needs a non-empty id.')
    }

    if (edgeIds.has(edge.id)) {
      errors.push(`Duplicate edge id "${edge.id}".`)
    }

    edgeIds.add(edge.id)

    if (!nodesById.has(edge.source)) {
      errors.push(`Edge "${edge.id}" starts at a missing node.`)
    }

    if (!nodesById.has(edge.target)) {
      errors.push(`Edge "${edge.id}" points to a missing node.`)
    }
  }

  const functions = program.nodes.filter((node) => node.type === 'function')
  const returns = program.nodes.filter((node) => node.type === 'return')
  const functionsByName = new Map<string, ProgramNode>()
  const duplicateFunctionNames = new Set<string>()

  for (const node of functions) {
    const functionName = node.text.trim()
    if (!functionName) {
      continue
    }

    if (functionsByName.has(functionName)) {
      duplicateFunctionNames.add(functionName)
      continue
    }

    functionsByName.set(functionName, node)
  }

  for (const functionName of duplicateFunctionNames) {
    errors.push(`Duplicate Function name "${functionName}".`)
  }

  if (functions.filter((node) => node.text.trim() === 'main').length !== 1) {
    errors.push('Program must have exactly one main Function.')
  }

  if (returns.length < 1) {
    errors.push('Program must have at least one Return node.')
  }

  const outgoingByNode = groupEdges(program.edges, 'source')
  const incomingByNode = groupEdges(program.edges, 'target')

  for (const node of program.nodes) {
    const outgoing = outgoingByNode.get(node.id) ?? []
    const incoming = incomingByNode.get(node.id) ?? []

    if (node.type === 'function') {
      if (incoming.length > 0) {
        errors.push(`Function node "${node.id}" cannot have incoming edges.`)
      }
      requireOutgoingCount(node, outgoing, 1, errors)
      rejectBranchLabelsFrom(outgoing, errors)
      continue
    }

    if (node.type === 'return') {
      if (outgoing.length > 0) {
        errors.push('Return nodes cannot have outgoing edges.')
      }
      continue
    }

    if (isBranchNodeType(node.type)) {
      validateBranchEdges(node, outgoing, errors)
      continue
    }

    requireOutgoingCount(node, outgoing, 1, errors)
    rejectBranchLabelsFrom(outgoing, errors)
  }

  validateExpressionCallTargets(program.nodes, functionsByName, errors)

  validateFunctionOwnership(program, functions, errors)

  return { valid: errors.length === 0, errors }
}

function isProgramShape(program: Program): boolean {
  if (!program || typeof program !== 'object') {
    return false
  }

  if (program.version !== 1) {
    return false
  }

  if (!Array.isArray(program.nodes) || !Array.isArray(program.edges)) {
    return false
  }

  return program.nodes.every(isNodeShape) && program.edges.every(isEdgeShape)
}

function isNodeShape(node: unknown): node is ProgramNode {
  if (!node || typeof node !== 'object') {
    return false
  }

  const candidate = node as ProgramNode
  return (
    typeof candidate.id === 'string' &&
    isFlowNodeType(candidate.type) &&
    typeof candidate.text === 'string' &&
    typeof candidate.position?.x === 'number' &&
    typeof candidate.position?.y === 'number'
  )
}

function isEdgeShape(edge: unknown): edge is ProgramEdge {
  if (!edge || typeof edge !== 'object') {
    return false
  }

  const candidate = edge as ProgramEdge
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.target === 'string' &&
    (candidate.label === undefined || isBranchLabel(candidate.label))
  )
}

function validateNodeText(node: ProgramNode, errors: string[]): void {
  const label = NODE_TYPE_LABELS[node.type]

  try {
    if (node.type === 'assignment') {
      const assignment = parseAssignment(node.text)
      if (assignment.target.kind === 'index') {
        parseExpression(assignment.target.indexExpression)
      }
      parseExpression(assignment.expression)
      return
    }

    if (node.type === 'function') {
      if (!isVariableName(node.text)) {
        throw new Error('Function name must be a valid name.')
      }
      return
    }

    if (node.type === 'input') {
      if (!isVariableName(node.text)) {
        throw new Error('Input must be a variable name.')
      }
      return
    }

    if (node.type === 'for') {
      const forLoop = parseForLoop(node.text)
      parseExpression(forLoop.iterableExpression)
      return
    }

    if (
      node.type === 'output' ||
      node.type === 'if' ||
      node.type === 'while' ||
      node.type === 'return'
    ) {
      if (!node.text.trim()) {
        throw new Error(`${label} text cannot be empty.`)
      }
      parseExpression(node.text)
    }
  } catch (error) {
    errors.push(`${label} node "${node.id}" has invalid text: ${message(error)}`)
  }
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

function requireOutgoingCount(
  node: ProgramNode,
  outgoing: ProgramEdge[],
  count: number,
  errors: string[],
): void {
  if (outgoing.length !== count) {
    errors.push(
      `${NODE_TYPE_LABELS[node.type]} node "${node.id}" must have exactly ${count} outgoing edge.`,
    )
  }
}

function rejectBranchLabelsFrom(outgoing: ProgramEdge[], errors: string[]): void {
  for (const edge of outgoing) {
    if (edge.label !== undefined) {
      errors.push(
        `Edge "${edge.id}" has a branch label, but only If, While, and For nodes may use true/false labels.`,
      )
    }
  }
}

function validateBranchEdges(
  node: ProgramNode,
  outgoing: ProgramEdge[],
  errors: string[],
): void {
  if (outgoing.length !== 2) {
    errors.push(
      `${NODE_TYPE_LABELS[node.type]} node "${node.id}" must have exactly two outgoing edges labeled true and false.`,
    )
  }

  const labels = outgoing.map((edge) => edge.label)
  const hasTrue = labels.includes('true')
  const hasFalse = labels.includes('false')

  if (!hasTrue || !hasFalse || labels.length !== new Set(labels).size) {
    errors.push(
      `${NODE_TYPE_LABELS[node.type]} node "${node.id}" must have one true edge and one false edge.`,
    )
  }
}

function validateExpressionCallTargets(
  nodes: ProgramNode[],
  functionsByName: Map<string, ProgramNode>,
  errors: string[],
): void {
  for (const node of nodes) {
    const expressions = expressionSourcesForNode(node)
    const missingFunctionNames = new Set<string>()

    for (const expression of expressions) {
      try {
        for (const functionName of findExpressionCallNames(expression)) {
          if (
            !isBuiltInFunctionName(functionName) &&
            !functionsByName.has(functionName)
          ) {
            missingFunctionNames.add(functionName)
          }
        }
      } catch {
        // Invalid expression text is reported by validateNodeText.
      }
    }

    for (const functionName of missingFunctionNames) {
      errors.push(
        `${NODE_TYPE_LABELS[node.type]} node "${node.id}" calls missing Function "${functionName}".`,
      )
    }
  }
}

function expressionSourcesForNode(node: ProgramNode): string[] {
  try {
    if (node.type === 'assignment') {
      const assignment = parseAssignment(node.text)
      return assignment.target.kind === 'index'
        ? [assignment.target.indexExpression, assignment.expression]
        : [assignment.expression]
    }

    if (node.type === 'for') {
      return [parseForLoop(node.text).iterableExpression]
    }

    if (
      node.type === 'output' ||
      node.type === 'if' ||
      node.type === 'while' ||
      node.type === 'return'
    ) {
      return [node.text]
    }
  } catch {
    // Invalid statement text is reported by validateNodeText.
  }

  return []
}

function validateFunctionOwnership(
  program: Program,
  functions: ProgramNode[],
  errors: string[],
): void {
  const ownersByNodeId = findFunctionOwners(program, functions)

  for (const node of program.nodes) {
    if (node.type === 'function') {
      continue
    }

    const owners = ownersByNodeId.get(node.id) ?? new Set<string>()

    if (owners.size === 0) {
      errors.push(`Node "${node.id}" is not reachable from any Function.`)
      continue
    }

    if (owners.size > 1) {
      errors.push(`Node "${node.id}" is reachable from more than one Function.`)
    }
  }
}

function findFunctionOwners(
  program: Program,
  functions: ProgramNode[],
): Map<string, Set<string>> {
  const outgoingByNode = groupEdges(program.edges, 'source')
  const ownersByNodeId = new Map<string, Set<string>>()

  for (const functionNode of functions) {
    const visited = new Set<string>()
    const stack = [functionNode.id]

    while (stack.length > 0) {
      const nodeId = stack.pop()
      if (!nodeId || visited.has(nodeId)) {
        continue
      }

      visited.add(nodeId)

      const node = program.nodes.find((candidate) => candidate.id === nodeId)
      if (!node) {
        continue
      }

      if (node.type !== 'function') {
        const owners = ownersByNodeId.get(node.id) ?? new Set<string>()
        owners.add(functionNode.id)
        ownersByNodeId.set(node.id, owners)
      }

      for (const edge of outgoingByNode.get(nodeId) ?? []) {
        stack.push(edge.target)
      }
    }
  }

  return ownersByNodeId
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
