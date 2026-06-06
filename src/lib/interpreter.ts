import {
  evaluateExpression,
  stringifyValue,
  toBoolean,
} from './expression'
import {
  parseAssignment,
  parseForLoop,
  type AssignmentTarget,
} from './statements'
import {
  isBranchNodeType,
  type BranchLabel,
  type Environment,
  type Program,
  type ProgramEdge,
  type ProgramNode,
  type RuntimeValue,
} from './types'
import { validateProgram } from './validation'

export type ExecutionStatus =
  | 'running'
  | 'waiting'
  | 'halted'
  | 'error'

export interface ExecutionOptions {
  maxSteps?: number
  importedPrograms?: Program[]
}

interface ImportedFunctionDefinition {
  name: string
  program: Program
  node: ProgramNode
}

interface ForLoopFrame {
  variable: string
  values: RuntimeValue[]
  index: number
}

interface CompletedExpressionResult {
  status: 'complete'
  value: RuntimeValue
  output: string[]
}

interface SuspendedExpressionResult {
  status: 'suspended'
  call: FunctionCallRequest
}

type ProgramExpressionResult = CompletedExpressionResult | SuspendedExpressionResult

type AssignListElementResult =
  | {
      status: 'complete'
      environment: Environment
      output: string[]
    }
  | {
      status: 'suspended'
      pendingNode: Extract<PendingNode, { kind: 'assignment' }>
      call: FunctionCallRequest
    }

interface ExpressionProgress {
  source: string
  completedCalls: RuntimeValue[]
}

type PendingExpressionKey = 'expression' | 'valueExpression' | 'indexExpression'

type PendingNode =
  | {
      kind: 'assignment'
      node: ProgramNode
      assignment: ReturnType<typeof parseAssignment>
      valueExpression: ExpressionProgress
      value?: RuntimeValue
      indexExpression?: ExpressionProgress
    }
  | {
      kind: 'output'
      node: ProgramNode
      expression: ExpressionProgress
    }
  | {
      kind: 'branch'
      node: ProgramNode
      expression: ExpressionProgress
    }
  | {
      kind: 'for'
      node: ProgramNode
      forLoop: ReturnType<typeof parseForLoop>
      expression: ExpressionProgress
    }
  | {
      kind: 'return'
      node: ProgramNode
      expression: ExpressionProgress
    }

interface FunctionCallRequest {
  name: string
  args: RuntimeValue[]
  callIndex: number
}

interface SuspendedFrame {
  program: Program
  currentNodeId: string | null
  environment: Environment
  forLoops: Record<string, ForLoopFrame>
  inputQueue: RuntimeValue[]
  functionName: string
  pendingNode: PendingNode
  pendingExpressionKey: PendingExpressionKey
  pendingCallIndex: number
}

export interface ExecutionState {
  rootProgram: Program
  program: Program
  importedFunctions: ImportedFunctionDefinition[]
  currentNodeId: string | null
  environment: Environment
  forLoops: Record<string, ForLoopFrame>
  callStack: SuspendedFrame[]
  inputQueue: RuntimeValue[]
  output: string[]
  status: ExecutionStatus
  steps: number
  maxSteps: number
  functionName: string
  returnValue?: RuntimeValue
  error?: string
}

const DEFAULT_MAX_STEPS = 10000
const MAX_FUNCTION_CALL_DEPTH = 100

class FunctionCallSuspension extends Error {
  readonly call: FunctionCallRequest

  constructor(call: FunctionCallRequest) {
    super(`Function call "${call.name}" suspended.`)
    this.call = call
  }
}

export function createExecution(
  program: Program,
  inputQueue: string[],
  options: ExecutionOptions = {},
): ExecutionState {
  const importedFunctions = buildImportedFunctionDefinitions(
    program,
    options.importedPrograms ?? [],
  )
  const validation = validateProgram(program, {
    externalFunctionNames: new Set(
      importedFunctions.map((definition) => definition.name),
    ),
  })
  const mainFunction = program.nodes.find(
    (node) => node.type === 'function' && node.text.trim() === 'main',
  )

  if (!validation.valid || !mainFunction) {
    return {
      rootProgram: program,
      program,
      importedFunctions,
      currentNodeId: null,
      environment: {},
      forLoops: {},
      callStack: [],
      inputQueue: inputQueue.map(parseInputValue),
      output: [],
      status: 'error',
      steps: 0,
      maxSteps: options.maxSteps ?? DEFAULT_MAX_STEPS,
      functionName: 'main',
      error: validation.errors.join('\n') || 'Program cannot start.',
    }
  }

  return {
    rootProgram: program,
    program,
    importedFunctions,
    currentNodeId: mainFunction.id,
    environment: {},
    forLoops: {},
    callStack: [],
    inputQueue: inputQueue.map(parseInputValue),
    output: [],
    status: 'running',
    steps: 0,
    maxSteps: options.maxSteps ?? DEFAULT_MAX_STEPS,
    functionName: 'main',
  }
}

