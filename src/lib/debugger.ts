import { executionVariableChanges, stepExecution, type ExecutionState } from './interpreter'

/** Keep the editable caller visible during a library call, including waits/errors. */
export function visibleExecution(state: ExecutionState): ExecutionState {
  const current = finishLibraryCall(state)
  const caller = current.libraryCall?.caller
  return {
    ...current,
    ...(caller ? {
      program: caller.program,
      currentNodeId: caller.currentNodeId,
      environment: caller.environment,
      objectHeap: caller.objectHeap,
      receiver: caller.receiver,
      forLoops: caller.forLoops,
      inputQueue: caller.inputQueue,
      functionName: caller.functionName,
      callStack: caller.callStack,
      incomingEdge: caller.incomingEdge,
      lastStep: undefined,
    } : {}),
    steps: current.steps - (current.hiddenSteps ?? 0),
  }
}

function finishLibraryCall(state: ExecutionState): ExecutionState {
  const boundary = state.libraryCall
  if (!boundary || state.callStack.includes(boundary.frame)) return state
  if (state.program !== state.rootProgram) {
    // A resumed expression can immediately call another imported function.
    return { ...state, libraryCall: libraryBoundary(boundary.caller, state) }
  }
  return {
    ...state,
    libraryCall: undefined,
    lastStep: state.lastStep ? {
      ...state.lastStep,
      changedVariables: executionVariableChanges(boundary.caller, state),
    } : undefined,
  }
}

function libraryBoundary(before: ExecutionState, after: ExecutionState): ExecutionState['libraryCall'] {
  const depth = after.callStack.findIndex((frame, index) =>
    frame.program === after.rootProgram &&
    (after.callStack[index + 1]?.program ?? after.program) !== after.rootProgram,
  )
  if (depth < 0) return undefined
  const frame = after.callStack[depth]
  // A local Return may resume an ancestor expression that immediately calls a
  // library. Keep that ancestor's calling block visible, not the local Return.
  const sameCaller = before.callStack.length === depth && before.program === frame.program && before.currentNodeId === frame.currentNodeId
  const caller = sameCaller ? before : {
    ...before,
    program: frame.program,
    currentNodeId: frame.currentNodeId,
    environment: frame.environment,
    receiver: frame.receiver,
    forLoops: frame.forLoops,
    inputQueue: frame.inputQueue,
    functionName: frame.functionName,
    callStack: after.callStack.slice(0, depth),
    incomingEdge: undefined,
    lastStep: undefined,
  }
  return { caller, frame }
}

function stepDebuggerExecution(state: ExecutionState): ExecutionState {
  const before = finishLibraryCall(state)
  let next = stepExecution(before)
  if (before.libraryCall) {
    next = { ...next, hiddenSteps: (before.hiddenSteps ?? 0) + next.steps - before.steps }
  }
  if (!next.libraryCall && next.program !== next.rootProgram) {
    next = { ...next, libraryCall: libraryBoundary(before, next) }
  }
  return finishLibraryCall(next)
}

export interface ExecutionChunkOptions {
  /** IDs from the editable root program; imported IDs occupy a separate scope. */
  breakpoints?: ReadonlySet<string>
  /** Skip only the first breakpoint check, so a loop can hit it again. */
  skipCurrentBreakpoint?: boolean
  maxSteps?: number
  maxMilliseconds?: number
  /** Complete one visible block, including any calls into imported libraries. */
  singleStep?: boolean
}

export interface ExecutionChunkResult {
  state: ExecutionState
  reason: 'yield' | 'breakpoint' | 'blocked' | 'completed'
}

export function stepExecutionChunk(state: ExecutionState, options: ExecutionChunkOptions = {}): ExecutionChunkResult {
  return runExecutionChunk(state, { ...options, singleStep: true, breakpoints: undefined })
}

export function hasPendingLibraryStep(result: ExecutionChunkResult): boolean {
  return result.reason === 'yield' || !!result.state.libraryCall &&
    (result.state.status === 'asking' || result.state.status === 'loading')
}

/**
 * Execute a bounded amount of work, then yield to the UI. The caller schedules
 * another chunk after 'yield' and cancels that schedule to stop execution.
 * Pass skipCurrentBreakpoint only when an explicit Run action resumes execution.
 */
export function runExecutionChunk(
  state: ExecutionState,
  options: ExecutionChunkOptions = {},
): ExecutionChunkResult {
  const limit = Math.max(1, Math.floor(options.maxSteps ?? 100))
  const deadline = performance.now() + Math.max(0, options.maxMilliseconds ?? 8)
  let next = finishLibraryCall(state)
  // An asynchronous library return may have completed the requested step.
  if (options.singleStep && state.libraryCall && !next.libraryCall) {
    return { state: next, reason: 'completed' }
  }
  let executed = 0

  while (true) {
    if (next.status === 'halted' || next.status === 'error' || !next.currentNodeId) {
      return { state: next, reason: 'completed' }
    }
    if (
      next.status === 'asking' || next.status === 'loading' ||
      (next.status === 'waiting' && next.inputQueue.length === 0)
    ) {
      return { state: next, reason: 'blocked' }
    }
    if (
      !(executed === 0 && options.skipCurrentBreakpoint) &&
      !next.libraryCall && next.program === next.rootProgram && options.breakpoints?.has(next.currentNodeId)
    ) {
      return { state: next, reason: 'breakpoint' }
    }
    // At least one step per chunk prevents a zero-time budget from starving.
    if (executed >= limit || (executed > 0 && performance.now() >= deadline)) {
      return { state: next, reason: 'yield' }
    }
    next = stepDebuggerExecution(next)
    executed += 1
    if (options.singleStep && !next.libraryCall) {
      return { state: next, reason: 'completed' }
    }
  }
}
