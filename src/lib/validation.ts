import {
  findExpressionCallNames,
  isBuiltInFunctionName,
  parseCallExpression,
  parseExpression,
} from './expression'
import {
  isVariableName,
  parseAssignment,
  parseClassDeclaration,
  parseForLoop,
  parseMethodDeclaration,
} from './statements'
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

export interface ValidationOptions {
  externalFunctionNames?: Set<string>
  externalClassNames?: Set<string>
}

export function normalizeImportedProgram(value: unknown): Program {
  if (!value || typeof value !== 'object') {
    return value as Program
  }

  const candidate = value as {
    version?: unknown
    nodes?: unknown
    edges?: unknown
    imports?: unknown
    inputQueue?: unknown
  }

  if (!Array.isArray(candidate.nodes)) {
    return value as Program
  }

  return {
    version: candidate.version as 1,
    ...(typeof candidate.imports === 'string'
      ? { imports: candidate.imports }
      : {}),
    ...(typeof candidate.inputQueue === 'string'
      ? { inputQueue: candidate.inputQueue }
      : {}),
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

export function validateProgram(
  program: Program,
  options: ValidationOptions = {},
): ValidationResult {
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
  const classes = program.nodes.filter((node) => node.type === 'class')
  const methods = program.nodes.filter((node) => node.type === 'method')
  const returns = program.nodes.filter((node) => node.type === 'return')
  const functionsByName = new Map<string, ProgramNode>()
  const classesByName = new Map<string, ProgramNode>()
  const methodsByName = new Map<string, ProgramNode>()
  const duplicateFunctionNames = new Set<string>()
  const duplicateClassNames = new Set<string>()
  const duplicateMethodNames = new Set<string>()

  for (const node of functions) {
    const functionName = node.text.trim()
    if (!functionName) {
      continue
    }

    if (isBuiltInFunctionName(functionName)) {
      errors.push(`Function name "${functionName}" is reserved for a built-in.`)
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

  for (const node of classes) {
    try {
      const declaration = parseClassDeclaration(node.text)

      if (isBuiltInFunctionName(declaration.name)) {
        errors.push(`Class name "${declaration.name}" is reserved for a built-in.`)
      }

      if (classesByName.has(declaration.name)) {
        duplicateClassNames.add(declaration.name)
      } else {
        classesByName.set(declaration.name, node)
      }

      const duplicateFields = duplicateNames(declaration.fields)
      for (const field of duplicateFields) {
        errors.push(`Class "${declaration.name}" has duplicate field "${field}".`)
      }
    } catch {
      // Invalid Class text is reported by validateNodeText.
    }
  }

  for (const className of duplicateClassNames) {
    errors.push(`Duplicate Class name "${className}".`)
  }

  for (const node of methods) {
    try {
      const declaration = parseMethodDeclaration(node.text)
      const qualifiedName = `${declaration.className}.${declaration.methodName}`

      if (methodsByName.has(qualifiedName)) {
        duplicateMethodNames.add(qualifiedName)
      } else {
        methodsByName.set(qualifiedName, node)
      }

      if (
        !classesByName.has(declaration.className) &&
        !options.externalClassNames?.has(declaration.className)
      ) {
        errors.push(
          `Method "${qualifiedName}" references missing Class "${declaration.className}".`,
        )
      }
    } catch {
      // Invalid Method text is reported by validateNodeText.
    }
  }

  for (const methodName of duplicateMethodNames) {
    errors.push(`Duplicate Method name "${methodName}".`)
  }

  for (const name of functionsByName.keys()) {
    if (classesByName.has(name)) {
      errors.push(`Function and Class cannot both use the name "${name}".`)
    }
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

    if (node.type === 'class') {
      if (incoming.length > 0 || outgoing.length > 0) {
        errors.push(`Class node "${node.id}" cannot have incoming or outgoing edges.`)
      }
      continue
    }

    if (node.type === 'function' || node.type === 'method') {
      if (incoming.length > 0) {
        errors.push(
          `${NODE_TYPE_LABELS[node.type]} node "${node.id}" cannot have incoming edges.`,
        )
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

  validateExpressionCallTargets(
    program.nodes,
    functionsByName,
    classesByName,
    options.externalFunctionNames ?? new Set<string>(),
    errors,
  )

  const ownersByNodeId = findFunctionOwners(program, [...functions, ...methods])
  validateFunctionOwnership(program, ownersByNodeId, errors)
  validateMethodSelfBindings(program, methods, ownersByNodeId, errors)

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
    (candidate.comment === undefined || typeof candidate.comment === 'string') &&
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

    if (node.type === 'call') {
      if (!node.text.trim()) {
        throw new Error(`${label} text cannot be empty.`)
      }
      parseCallExpression(node.text)
      return
    }

    if (node.type === 'function') {
      if (!isVariableName(node.text)) {
        throw new Error('Function name must be a valid name.')
      }
      return
    }

    if (node.type === 'class') {
      parseClassDeclaration(node.text)
      return
    }

    if (node.type === 'method') {
      parseMethodDeclaration(node.text)
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
  classesByName: Map<string, ProgramNode>,
  externalFunctionNames: Set<string>,
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
            !functionsByName.has(functionName) &&
            !classesByName.has(functionName) &&
            !externalFunctionNames.has(functionName)
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

    if (node.type === 'call') {
      return [node.text]
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
  ownersByNodeId: Map<string, Set<string>>,
  errors: string[],
): void {
  for (const node of program.nodes) {
    if (node.type === 'function' || node.type === 'method' || node.type === 'class') {
      continue
    }

    const owners = ownersByNodeId.get(node.id) ?? new Set<string>()

    if (owners.size === 0) {
      errors.push(`Node "${node.id}" is not reachable from any Function or Method.`)
      continue
    }

    if (owners.size > 1) {
      errors.push(`Node "${node.id}" is reachable from more than one Function or Method.`)
    }
  }
}

function validateMethodSelfBindings(
  program: Program,
  methods: ProgramNode[],
  ownersByNodeId: Map<string, Set<string>>,
  errors: string[],
): void {
  const methodsById = new Map(methods.map((method) => [method.id, method]))

  for (const node of program.nodes) {
    if (!bindsVariable(node, 'self')) {
      continue
    }

    const owningMethods = [...(ownersByNodeId.get(node.id) ?? [])]
      .map((ownerId) => methodsById.get(ownerId))
      .filter((method): method is ProgramNode => Boolean(method))

    for (const method of owningMethods) {
      errors.push(
        `${NODE_TYPE_LABELS[node.type]} node "${node.id}" in Method "${method.text.trim()}" cannot bind the reserved receiver name "self".`,
      )
    }
  }
}

function bindsVariable(node: ProgramNode, variable: string): boolean {
  try {
    if (node.type === 'input') {
      return node.text.trim() === variable
    }

    if (node.type === 'assignment') {
      const assignment = parseAssignment(node.text)
      return (
        assignment.target.kind === 'variable' &&
        assignment.target.variable === variable
      )
    }

    if (node.type === 'for') {
      return parseForLoop(node.text).variable === variable
    }
  } catch {
    // Invalid statement text is reported by validateNodeText.
  }

  return false
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

      if (node.type !== 'function' && node.type !== 'method') {
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

function duplicateNames(names: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const name of names) {
    if (seen.has(name)) {
      duplicates.add(name)
    } else {
      seen.add(name)
    }
  }

  return [...duplicates]
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
