import {
  evaluateExpression,
  toBoolean,
} from './expression'
import {
  isDictionaryKey,
  isRuntimeDictionary,
  isRuntimeObject,
  setDictionaryValue,
} from './runtimeValues'
import {
  parseAssignment,
  parseClassDeclaration,
  parseForLoop,
  splitProcessStatements,
  type AssignmentTarget,
  type ProcessStatementSource,
} from './statements'
import {
  attachedMethodDefinition,
  objectDunderInputCount,
  objectDunderMethodForOperator,
  OBJECT_COMPARISON_DUNDER_METHOD_NAMES,
  OBJECT_REPR_METHOD_NAME,
} from './classMethods'
import {
  isBranchNodeType,
  type BranchLabel,
  type Environment,
  type Program,
  type ProgramEdge,
  type ProgramNode,
  type RuntimeDictionary,
  type RuntimeObject,
  type RuntimeValue,
} from './types'
import {
  isTextFunctionName,
  splitWords,
  TEXT_FUNCTION_NAMES,
  TEXT_LIBRARY_NAME,
  validateTextFromUrlArguments,
} from './text'
import {
  initialTurtleState,
  isTurtleCommandName,
  runTurtleCommand,
  TURTLE_COMMAND_NAMES,
  TURTLE_LIBRARY_NAME,
  type TurtleState,
} from './turtle'
import { validateProgram } from './validation'

export type ExecutionStatus =
  | 'running'
  | 'waiting'
  | 'asking'
  | 'loading'
  | 'halted'
  | 'error'

export interface ExecutionOptions {
  maxSteps?: number
  importedPrograms?: Program[]
  nativeLibraries?: string[]
}

interface ImportedFunctionDefinition {
  name: string
  program: Program
  node: ProgramNode
}

interface ImportedClassDefinition {
  name: string
  fields: string[]
  program: Program
  node: ProgramNode
}

interface ImportedMethodDefinition {
  name: string
  className: string
  methodName: string
  program: Program
  node: ProgramNode
}

interface ImportedDefinitions {
  functions: ImportedFunctionDefinition[]
  classes: ImportedClassDefinition[]
  methods: ImportedMethodDefinition[]
}

export interface RuntimeObjectInstance {
  id: number
  className: string
  fields: Record<string, RuntimeValue>
}

export type ObjectHeap = Record<number, RuntimeObjectInstance>

interface ForLoopFrame {
  variable: string
  values: RuntimeValue[]
  index: number
}

interface CompletedExpressionResult {
  status: 'complete'
  value: RuntimeValue
  output: string[]
  turtle?: TurtleState
  objectHeap: ObjectHeap
  nextObjectId: number
}

interface SuspendedExpressionResult {
  status: 'suspended'
  call: FunctionCallRequest
  turtle?: TurtleState
  objectHeap: ObjectHeap
  nextObjectId: number
}

interface AskingExpressionResult {
  status: 'asking'
  ask: AskCallRequest
  turtle?: TurtleState
  objectHeap: ObjectHeap
  nextObjectId: number
}

interface LoadingExpressionResult {
  status: 'loading'
  textLoad: TextLoadCallRequest
  turtle?: TurtleState
  objectHeap: ObjectHeap
  nextObjectId: number
}

type ProgramExpressionResult =
  | CompletedExpressionResult
  | SuspendedExpressionResult
  | AskingExpressionResult
  | LoadingExpressionResult

type AssignIndexedElementResult =
  | {
      status: 'complete'
      environment: Environment
      output: string[]
      turtle?: TurtleState
      objectHeap: ObjectHeap
      nextObjectId: number
    }
  | {
      status: 'suspended'
      pendingNode: Extract<PendingNode, { kind: 'assignment' }>
      call: FunctionCallRequest
      turtle?: TurtleState
      objectHeap: ObjectHeap
      nextObjectId: number
    }
  | {
      status: 'asking'
      pendingNode: Extract<PendingNode, { kind: 'assignment' }>
      ask: AskCallRequest
      turtle?: TurtleState
      objectHeap: ObjectHeap
      nextObjectId: number
    }
  | {
      status: 'loading'
      pendingNode: Extract<PendingNode, { kind: 'assignment' }>
      textLoad: TextLoadCallRequest
      turtle?: TurtleState
      objectHeap: ObjectHeap
      nextObjectId: number
    }

interface ExpressionProgress {
  source: string
  completedCalls: Record<number, RuntimeValue>
  completedVariableReads: Record<number, RuntimeValue>
  completedMemberReads: Record<number, RuntimeValue>
  completedRandomValues: Record<number, number>
}

interface RepresentationProgress {
  value: RuntimeValue
  completedReprs: Record<number, RuntimeValue>
}

interface ProcessProgress {
  statements: ProcessStatementSource[]
  statementIndex: number
}

type PendingExpressionKey =
  | 'expression'
  | 'valueExpression'
  | 'indexExpression'
  | 'representation'

type PendingNode =
  | {
      kind: 'assignment'
      node: ProgramNode
      assignment: ReturnType<typeof parseAssignment>
      valueExpression: ExpressionProgress
      value?: RuntimeValue
      indexExpression?: ExpressionProgress
      indexTarget?: { value: RuntimeValue; receiver?: RuntimeObject }
      process?: ProcessProgress
    }
  | {
      kind: 'call'
      node: ProgramNode
      expression: ExpressionProgress
      process?: ProcessProgress
    }
  | {
      kind: 'output'
      node: ProgramNode
      expression: ExpressionProgress
      representation?: RepresentationProgress
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
  receiver?: RuntimeObject
}

interface ObjectOperatorDispatch {
  qualifiedName: string
  methodName: string
  negateBoolean: boolean
}

interface AskCallRequest {
  callIndex: number
}

interface TextLoadCallRequest {
  url: string
  callIndex: number
}

interface PendingAsk {
  pendingNode: PendingNode
  pendingExpressionKey: PendingExpressionKey
  pendingCallIndex: number
}

interface PendingTextLoad {
  url: string
  pendingNode: PendingNode
  pendingExpressionKey: PendingExpressionKey
  pendingCallIndex: number
}

