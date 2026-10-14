import { executionVariableChanges, stepExecution, type ExecutionState } from './interpreter'

/** Keep the caller visible while stepping over a call, including waits/errors. */
export function visibleExecution(state: ExecutionState): ExecutionState {
  const current = finishStepOverCall(state)
  const caller = current.stepOverCall?.caller
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

function finishStepOverCall(state: ExecutionState): ExecutionState {
  const boundary = state.stepOverCall
  if (!boundary || state.callStack.includes(boundary.frame)) return state
  const nextBoundary = stepOverBoundary(boundary.caller, state)
  if (nextBoundary) {
    // A resumed expression can immediately start another call to step over.
    return { ...state, stepOverCall: nextBoundary }
  }
  return {
    ...state,
    stepOverCall: undefined,
    lastStep: state.lastStep ? {
      ...state.lastStep,
      changedVariables: executionVariableChanges(boundary.caller, state),
    } : undefined,
  }
}

function stepOverBoundary(before: ExecutionState, after: ExecutionState): ExecutionState['stepOverCall'] {
  const depth = after.callStack.findIndex((frame, index) => {
    const callee = after.callStack[index + 1] ?? after
    // Enter local calls from main and direct self-calls. An earlier opaque
    // boundary still hides everything underneath it, including recursion.
    return frame.program !== after.rootProgram ||
      callee.program !== after.rootProgram ||
      (frame.functionName !== 'main' && frame.functionName !== callee.functionName)
  })
  if (depth < 0) return undefined
  const frame = after.callStack[depth]
  // A Return may resume an ancestor expression that immediately starts another
  // call. Keep that ancestor's calling block visible, not the Return.
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
  const before = finishStepOverCall(state)
  let next = stepExecution(before)
  if (before.stepOverCall) {
    next = { ...next, hiddenSteps: (before.hiddenSteps ?? 0) + next.steps - before.steps }
  }
  if (!next.stepOverCall) {
    next = { ...next, stepOverCall: stepOverBoundary(before, next) }
  }
  return finishStepOverCall(next)
}

export interface ExecutionChunkOptions {
  /** IDs from the editable root program; imported IDs occupy a separate scope. */
  breakpoints?: ReadonlySet<string>
  /** Skip only the first breakpoint check, so a loop can hit it again. */
  skipCurrentBreakpoint?: boolean
  maxSteps?: number
  maxMilliseconds?: number
  /** Complete one visible block, entering local calls from main and self-calls. */
  singleStep?: boolean
  /** Disable debugger bookkeeping for fast Run; persists through asynchronous input. */
  collectFeedback?: boolean
}

export interface ExecutionChunkResult {
  state: ExecutionState
  reason: 'yield' | 'breakpoint' | 'blocked' | 'completed'
}

export function stepExecutionChunk(state: ExecutionState, options: ExecutionChunkOptions = {}): ExecutionChunkResult {
  return runExecutionChunk(state, { ...options, singleStep: true, breakpoints: undefined, collectFeedback: true })
}

export function hasPendingStepOver(result: ExecutionChunkResult): boolean {
  return result.reason === 'yield' || !!result.state.stepOverCall &&
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
  const collectFeedback = options.collectFeedback ?? state.collectFeedback
  const limit = Math.max(1, Math.floor(options.maxSteps ?? (collectFeedback === false ? 10000 : 100)))
  const deadline = performance.now() + Math.max(0, options.maxMilliseconds ?? 8)
  let next = finishStepOverCall(collectFeedback === state.collectFeedback ? state : {
    ...state, collectFeedback, lastStep: undefined, incomingEdge: undefined,
  })
  // An asynchronous return may have completed the requested step.
  if (options.singleStep && state.stepOverCall && !next.stepOverCall) {
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
      !next.stepOverCall && next.program === next.rootProgram && options.breakpoints?.has(next.currentNodeId)
    ) {
      return { state: next, reason: 'breakpoint' }
    }
    // At least one step per chunk prevents a zero-time budget from starving.
    if (executed >= limit || (executed > 0 && performance.now() >= deadline)) {
      return { state: next, reason: 'yield' }
    }
    next = stepDebuggerExecution(next)
    executed += 1
    if (options.singleStep && !next.stepOverCall) {
      return { state: next, reason: 'completed' }
    }
  }
}