export function runExecution(state: ExecutionState): ExecutionState {
  let nextState = state

  while (nextState.status === 'running' && nextState.currentNodeId) {
    nextState = stepExecution(nextState)
  }

  return nextState
}

export function stepExecution(state: ExecutionState): ExecutionState {
  if (state.status === 'halted' || state.status === 'error') {
    return state
  }

  if (state.status === 'waiting' && state.inputQueue.length === 0) {
    return state
  }

  if (!state.currentNodeId) {
    return { ...state, status: 'halted' }
  }

  if (state.steps >= state.maxSteps) {
    return {
      ...state,
      status: 'error',
      error: `Maximum step count of ${state.maxSteps} was reached.`,
    }
  }

  const node = state.program.nodes.find(
    (candidate) => candidate.id === state.currentNodeId,
  )

  if (!node) {
    return fail(state, `Current node "${state.currentNodeId}" is missing.`)
  }

  try {
    return executeNode({ ...state, status: 'running', steps: state.steps + 1 }, node)
  } catch (error) {
    return fail(state, error instanceof Error ? error.message : String(error))
  }
}

function executeNode(state: ExecutionState, node: ProgramNode): ExecutionState {
  if (node.type === 'return') {
    return executeReturnNode(state, {
      kind: 'return',
      node,
      expression: createExpressionProgress(node.text),
    })
  }

  if (node.type === 'function') {
    return advance(state, node)
  }

  if (node.type === 'assignment') {
    const assignment = parseAssignment(node.text)
    return executeAssignmentNode(state, {
      kind: 'assignment',
      node,
      assignment,
      valueExpression: createExpressionProgress(assignment.expression),
      indexExpression:
        assignment.target.kind === 'index'
          ? createExpressionProgress(assignment.target.indexExpression)
          : undefined,
    })
  }

  if (node.type === 'input') {
    if (state.inputQueue.length === 0) {
      return { ...state, currentNodeId: node.id, status: 'waiting' }
    }

    const [value, ...remainingInput] = state.inputQueue
    return advance(
      {
        ...state,
        inputQueue: remainingInput,
        environment: {
          ...state.environment,
          [node.text.trim()]: value,
        },
      },
      node,
    )
  }

  if (node.type === 'output') {
    return executeOutputNode(state, {
      kind: 'output',
      node,
      expression: createExpressionProgress(node.text),
    })
  }

  if (node.type === 'for') {
    return executeForNode(state, node)
  }

  if (isBranchNodeType(node.type)) {
    return executeBranchNode(state, {
      kind: 'branch',
      node,
      expression: createExpressionProgress(node.text),
    })
  }

  return fail(state, `Unsupported node type "${node.type}".`)
}

function advance(
  state: ExecutionState,
  node: ProgramNode,
  branchLabel?: BranchLabel,
): ExecutionState {
  const edge = findNextEdge(state.program.edges, node, branchLabel)

  if (!edge) {
    return fail(
      state,
      branchLabel
        ? `Node "${node.id}" does not have a ${branchLabel} edge.`
        : `Node "${node.id}" does not have an outgoing edge.`,
    )
  }

  return { ...state, currentNodeId: edge.target, status: 'running' }
}

function findNextEdge(
  edges: ProgramEdge[],
  node: ProgramNode,
  branchLabel?: BranchLabel,
): ProgramEdge | undefined {
  const outgoing = edges.filter((edge) => edge.source === node.id)

  if (branchLabel) {
    return outgoing.find((edge) => edge.label === branchLabel)
  }

  return outgoing[0]
}

function createExpressionProgress(source: string): ExpressionProgress {
  return { source, completedCalls: [] }
}

function executePendingNode(
  state: ExecutionState,
  pendingNode: PendingNode,
): ExecutionState {
  switch (pendingNode.kind) {
    case 'assignment':
      return executeAssignmentNode(state, pendingNode)
    case 'output':
      return executeOutputNode(state, pendingNode)
    case 'branch':
      return executeBranchNode(state, pendingNode)
    case 'for':
      return executeForPendingNode(state, pendingNode)
    case 'return':
      return executeReturnNode(state, pendingNode)
  }
}