interface SuspendedFrame {
  program: Program
  currentNodeId: string | null
  environment: Environment
  receiver?: RuntimeObject
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
  importedClasses: ImportedClassDefinition[]
  importedMethods: ImportedMethodDefinition[]
  nativeLibraries: string[]
  currentNodeId: string | null
  environment: Environment
  receiver?: RuntimeObject
  objectHeap: ObjectHeap
  nextObjectId: number
  forLoops: Record<string, ForLoopFrame>
  callStack: SuspendedFrame[]
  inputQueue: RuntimeValue[]
  output: string[]
  status: ExecutionStatus
  steps: number
  maxSteps: number
  functionName: string
  turtle?: TurtleState
  askRequest?: PendingAsk
  textRequest?: PendingTextLoad
  returnValue?: RuntimeValue
  error?: string
}

const DEFAULT_MAX_STEPS = 1000000
const MAX_FUNCTION_CALL_DEPTH = 100

class FunctionCallSuspension extends Error {
  readonly call: FunctionCallRequest

  constructor(call: FunctionCallRequest) {
    super(`Function call "${call.name}" suspended.`)
    this.call = call
  }
}

class AskSuspension extends Error {
  readonly ask: AskCallRequest

  constructor(ask: AskCallRequest) {
    super('ask() suspended.')
    this.ask = ask
  }
}

class TextLoadSuspension extends Error {
  readonly textLoad: TextLoadCallRequest

  constructor(textLoad: TextLoadCallRequest) {
    super(`Text URL load "${textLoad.url}" suspended.`)
    this.textLoad = textLoad
  }
}

class ProcessStatementExecutionError extends Error {}