function executeAssignmentNode(
  state: ExecutionState,
  pendingNode: Extract<PendingNode, { kind: 'assignment' }>,
): ExecutionState {
  let nextState = state
  let pending = pendingNode
  let value: RuntimeValue

  if (Object.prototype.hasOwnProperty.call(pending, 'value')) {
    value = pending.value as RuntimeValue
  } else {
    const result = evaluateProgramExpression(
      nextState,
      pending.valueExpression,
    )

    if (result.status === 'suspended') {
      return startFunctionCall(nextState, pending, 'valueExpression', result.call)
    }

    nextState = { ...nextState, output: result.output }
    value = result.value
    pending = { ...pending, value }
  }

  if (pending.assignment.target.kind === 'index') {
    if (!pending.indexExpression) {
      return fail(nextState, 'Indexed assignment is missing an index expression.')
    }

    const assignmentResult = assignListElement(
      nextState,
      nextState.environment,
      pending.assignment.target,
      value,
      pending,
      pending.indexExpression,
    )

    if (assignmentResult.status === 'suspended') {
      return startFunctionCall(
        nextState,
        assignmentResult.pendingNode,
        'indexExpression',
        assignmentResult.call,
      )
    }

    return advance(
      {
        ...nextState,
        output: assignmentResult.output,
        environment: assignmentResult.environment,
      },
      pending.node,
    )
  }

  return advance(
    {
      ...nextState,
      environment: {
        ...nextState.environment,
        [pending.assignment.target.variable]: value,
      },
    },
    pending.node,
  )
}

function executeOutputNode(
  state: ExecutionState,
  pendingNode: Extract<PendingNode, { kind: 'output' }>,
): ExecutionState {
  const result = evaluateProgramExpression(state, pendingNode.expression)

  if (result.status === 'suspended') {
    return startFunctionCall(state, pendingNode, 'expression', result.call)
  }

  return advance(
    { ...state, output: [...result.output, stringifyValue(result.value)] },
    pendingNode.node,
  )
}

function executeBranchNode(
  state: ExecutionState,
  pendingNode: Extract<PendingNode, { kind: 'branch' }>,
): ExecutionState {
  const result = evaluateProgramExpression(state, pendingNode.expression)

  if (result.status === 'suspended') {
    return startFunctionCall(state, pendingNode, 'expression', result.call)
  }

  return advance(
    { ...state, output: result.output },
    pendingNode.node,
    toBoolean(result.value) ? 'true' : 'false',
  )
}

function executeReturnNode(
  state: ExecutionState,
  pendingNode: Extract<PendingNode, { kind: 'return' }>,
): ExecutionState {
  const result = evaluateProgramExpression(state, pendingNode.expression)

  if (result.status === 'suspended') {
    return startFunctionCall(state, pendingNode, 'expression', result.call)
  }

  return completeReturn(state, pendingNode.node, result.value, result.output)
}

function completeReturn(
  state: ExecutionState,
  node: ProgramNode,
  value: RuntimeValue,
  output: string[],
): ExecutionState {
  if (state.callStack.length === 0) {
    return {
      ...state,
      currentNodeId: node.id,
      output,
      returnValue: value,
      status: 'halted',
    }
  }

  const callerFrame = state.callStack[state.callStack.length - 1]
  const pendingNode = addCompletedCallResult(
    callerFrame.pendingNode,
    callerFrame.pendingExpressionKey,
    callerFrame.pendingCallIndex,
    value,
  )

  return executePendingNode(
    {
      ...state,
      program: callerFrame.program,
      currentNodeId: callerFrame.currentNodeId,
      environment: callerFrame.environment,
      forLoops: callerFrame.forLoops,
      inputQueue: callerFrame.inputQueue,
      functionName: callerFrame.functionName,
      callStack: state.callStack.slice(0, -1),
      output,
      returnValue: value,
      status: 'running',
    },
    pendingNode,
  )
}

function evaluateProgramExpression(
  state: ExecutionState,
  progress: ExpressionProgress,
  environment: Environment = state.environment,
): ProgramExpressionResult {
  let callIndex = 0

  try {
    const value = evaluateExpression(progress.source, environment, {
      callFunction: (name, args) => {
        const currentCallIndex = callIndex
        callIndex += 1

        if (
          Object.prototype.hasOwnProperty.call(
            progress.completedCalls,
            currentCallIndex,
          )
        ) {
          return progress.completedCalls[currentCallIndex]
        }

        throw new FunctionCallSuspension({
          name,
          args,
          callIndex: currentCallIndex,
        })
      },
    })

    return { status: 'complete', value, output: state.output }
  } catch (error) {
    if (error instanceof FunctionCallSuspension) {
      return { status: 'suspended', call: error.call }
    }

    throw error
  }
}

function startFunctionCall(
  state: ExecutionState,
  pendingNode: PendingNode,
  pendingExpressionKey: PendingExpressionKey,
  call: FunctionCallRequest,
): ExecutionState {
  if (state.callStack.length >= MAX_FUNCTION_CALL_DEPTH) {
    throw new Error(
      `Maximum function call depth of ${MAX_FUNCTION_CALL_DEPTH} was reached.`,
    )
  }

  const functionNode = state.program.nodes.find(
    (candidate) =>
      candidate.type === 'function' && candidate.text.trim() === call.name,
  )
  const rootFunctionNode =
    state.program === state.rootProgram
      ? functionNode
      : findFunctionNode(state.rootProgram, call.name)
  const activeFunctionNode = rootFunctionNode ?? functionNode
  const importedFunction =
    activeFunctionNode ? undefined : findImportedFunction(state, call.name)
  const targetProgram = rootFunctionNode
    ? state.rootProgram
    : activeFunctionNode
      ? state.program
      : importedFunction?.program
  const targetFunctionNode = activeFunctionNode ?? importedFunction?.node

  if (!targetProgram || !targetFunctionNode) {
    throw new Error(`Function "${call.name}" does not exist.`)
  }

  return {
    ...state,
    program: targetProgram,
    currentNodeId: targetFunctionNode.id,
    environment: {},
    forLoops: {},
    inputQueue: [...call.args],
    functionName: call.name,
    callStack: [
      ...state.callStack,
      {
        program: state.program,
        currentNodeId: state.currentNodeId,
        environment: state.environment,
        forLoops: state.forLoops,
        inputQueue: state.inputQueue,
        functionName: state.functionName,
        pendingNode,
        pendingExpressionKey,
        pendingCallIndex: call.callIndex,
      },
    ],
    status: 'running',
  }
}

function addCompletedCallResult(
  pendingNode: PendingNode,
  key: PendingExpressionKey,
  callIndex: number,
  value: RuntimeValue,
): PendingNode {
  const progress = expressionProgressForKey(pendingNode, key)
  const completedCalls = [...progress.completedCalls]
  completedCalls[callIndex] = value
  const nextProgress = { ...progress, completedCalls }

  switch (key) {
    case 'expression':
      return { ...pendingNode, expression: nextProgress } as PendingNode
    case 'valueExpression':
      if (pendingNode.kind !== 'assignment') {
        throw new Error('Only Assignment nodes have value expressions.')
      }
      return { ...pendingNode, valueExpression: nextProgress }
    case 'indexExpression':
      if (pendingNode.kind !== 'assignment') {
        throw new Error('Only Assignment nodes have index expressions.')
      }
      return { ...pendingNode, indexExpression: nextProgress }
  }
}

function expressionProgressForKey(
  pendingNode: PendingNode,
  key: PendingExpressionKey,
): ExpressionProgress {
  switch (key) {
    case 'expression':
      if ('expression' in pendingNode) {
        return pendingNode.expression
      }
      break
    case 'valueExpression':
      if (pendingNode.kind === 'assignment') {
        return pendingNode.valueExpression
      }
      break
    case 'indexExpression':
      if (pendingNode.kind === 'assignment' && pendingNode.indexExpression) {
        return pendingNode.indexExpression
      }
      break
  }

  throw new Error('Pending expression is missing.')
}

function executeForNode(
  state: ExecutionState,
  node: ProgramNode,
): ExecutionState {
  const forLoop = parseForLoop(node.text)
  const existingFrame = state.forLoops[node.id]
  if (!existingFrame) {
    return executeForPendingNode(state, {
      kind: 'for',
      node,
      forLoop,
      expression: createExpressionProgress(forLoop.iterableExpression),
    })
  }

  return advanceForLoop(state, node, existingFrame, state.output)
}

function executeForPendingNode(
  state: ExecutionState,
  pendingNode: Extract<PendingNode, { kind: 'for' }>,
): ExecutionState {
  const result = evaluateProgramExpression(state, pendingNode.expression)

  if (result.status === 'suspended') {
    return startFunctionCall(state, pendingNode, 'expression', result.call)
  }

  return advanceForLoop(
    state,
    pendingNode.node,
    createForLoopFrame(pendingNode.forLoop, result.value),
    result.output,
  )
}