export function createExecution(
  program: Program,
  inputQueue: string[],
  options: ExecutionOptions = {},
): ExecutionState {
  const nativeLibraries = normalizeNativeLibraries(options.nativeLibraries ?? [])
  const importedDefinitions = buildImportedDefinitions(
    program,
    options.importedPrograms ?? [],
  )
  const importedFunctions = importedDefinitions.functions
  const importedClasses = importedDefinitions.classes
  const importedMethods = importedDefinitions.methods
  const validation = validateProgram(program, {
    externalFunctionNames: new Set(
      [
        ...importedFunctions.map((definition) => definition.name),
        ...importedClasses.map((definition) => definition.name),
        ...nativeFunctionNamesForLibraries(nativeLibraries),
      ],
    ),
    externalClassNames: new Set(
      importedClasses.map((definition) => definition.name),
    ),
  })
  const mainFunction = program.nodes.find(
    (node) => node.type === 'function' && node.text.trim() === 'main',
  )
  const turtle = nativeLibraries.includes(TURTLE_LIBRARY_NAME)
    ? initialTurtleState()
    : undefined

  if (!validation.valid || !mainFunction) {
    return {
      rootProgram: program,
      program,
      importedFunctions,
      importedClasses,
      importedMethods,
      nativeLibraries,
      currentNodeId: null,
      environment: {},
      objectHeap: {},
      nextObjectId: 1,
      forLoops: {},
      callStack: [],
      inputQueue: inputQueue.map(parseInputValue),
      output: [],
      status: 'error',
      steps: 0,
      maxSteps: options.maxSteps ?? DEFAULT_MAX_STEPS,
      functionName: 'main',
      turtle,
      error: validation.errors.join('\n') || 'Program cannot start.',
    }
  }

  return {
    rootProgram: program,
    program,
    importedFunctions,
    importedClasses,
    importedMethods,
    nativeLibraries,
    currentNodeId: mainFunction.id,
    environment: {},
    objectHeap: {},
    nextObjectId: 1,
    forLoops: {},
    callStack: [],
    inputQueue: inputQueue.map(parseInputValue),
    output: [],
    status: 'running',
    steps: 0,
    maxSteps: options.maxSteps ?? DEFAULT_MAX_STEPS,
    functionName: 'main',
    turtle,
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

  if (state.status === 'asking' || state.status === 'loading') {
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

export function answerAskExecution(
  state: ExecutionState,
  rawValue: string,
): ExecutionState {
  if (state.status !== 'asking' || !state.askRequest) {
    return state
  }

  const pendingNode = addCompletedCallResult(
    state.askRequest.pendingNode,
    state.askRequest.pendingExpressionKey,
    state.askRequest.pendingCallIndex,
    parseInputValue(rawValue),
  )

  return resumePendingNode(
    {
      ...state,
      askRequest: undefined,
      status: 'running',
    },
    pendingNode,
  )
}

export function completeTextLoadExecution(
  state: ExecutionState,
  text: string,
): ExecutionState {
  if (state.status !== 'loading' || !state.textRequest) {
    return state
  }

  const pendingNode = addCompletedCallResult(
    state.textRequest.pendingNode,
    state.textRequest.pendingExpressionKey,
    state.textRequest.pendingCallIndex,
    text,
  )

  return resumePendingNode(
    {
      ...state,
      textRequest: undefined,
      status: 'running',
    },
    pendingNode,
  )
}

export function failTextLoadExecution(
  state: ExecutionState,
  error: string,
): ExecutionState {
  if (state.status !== 'loading') {
    return state
  }

  return fail(
    {
      ...state,
      textRequest: undefined,
    },
    error,
  )
}

function executeNode(state: ExecutionState, node: ProgramNode): ExecutionState {
  if (node.type === 'return') {
    return executeReturnNode(state, {
      kind: 'return',
      node,
      expression: createExpressionProgress(node.text),
    })
  }

  if (node.type === 'function' || node.type === 'method') {
    return advance(state, node)
  }

  if (node.type === 'class') {
    return fail(state, `Class node "${node.id}" cannot be executed.`)
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

  if (node.type === 'process') {
    const statements = splitProcessStatements(node.text)

    if (!statements.length) {
      return fail(state, `Process node "${node.id}" has no statements.`)
    }

    return executeProcessStatement(state, node, statements, 0)
  }

  if (node.type === 'call') {
    return executeCallNode(state, {
      kind: 'call',
      node,
      expression: createExpressionProgress(node.text),
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
  return {
    source,
    completedCalls: {},
    completedVariableReads: {},
    completedMemberReads: {},
    completedRandomValues: {},
  }
}

function executePendingNode(
  state: ExecutionState,
  pendingNode: PendingNode,
): ExecutionState {
  switch (pendingNode.kind) {
    case 'assignment':
      return executeAssignmentNode(state, pendingNode)
    case 'call':
      return executeCallNode(state, pendingNode)
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

function resumePendingNode(
  state: ExecutionState,
  pendingNode: PendingNode,
): ExecutionState {
  try {
    return executePendingNode(state, pendingNode)
  } catch (error) {
    return fail(state, pendingNodeError(pendingNode, error))
  }
}

function executeProcessStatement(
  state: ExecutionState,
  node: ProgramNode,
  statements: ProcessStatementSource[],
  statementIndex: number,
): ExecutionState {
  const statement = statements[statementIndex]
  const process = { statements, statementIndex }

  try {
    if (statement.kind === 'assignment') {
      const assignment = parseAssignment(statement.text)
      return executeAssignmentNode(state, {
        kind: 'assignment',
        node,
        assignment,
        valueExpression: createExpressionProgress(assignment.expression),
        indexExpression:
          assignment.target.kind === 'index'
            ? createExpressionProgress(assignment.target.indexExpression)
            : undefined,
        process,
      })
    }

    return executeCallNode(state, {
      kind: 'call',
      node,
      expression: createExpressionProgress(statement.text),
      process,
    })
  } catch (error) {
    if (error instanceof ProcessStatementExecutionError) {
      throw error
    }

    throw new ProcessStatementExecutionError(
      processStatementError(node, statement, error),
    )
  }
}

function pendingNodeError(pendingNode: PendingNode, error: unknown): string {
  if (error instanceof ProcessStatementExecutionError) {
    return error.message
  }

  if (
    (pendingNode.kind === 'assignment' || pendingNode.kind === 'call') &&
    pendingNode.process
  ) {
    const statement =
      pendingNode.process.statements[pendingNode.process.statementIndex]
    return processStatementError(pendingNode.node, statement, error)
  }

  return error instanceof Error ? error.message : String(error)
}

function processStatementError(
  node: ProgramNode,
  statement: ProcessStatementSource,
  error: unknown,
): string {
  const detail = error instanceof Error ? error.message : String(error)
  return `Process node "${node.id}", line ${statement.lineNumber}: ${detail}`
}

function finishLinearNode(
  state: ExecutionState,
  pendingNode: Extract<PendingNode, { kind: 'assignment' | 'call' }>,
): ExecutionState {
  const process = pendingNode.process

  if (!process || process.statementIndex + 1 >= process.statements.length) {
    return advance(state, pendingNode.node)
  }

  return executeProcessStatement(
    state,
    pendingNode.node,
    process.statements,
    process.statementIndex + 1,
  )
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
      return startFunctionCall(
        withExpressionRuntime(nextState, result),
        pending,
        'valueExpression',
        result.call,
      )
    }

    if (result.status === 'asking') {
      return startAsk(
        withExpressionRuntime(nextState, result),
        pending,
        'valueExpression',
        result.ask,
      )
    }

    if (result.status === 'loading') {
      return startTextLoad(
        withExpressionRuntime(nextState, result),
        pending,
        'valueExpression',
        result.textLoad,
      )
    }

    nextState = {
      ...withExpressionRuntime(nextState, result),
      output: result.output,
    }
    value = result.value
    pending = { ...pending, value }
  }

  if (pending.assignment.target.kind === 'index') {
    if (!pending.indexExpression) {
      return fail(nextState, 'Indexed assignment is missing an index expression.')
    }

    const assignmentResult = assignIndexedElement(
      nextState,
      nextState.environment,
      pending.assignment.target,
      value,
      pending,
      pending.indexExpression,
    )

    if (assignmentResult.status === 'suspended') {
      return startFunctionCall(
        withExpressionRuntime(nextState, assignmentResult),
        assignmentResult.pendingNode,
        'indexExpression',
        assignmentResult.call,
      )
    }

    if (assignmentResult.status === 'asking') {
      return startAsk(
        withExpressionRuntime(nextState, assignmentResult),
        assignmentResult.pendingNode,
        'indexExpression',
        assignmentResult.ask,
      )
    }

    if (assignmentResult.status === 'loading') {
      return startTextLoad(
        withExpressionRuntime(nextState, assignmentResult),
        assignmentResult.pendingNode,
        'indexExpression',
        assignmentResult.textLoad,
      )
    }

    return finishLinearNode(
      {
        ...nextState,
        output: assignmentResult.output,
        turtle: assignmentResult.turtle,
        objectHeap: assignmentResult.objectHeap,
        nextObjectId: assignmentResult.nextObjectId,
        environment: assignmentResult.environment,
      },
      pending,
    )
  }

  if (pending.assignment.target.kind === 'member') {
    return finishLinearNode(
      assignObjectMember(
        nextState,
        pending.assignment.target.variable,
        pending.assignment.target.member,
        value,
      ),
      pending,
    )
  }

  const variable = pending.assignment.target.variable
  if (!Object.prototype.hasOwnProperty.call(nextState.environment, variable)) {
    const field = implicitReceiverField(nextState, variable)
    if (field) {
      return finishLinearNode(
        {
          ...nextState,
          objectHeap: setObjectField(
            nextState.objectHeap,
            field.receiver,
            variable,
            value,
          ),
        },
        pending,
      )
    }
  }

  return finishLinearNode(
    {
      ...nextState,
      environment: {
        ...nextState.environment,
        [variable]: value,
      },
    },
    pending,
  )
}

function executeCallNode(
  state: ExecutionState,
  pendingNode: Extract<PendingNode, { kind: 'call' }>,
): ExecutionState {
  const result = evaluateProgramExpression(state, pendingNode.expression)

  if (result.status === 'suspended') {
    return startFunctionCall(
      withExpressionRuntime(state, result),
      pendingNode,
      'expression',
      result.call,
    )
  }

  if (result.status === 'asking') {
    return startAsk(
      withExpressionRuntime(state, result),
      pendingNode,
      'expression',
      result.ask,
    )
  }

  if (result.status === 'loading') {
    return startTextLoad(
      withExpressionRuntime(state, result),
      pendingNode,
      'expression',
      result.textLoad,
    )
  }

  return finishLinearNode(
    { ...withExpressionRuntime(state, result), output: result.output },
    pendingNode,
  )
}

function executeOutputNode(
  state: ExecutionState,
  pendingNode: Extract<PendingNode, { kind: 'output' }>,
): ExecutionState {
  let nextState = state
  let pending = pendingNode

  if (!pending.representation) {
    const result = evaluateProgramExpression(nextState, pending.expression)

    if (result.status === 'suspended') {
      return startFunctionCall(
        withExpressionRuntime(nextState, result),
        pending,
        'expression',
        result.call,
      )
    }

    if (result.status === 'asking') {
      return startAsk(
        withExpressionRuntime(nextState, result),
        pending,
        'expression',
        result.ask,
      )
    }

    if (result.status === 'loading') {
      return startTextLoad(
        withExpressionRuntime(nextState, result),
        pending,
        'expression',
        result.textLoad,
      )
    }

    nextState = {
      ...withExpressionRuntime(nextState, result),
      output: result.output,
    }
    pending = {
      ...pending,
      representation: {
        value: result.value,
        completedReprs: {},
      },
    }
  }

  const representation = pending.representation
  if (!representation) {
    throw new Error('Output representation progress is missing.')
  }

  try {
    const line = stringifyHeapValue(
      representation.value,
      nextState,
      representation,
    )
    return advance(
      { ...nextState, output: [...nextState.output, line] },
      pending.node,
    )
  } catch (error) {
    if (error instanceof FunctionCallSuspension) {
      return startFunctionCall(
        nextState,
        pending,
        'representation',
        error.call,
      )
    }

    throw error
  }
}

function executeBranchNode(
  state: ExecutionState,
  pendingNode: Extract<PendingNode, { kind: 'branch' }>,
): ExecutionState {
  const result = evaluateProgramExpression(state, pendingNode.expression)

  if (result.status === 'suspended') {
    return startFunctionCall(
      withExpressionRuntime(state, result),
      pendingNode,
      'expression',
      result.call,
    )
  }

  if (result.status === 'asking') {
    return startAsk(
      withExpressionRuntime(state, result),
      pendingNode,
      'expression',
      result.ask,
    )
  }

  if (result.status === 'loading') {
    return startTextLoad(
      withExpressionRuntime(state, result),
      pendingNode,
      'expression',
      result.textLoad,
    )
  }

  return advance(
    { ...withExpressionRuntime(state, result), output: result.output },
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
    return startFunctionCall(
      withExpressionRuntime(state, result),
      pendingNode,
      'expression',
      result.call,
    )
  }

  if (result.status === 'asking') {
    return startAsk(
      withExpressionRuntime(state, result),
      pendingNode,
      'expression',
      result.ask,
    )
  }

  if (result.status === 'loading') {
    return startTextLoad(
      withExpressionRuntime(state, result),
      pendingNode,
      'expression',
      result.textLoad,
    )
  }

  return completeReturn(
    withExpressionRuntime(state, result),
    pendingNode.node,
    result.value,
    result.output,
    result.turtle,
  )
}

function completeReturn(
  state: ExecutionState,
  node: ProgramNode,
  value: RuntimeValue,
  output: string[],
  turtle?: TurtleState,
): ExecutionState {
  if (state.callStack.length === 0) {
    return {
      ...state,
      currentNodeId: node.id,
      output,
      turtle,
      returnValue: value,
      status: 'halted',
    }
  }

  const callerFrame = state.callStack[state.callStack.length - 1]
  const methodName = objectMethodName(state.functionName, state.receiver)
  if (
    methodName === OBJECT_REPR_METHOD_NAME &&
    typeof value !== 'string'
  ) {
    throw new Error(`Method "${state.functionName}" must return a string.`)
  }

  if (
    methodName &&
    OBJECT_COMPARISON_DUNDER_METHOD_NAMES.has(methodName) &&
    typeof value !== 'boolean'
  ) {
    throw new Error(`Method "${state.functionName}" must return a Boolean.`)
  }

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
      receiver: callerFrame.receiver,
      forLoops: callerFrame.forLoops,
      inputQueue: callerFrame.inputQueue,
      functionName: callerFrame.functionName,
      callStack: state.callStack.slice(0, -1),
      output,
      turtle,
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
  let turtle = state.turtle
  let objectHeap = state.objectHeap
  let nextObjectId = state.nextObjectId

  try {
    const value = evaluateExpression(progress.source, environment, {
      getVariable: (name, siteId) => {
        if (
          Object.prototype.hasOwnProperty.call(
            progress.completedVariableReads,
            siteId,
          )
        ) {
          return progress.completedVariableReads[siteId]
        }

        const field = implicitReceiverField(state, name, objectHeap)
        if (!field) {
          return undefined
        }

        progress.completedVariableReads[siteId] = field.value
        return field.value
      },
      callFunction: (name, args, siteId) => {
        const currentCallIndex = siteId

        if (
          Object.prototype.hasOwnProperty.call(
            progress.completedCalls,
            currentCallIndex,
          )
        ) {
          return progress.completedCalls[currentCallIndex]
        }

        const classDefinition = findClassDefinition(state, name)
        if (classDefinition) {
          if (args.length !== classDefinition.fields.length) {
            throw new Error(
              `Class "${name}" expects exactly ${classDefinition.fields.length} constructor arguments, but received ${args.length}.`,
            )
          }

          const object: RuntimeObject = {
            kind: 'object',
            id: nextObjectId,
            className: name,
          }
          objectHeap = {
            ...objectHeap,
            [object.id]: {
              id: object.id,
              className: name,
              fields: Object.fromEntries(
                classDefinition.fields.map((field, index) => [field, args[index]]),
              ),
            },
          }
          nextObjectId += 1
          progress.completedCalls[currentCallIndex] = object
          return object
        }

        if (isNativeFunctionAvailable(state, name)) {
          if (isTextFunctionName(name)) {
            if (name === 'text_from_url') {
              throw new TextLoadSuspension({
                url: validateTextFromUrlArguments(args),
                callIndex: currentCallIndex,
              })
            }

            const result = splitWords(args)
            progress.completedCalls[currentCallIndex] = result
            return result
          }

          turtle = runNativeFunction(turtle, name, args)
          progress.completedCalls[currentCallIndex] = 0
          return 0
        }

        if (name === 'ask') {
          if (args.length !== 0) {
            throw new Error('ask requires no arguments')
          }

          throw new AskSuspension({ callIndex: currentCallIndex })
        }

        throw new FunctionCallSuspension({
          name,
          args,
          callIndex: currentCallIndex,
        })
      },
      getMember: (object, member, siteId) => {
        if (
          Object.prototype.hasOwnProperty.call(
            progress.completedMemberReads,
            siteId,
          )
        ) {
          return progress.completedMemberReads[siteId]
        }

        const instance = requireObjectInstance(objectHeap, object)

        if (!Object.prototype.hasOwnProperty.call(instance.fields, member)) {
          throw new Error(`Class "${instance.className}" has no field "${member}".`)
        }

        const value = instance.fields[member]
        progress.completedMemberReads[siteId] = value
        return value
      },
      callMethod: (object, method, args, siteId) => {
        const currentCallIndex = siteId

        if (
          Object.prototype.hasOwnProperty.call(
            progress.completedCalls,
            currentCallIndex,
          )
        ) {
          return progress.completedCalls[currentCallIndex]
        }

        const instance = requireObjectInstance(objectHeap, object)
        throw new FunctionCallSuspension({
          name: `${instance.className}.${method}`,
          args,
          callIndex: currentCallIndex,
          receiver: object,
        })
      },
      applyObjectOperator: (object, operator, args, siteId) => {
        const dispatch = findObjectOperatorDispatch(
          state,
          objectHeap,
          object,
          operator,
          args.length,
        )
        if (!dispatch) {
          return undefined
        }

        if (
          Object.prototype.hasOwnProperty.call(
            progress.completedCalls,
            siteId,
          )
        ) {
          return objectOperatorResult(
            dispatch,
            progress.completedCalls[siteId],
          )
        }

        throw new FunctionCallSuspension({
          name: dispatch.qualifiedName,
          args,
          callIndex: siteId,
          receiver: object,
        })
      },
      random: (siteId) => {
        if (
          Object.prototype.hasOwnProperty.call(
            progress.completedRandomValues,
            siteId,
          )
        ) {
          return progress.completedRandomValues[siteId]
        }

        const value = Math.random()
        progress.completedRandomValues[siteId] = value
        return value
      },
    })

    return {
      status: 'complete',
      value,
      output: state.output,
      turtle,
      objectHeap,
      nextObjectId,
    }
  } catch (error) {
    if (error instanceof FunctionCallSuspension) {
      return {
        status: 'suspended',
        call: error.call,
        turtle,
        objectHeap,
        nextObjectId,
      }
    }

    if (error instanceof AskSuspension) {
      return {
        status: 'asking',
        ask: error.ask,
        turtle,
        objectHeap,
        nextObjectId,
      }
    }

    if (error instanceof TextLoadSuspension) {
      return {
        status: 'loading',
        textLoad: error.textLoad,
        turtle,
        objectHeap,
        nextObjectId,
      }
    }

    throw error
  }
}

function withExpressionRuntime(
  state: ExecutionState,
  result: {
    turtle?: TurtleState
    objectHeap: ObjectHeap
    nextObjectId: number
  },
): ExecutionState {
  return {
    ...state,
    turtle: result.turtle,
    objectHeap: result.objectHeap,
    nextObjectId: result.nextObjectId,
  }
}

function startAsk(
  state: ExecutionState,
  pendingNode: PendingNode,
  pendingExpressionKey: PendingExpressionKey,
  ask: AskCallRequest,
): ExecutionState {
  return {
    ...state,
    currentNodeId: pendingNode.node.id,
    askRequest: {
      pendingNode,
      pendingExpressionKey,
      pendingCallIndex: ask.callIndex,
    },
    status: 'asking',
  }
}

function startTextLoad(
  state: ExecutionState,
  pendingNode: PendingNode,
  pendingExpressionKey: PendingExpressionKey,
  textLoad: TextLoadCallRequest,
): ExecutionState {
  return {
    ...state,
    currentNodeId: pendingNode.node.id,
    textRequest: {
      url: textLoad.url,
      pendingNode,
      pendingExpressionKey,
      pendingCallIndex: textLoad.callIndex,
    },
    status: 'loading',
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

  let targetProgram: Program | undefined
  let targetFunctionNode: ProgramNode | undefined
  let environment: Environment = {}
  let receiver: RuntimeObject | undefined

  if (call.receiver) {
    const instance = requireObjectInstance(state.objectHeap, call.receiver)
    const expectedPrefix = `${instance.className}.`
    if (!call.name.startsWith(expectedPrefix)) {
      throw new Error(
        `Object ${instance.className} #${instance.id} cannot call Method "${call.name}".`,
      )
    }

    const methodTarget = findMethodTarget(state, call.name)
    targetProgram = methodTarget?.program
    targetFunctionNode = methodTarget?.node
    environment = { self: call.receiver }
    receiver = call.receiver

    if (!targetProgram || !targetFunctionNode) {
      throw new Error(`Method "${call.name}" does not exist.`)
    }

    const methodName = objectMethodName(call.name, call.receiver)
    const expectedInputCount = methodName
      ? objectDunderInputCount(methodName)
      : undefined
    if (
      expectedInputCount !== undefined &&
      call.args.length !== expectedInputCount
    ) {
      throw new Error(
        `Method "${call.name}" expects exactly ${expectedInputCount} argument${expectedInputCount === 1 ? '' : 's'}, but received ${call.args.length}.`,
      )
    }

    if (
      expectedInputCount !== undefined &&
      isActiveMethodCall(state, call.name, call.receiver)
    ) {
      throw new Error(
        `Method "${call.name}" cannot recursively call itself for ${instance.className} #${instance.id}.`,
      )
    }
  } else {
    const functionNode = findFunctionNode(state.program, call.name)
    const rootFunctionNode =
      state.program === state.rootProgram
        ? functionNode
        : findFunctionNode(state.rootProgram, call.name)
    const activeFunctionNode = rootFunctionNode ?? functionNode
    const importedFunction =
      activeFunctionNode ? undefined : findImportedFunction(state, call.name)

    targetProgram = rootFunctionNode
      ? state.rootProgram
      : activeFunctionNode
        ? state.program
        : importedFunction?.program
    targetFunctionNode = activeFunctionNode ?? importedFunction?.node

    if (!targetProgram || !targetFunctionNode) {
      throw new Error(`Function "${call.name}" does not exist.`)
    }
  }

  return {
    ...state,
    program: targetProgram,
    currentNodeId: targetFunctionNode.id,
    environment,
    receiver,
    forLoops: {},
    inputQueue: [...call.args],
    functionName: call.name,
    callStack: [
      ...state.callStack,
      {
        program: state.program,
        currentNodeId: state.currentNodeId,
        environment: state.environment,
        receiver: state.receiver,
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
  if (key === 'representation') {
    if (pendingNode.kind !== 'output' || !pendingNode.representation) {
      throw new Error('Only Output nodes have representation progress.')
    }

    return {
      ...pendingNode,
      representation: {
        ...pendingNode.representation,
        completedReprs: {
          ...pendingNode.representation.completedReprs,
          [callIndex]: value,
        },
      },
    }
  }

  const progress = expressionProgressForKey(pendingNode, key)
  const completedCalls = {
    ...progress.completedCalls,
    [callIndex]: value,
  }
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
  key: Exclude<PendingExpressionKey, 'representation'>,
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
    return startFunctionCall(
      withExpressionRuntime(state, result),
      pendingNode,
      'expression',
      result.call,
    )
  }

  if (result.status === 'asking') {
    return startAsk(
      withExpressionRuntime(state, result),
      pendingNode,
      'expression',
      result.ask,
    )
  }

  if (result.status === 'loading') {
    return startTextLoad(
      withExpressionRuntime(state, result),
      pendingNode,
      'expression',
      result.textLoad,
    )
  }

  return advanceForLoop(
    withExpressionRuntime(state, result),
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

  if (isRuntimeDictionary(iterable)) {
    return {
      variable: forLoop.variable,
      values: iterable.entries.map((entry) => entry.key),
      index: 0,
    }
  }

  throw new Error('For loop iterable must be a string, list, or dictionary')
}

function assignIndexedElement(
  state: ExecutionState,
  environment: Environment,
  target: Extract<AssignmentTarget, { kind: 'index' }>,
  value: RuntimeValue,
  pendingNode: Extract<PendingNode, { kind: 'assignment' }>,
  indexExpression: ExpressionProgress,
): AssignIndexedElementResult {
  const { variable } = target
  let indexTarget = pendingNode.indexTarget
  if (!indexTarget) {
    const hasLocal = Object.prototype.hasOwnProperty.call(environment, variable)
    const implicitField = hasLocal
      ? undefined
      : implicitReceiverField(state, variable)

    if (!hasLocal && !implicitField) {
      throw new Error(`Undefined variable "${variable}"`)
    }

    indexTarget = {
      value: hasLocal ? environment[variable] : implicitField!.value,
      ...(implicitField ? { receiver: implicitField.receiver } : {}),
    }
  }

  const currentValue = indexTarget.value
  const nextPendingNode = { ...pendingNode, indexTarget }

  if (!Array.isArray(currentValue) && !isRuntimeDictionary(currentValue)) {
    throw new Error(
      `Indexed assignment target "${variable}" must be a list or dictionary`,
    )
  }

  const indexResult = evaluateProgramExpression(
    state,
    indexExpression,
    environment,
  )

  if (indexResult.status === 'suspended') {
    return {
      status: 'suspended',
      pendingNode: nextPendingNode,
      call: indexResult.call,
      turtle: indexResult.turtle,
      objectHeap: indexResult.objectHeap,
      nextObjectId: indexResult.nextObjectId,
    }
  }

  if (indexResult.status === 'asking') {
    return {
      status: 'asking',
      pendingNode: nextPendingNode,
      ask: indexResult.ask,
      turtle: indexResult.turtle,
      objectHeap: indexResult.objectHeap,
      nextObjectId: indexResult.nextObjectId,
    }
  }

  if (indexResult.status === 'loading') {
    return {
      status: 'loading',
      pendingNode: nextPendingNode,
      textLoad: indexResult.textLoad,
      turtle: indexResult.turtle,
      objectHeap: indexResult.objectHeap,
      nextObjectId: indexResult.nextObjectId,
    }
  }

  const { value: indexValue, output } = indexResult

  if (Array.isArray(currentValue)) {
    const index = requireListIndex(indexValue)

    if (index >= currentValue.length) {
      throw new Error(`Index ${index} is out of range`)
    }

    const nextValue = [...currentValue]
    nextValue[index] = value
    const nextObjectHeap = indexTarget.receiver
      ? setObjectField(
          indexResult.objectHeap,
          indexTarget.receiver,
          variable,
          nextValue,
        )
      : indexResult.objectHeap

    return {
      status: 'complete',
      environment: indexTarget.receiver
        ? environment
        : { ...environment, [variable]: nextValue },
      output,
      turtle: indexResult.turtle,
      objectHeap: nextObjectHeap,
      nextObjectId: indexResult.nextObjectId,
    }
  }

  if (!isDictionaryKey(indexValue)) {
    throw new Error('Dictionary keys must be strings, numbers, or booleans')
  }

  const nextValue = setDictionaryValue(currentValue, indexValue, value)
  const nextObjectHeap = indexTarget.receiver
    ? setObjectField(
        indexResult.objectHeap,
        indexTarget.receiver,
        variable,
        nextValue,
      )
    : indexResult.objectHeap

  return {
    status: 'complete',
    environment: indexTarget.receiver
      ? environment
      : { ...environment, [variable]: nextValue },
    output,
    turtle: indexResult.turtle,
    objectHeap: nextObjectHeap,
    nextObjectId: indexResult.nextObjectId,
  }
}

function assignObjectMember(
  state: ExecutionState,
  variable: string,
  member: string,
  value: RuntimeValue,
): ExecutionState {
  const hasLocal = Object.prototype.hasOwnProperty.call(
    state.environment,
    variable,
  )
  const implicitField = hasLocal
    ? undefined
    : implicitReceiverField(state, variable)

  if (!hasLocal && !implicitField) {
    throw new Error(`Undefined variable "${variable}"`)
  }

  const object = hasLocal
    ? state.environment[variable]
    : implicitField!.value
  if (!isRuntimeObject(object)) {
    throw new Error(`Member assignment target "${variable}" must be an object.`)
  }

  const instance = requireObjectInstance(state.objectHeap, object)
  if (!Object.prototype.hasOwnProperty.call(instance.fields, member)) {
    throw new Error(`Class "${instance.className}" has no field "${member}".`)
  }

  return {
    ...state,
    objectHeap: setObjectField(state.objectHeap, object, member, value),
  }
}

function implicitReceiverField(
  state: ExecutionState,
  name: string,
  objectHeap: ObjectHeap = state.objectHeap,
): { receiver: RuntimeObject; value: RuntimeValue } | undefined {
  if (!state.receiver) {
    return undefined
  }

  const instance = requireObjectInstance(objectHeap, state.receiver)
  if (!Object.prototype.hasOwnProperty.call(instance.fields, name)) {
    return undefined
  }

  return { receiver: state.receiver, value: instance.fields[name] }
}

function setObjectField(
  objectHeap: ObjectHeap,
  object: RuntimeObject,
  field: string,
  value: RuntimeValue,
): ObjectHeap {
  const instance = requireObjectInstance(objectHeap, object)
  if (!Object.prototype.hasOwnProperty.call(instance.fields, field)) {
    throw new Error(`Class "${instance.className}" has no field "${field}".`)
  }

  return {
    ...objectHeap,
    [instance.id]: {
      ...instance,
      fields: {
        ...instance.fields,
        [field]: value,
      },
    },
  }
}

function requireObjectInstance(
  objectHeap: ObjectHeap,
  object: RuntimeObject,
): RuntimeObjectInstance {
  const instance = objectHeap[object.id]

  if (!instance) {
    throw new Error(
      `Object ${object.className} #${object.id} does not exist in the object heap.`,
    )
  }

  if (instance.className !== object.className) {
    throw new Error(
      `Object #${object.id} belongs to Class "${instance.className}", not "${object.className}".`,
    )
  }

  return instance
}

function stringifyHeapValue(
  value: RuntimeValue,
  state: ExecutionState,
  progress: RepresentationProgress,
  seenObjectIds: Set<number> = new Set<number>(),
  nested = false,
): string {
  if (isRuntimeObject(value)) {
    const instance = state.objectHeap[value.id]
    if (!instance) {
      return `${value.className} #${value.id} <missing>`
    }

    if (seenObjectIds.has(instance.id)) {
      return `${instance.className} #${instance.id} {...}`
    }

    if (
      Object.prototype.hasOwnProperty.call(
        progress.completedReprs,
        instance.id,
      )
    ) {
      const representation = progress.completedReprs[instance.id]
      if (typeof representation !== 'string') {
        throw new Error(
          `Method "${instance.className}.${OBJECT_REPR_METHOD_NAME}" must return a string.`,
        )
      }

      return representation
    }

    const representationMethod =
      `${instance.className}.${OBJECT_REPR_METHOD_NAME}`
    if (findMethodTarget(state, representationMethod)) {
      throw new FunctionCallSuspension({
        name: representationMethod,
        args: [],
        callIndex: instance.id,
        receiver: value,
      })
    }

    const nextSeen = new Set(seenObjectIds)
    nextSeen.add(instance.id)
    const fields = Object.entries(instance.fields)
      .map(
        ([name, fieldValue]) =>
          `${name}: ${stringifyHeapValue(
            fieldValue,
            state,
            progress,
            nextSeen,
            true,
          )}`,
      )
      .join(', ')
    return `${instance.className} #${instance.id} {${fields}}`
  }

  if (Array.isArray(value)) {
    return `[${value
      .map((item) =>
        stringifyHeapValue(item, state, progress, seenObjectIds, true),
      )
      .join(', ')}]`
  }

  if (isRuntimeDictionary(value)) {
    return stringifyHeapDictionary(value, state, progress, seenObjectIds)
  }

  if (typeof value === 'string') {
    return nested ? JSON.stringify(value) : value
  }

  if (typeof value === 'boolean') {
    return value ? 'True' : 'False'
  }

  return String(value)
}

function stringifyHeapDictionary(
  dictionary: RuntimeDictionary,
  state: ExecutionState,
  progress: RepresentationProgress,
  seenObjectIds: Set<number>,
): string {
  return `{${dictionary.entries
    .map(
      (entry) =>
        `${stringifyDictionaryKey(entry.key)}: ${stringifyHeapValue(
          entry.value,
          state,
          progress,
          seenObjectIds,
          true,
        )}`,
    )
    .join(', ')}}`
}

function stringifyDictionaryKey(key: RuntimeDictionary['entries'][number]['key']): string {
  if (typeof key === 'string') {
    return JSON.stringify(key)
  }

  if (typeof key === 'boolean') {
    return key ? 'True' : 'False'
  }

  return String(key)
}

function requireListIndex(value: RuntimeValue): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('Index must be a number')
  }

  return value
}

function buildImportedDefinitions(
  program: Program,
  importedPrograms: Program[],
): ImportedDefinitions {
  const claimedCallableNames = new Set<string>()
  const claimedMethodNames = new Set<string>()
  const classOwnerIndexes = new Map<string, number>()
  const functions: ImportedFunctionDefinition[] = []
  const classes: ImportedClassDefinition[] = []
  const methods: ImportedMethodDefinition[] = []

  for (const node of program.nodes) {
    if (node.type === 'function') {
      claimedCallableNames.add(node.text.trim())
    } else if (node.type === 'class') {
      try {
        const name = parseClassDeclaration(node.text).name
        claimedCallableNames.add(name)
        classOwnerIndexes.set(name, -1)
      } catch {
        // The current program's validation reports malformed declarations.
      }
    } else if (node.type === 'method') {
      const method = attachedMethodDefinition(program, node)
      if (method) {
        claimedMethodNames.add(method.qualifiedName)
      }
    }
  }

  for (const [programIndex, importedProgram] of importedPrograms.entries()) {
    for (const node of importedProgram.nodes) {
      if (node.type === 'function') {
        const name = node.text.trim()
        if (name === 'main' || claimedCallableNames.has(name)) {
          continue
        }

        claimedCallableNames.add(name)
        functions.push({ name, program: importedProgram, node })
        continue
      }

      if (node.type === 'class') {
        try {
          const declaration = parseClassDeclaration(node.text)
          if (claimedCallableNames.has(declaration.name)) {
            continue
          }

          claimedCallableNames.add(declaration.name)
          classOwnerIndexes.set(declaration.name, programIndex)
          classes.push({
            name: declaration.name,
            fields: declaration.fields,
            program: importedProgram,
            node,
          })
        } catch {
          // Imported programs are validated before execution.
        }
        continue
      }
    }
  }

  for (const [programIndex, importedProgram] of importedPrograms.entries()) {
    for (const node of importedProgram.nodes) {
      if (node.type !== 'method') {
        continue
      }

      const declaration = attachedMethodDefinition(importedProgram, node)
      if (
        !declaration ||
        classOwnerIndexes.get(declaration.className) !== programIndex ||
        claimedMethodNames.has(declaration.qualifiedName)
      ) {
        continue
      }

      claimedMethodNames.add(declaration.qualifiedName)
      methods.push({
        name: declaration.qualifiedName,
        className: declaration.className,
        methodName: declaration.methodName,
        program: importedProgram,
        node,
      })
    }
  }

  return { functions, classes, methods }
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

function findMethodNode(program: Program, name: string): ProgramNode | undefined {
  return program.nodes.find((candidate) => {
    return attachedMethodDefinition(program, candidate)?.qualifiedName === name
  })
}

function findMethodTarget(
  state: ExecutionState,
  name: string,
): { program: Program; node: ProgramNode } | undefined {
  const rootMethodNode = findMethodNode(state.rootProgram, name)
  if (rootMethodNode) {
    return { program: state.rootProgram, node: rootMethodNode }
  }

  const importedMethod = findImportedMethod(state, name)
  return importedMethod
    ? { program: importedMethod.program, node: importedMethod.node }
    : undefined
}

function findObjectOperatorDispatch(
  state: ExecutionState,
  objectHeap: ObjectHeap,
  object: RuntimeObject,
  operator: string,
  argumentCount: number,
): ObjectOperatorDispatch | undefined {
  const instance = requireObjectInstance(objectHeap, object)
  const methodName = objectDunderMethodForOperator(operator, argumentCount)
  if (!methodName) {
    return undefined
  }

  const qualifiedName = `${instance.className}.${methodName}`
  if (findMethodTarget(state, qualifiedName)) {
    return { qualifiedName, methodName, negateBoolean: false }
  }

  if (methodName === '__ne__') {
    const equalityName = `${instance.className}.__eq__`
    if (findMethodTarget(state, equalityName)) {
      return {
        qualifiedName: equalityName,
        methodName: '__eq__',
        negateBoolean: true,
      }
    }
  }

  if (methodName === '__eq__' || methodName === '__ne__') {
    return undefined
  }

  throw new Error(
    `Class "${instance.className}" does not define Method "${methodName}" for operator "${operator}".`,
  )
}

function objectOperatorResult(
  dispatch: ObjectOperatorDispatch,
  value: RuntimeValue,
): RuntimeValue {
  if (OBJECT_COMPARISON_DUNDER_METHOD_NAMES.has(dispatch.methodName)) {
    if (typeof value !== 'boolean') {
      throw new Error(
        `Method "${dispatch.qualifiedName}" must return a Boolean.`,
      )
    }

    return dispatch.negateBoolean ? !value : value
  }

  return value
}

function isActiveMethodCall(
  state: ExecutionState,
  name: string,
  receiver: RuntimeObject,
): boolean {
  if (state.functionName === name && state.receiver?.id === receiver.id) {
    return true
  }

  return state.callStack.some(
    (frame) =>
      frame.functionName === name && frame.receiver?.id === receiver.id,
  )
}

function objectMethodName(
  name: string,
  receiver: RuntimeObject | undefined,
): string | undefined {
  if (!receiver) {
    return undefined
  }

  const prefix = `${receiver.className}.`
  return name.startsWith(prefix) ? name.slice(prefix.length) : undefined
}

function findClassDefinition(
  state: ExecutionState,
  name: string,
): ImportedClassDefinition | undefined {
  const rootClass = findClassDefinitionInProgram(state.rootProgram, name)
  if (rootClass) {
    return rootClass
  }

  if (findFunctionNode(state.rootProgram, name)) {
    return undefined
  }

  return state.importedClasses.find((definition) => definition.name === name)
}

function findClassDefinitionInProgram(
  program: Program,
  name: string,
): ImportedClassDefinition | undefined {
  for (const node of program.nodes) {
    if (node.type !== 'class') {
      continue
    }

    try {
      const declaration = parseClassDeclaration(node.text)
      if (declaration.name === name) {
        return {
          name,
          fields: declaration.fields,
          program,
          node,
        }
      }
    } catch {
      // Invalid declarations are reported before execution starts.
    }
  }

  return undefined
}

function findImportedFunction(
  state: ExecutionState,
  name: string,
): ImportedFunctionDefinition | undefined {
  return state.importedFunctions.find((definition) => definition.name === name)
}

function findImportedMethod(
  state: ExecutionState,
  name: string,
): ImportedMethodDefinition | undefined {
  return state.importedMethods.find((definition) => definition.name === name)
}

function normalizeNativeLibraries(nativeLibraries: string[]): string[] {
  return [
    ...new Set(
      nativeLibraries
        .map((library) => library.trim().toLowerCase())
        .filter(
          (library) =>
            library === TURTLE_LIBRARY_NAME || library === TEXT_LIBRARY_NAME,
        ),
    ),
  ]
}

function nativeFunctionNamesForLibraries(nativeLibraries: string[]): string[] {
  return [
    ...(nativeLibraries.includes(TURTLE_LIBRARY_NAME)
      ? [...TURTLE_COMMAND_NAMES]
      : []),
    ...(nativeLibraries.includes(TEXT_LIBRARY_NAME)
      ? [...TEXT_FUNCTION_NAMES]
      : []),
  ]
}

function isNativeFunctionAvailable(state: ExecutionState, name: string): boolean {
  return (
    ((state.nativeLibraries.includes(TURTLE_LIBRARY_NAME) &&
      isTurtleCommandName(name)) ||
      (state.nativeLibraries.includes(TEXT_LIBRARY_NAME) &&
        isTextFunctionName(name))) &&
    !hasFlowLabFunctionTarget(state, name)
  )
}

function hasFlowLabFunctionTarget(state: ExecutionState, name: string): boolean {
  const functionNode = state.program.nodes.find(
    (candidate) =>
      candidate.type === 'function' && candidate.text.trim() === name,
  )
  const rootFunctionNode =
    state.program === state.rootProgram
      ? functionNode
      : findFunctionNode(state.rootProgram, name)

  return Boolean(rootFunctionNode ?? functionNode ?? findImportedFunction(state, name))
}

function runNativeFunction(
  turtle: TurtleState | undefined,
  name: string,
  args: RuntimeValue[],
): TurtleState {
  if (isTurtleCommandName(name)) {
    return runTurtleCommand(turtle ?? initialTurtleState(), name, args)
  }

  throw new Error(`Function "${name}" does not exist.`)
}

function parseInputValue(rawValue: string): RuntimeValue {
  const trimmed = rawValue.trim()

  if (trimmed === '') {
    return ''
  }

  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    return Number(trimmed)
  }

  if (trimmed === 'True') {
    return true
  }

  if (trimmed === 'False') {
    return false
  }

  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    const evaluated = evaluateExpression(trimmed, {})
    return Array.isArray(evaluated) || isRuntimeDictionary(evaluated)
      ? evaluated
      : rawValue
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