function advanceForLoop(
  state: ExecutionState,
  node: ProgramNode,
  frame: ForLoopFrame,
  output: string[],
): ExecutionState {
  if (frame.index >= frame.values.length) {
    const remainingForLoops = { ...state.forLoops }
    delete remainingForLoops[node.id]
    return advance(
      { ...state, output, forLoops: remainingForLoops },
      node,
      'false',
    )
  }

  const value = frame.values[frame.index]
  return advance(
    {
      ...state,
      output,
      environment: {
        ...state.environment,
        [frame.variable]: value,
      },
      forLoops: {
        ...state.forLoops,
        [node.id]: {
          ...frame,
          index: frame.index + 1,
        },
      },
    },
    node,
    'true',
  )
}

function createForLoopFrame(
  forLoop: ReturnType<typeof parseForLoop>,
  iterable: RuntimeValue,
): ForLoopFrame {
  if (typeof iterable === 'string') {
    return {
      variable: forLoop.variable,
      values: Array.from(iterable),
      index: 0,
    }
  }

  if (Array.isArray(iterable)) {
    return {
      variable: forLoop.variable,
      values: [...iterable],
      index: 0,
    }
  }

  throw new Error('For loop iterable must be a string or list')
}

function assignListElement(
  state: ExecutionState,
  environment: Environment,
  target: Extract<AssignmentTarget, { kind: 'index' }>,
  value: RuntimeValue,
  pendingNode: Extract<PendingNode, { kind: 'assignment' }>,
  indexExpression: ExpressionProgress,
): AssignListElementResult {
  const { variable } = target

  if (!Object.prototype.hasOwnProperty.call(environment, variable)) {
    throw new Error(`Undefined variable "${variable}"`)
  }

  const currentValue = environment[variable]

  if (!Array.isArray(currentValue)) {
    throw new Error(`Indexed assignment target "${variable}" must be a list`)
  }

  const indexResult = evaluateProgramExpression(
    state,
    indexExpression,
    environment,
  )

  if (indexResult.status === 'suspended') {
    return {
      status: 'suspended',
      pendingNode,
      call: indexResult.call,
    }
  }

  const { value: indexValue, output } = indexResult
  const index = requireListIndex(indexValue)

  if (index >= currentValue.length) {
    throw new Error(`Index ${index} is out of range`)
  }

  const nextValue = [...currentValue]
  nextValue[index] = value

  return {
    status: 'complete',
    environment: {
      ...environment,
      [variable]: nextValue,
    },
    output,
  }
}

function requireListIndex(value: RuntimeValue): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('Index must be a number')
  }

  return value
}

function buildImportedFunctionDefinitions(
  program: Program,
  importedPrograms: Program[],
): ImportedFunctionDefinition[] {
  const currentFunctionNames = new Set(
    program.nodes
      .filter((node) => node.type === 'function')
      .map((node) => node.text.trim()),
  )
  const importedFunctionNames = new Set<string>()
  const definitions: ImportedFunctionDefinition[] = []

  for (const importedProgram of importedPrograms) {
    for (const node of importedProgram.nodes) {
      const name = node.text.trim()

      if (
        node.type !== 'function' ||
        name === 'main' ||
        currentFunctionNames.has(name) ||
        importedFunctionNames.has(name)
      ) {
        continue
      }

      importedFunctionNames.add(name)
      definitions.push({ name, program: importedProgram, node })
    }
  }

  return definitions
}

function findFunctionNode(
  program: Program,
  name: string,
): ProgramNode | undefined {
  return program.nodes.find(
    (candidate) =>
      candidate.type === 'function' && candidate.text.trim() === name,
  )
}

function findImportedFunction(
  state: ExecutionState,
  name: string,
): ImportedFunctionDefinition | undefined {
  return state.importedFunctions.find((definition) => definition.name === name)
}

function parseInputValue(rawValue: string): RuntimeValue {
  const trimmed = rawValue.trim()

  if (trimmed === '') {
    return ''
  }

  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    return Number(trimmed)
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const evaluated = evaluateExpression(trimmed, {})
    return Array.isArray(evaluated) ? evaluated : rawValue
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const evaluated = evaluateExpression(trimmed, {})
    return typeof evaluated === 'string' ? evaluated : trimmed
  }

  return rawValue
}

function fail(state: ExecutionState, error: string): ExecutionState {
  return { ...state, status: 'error', error }
}
