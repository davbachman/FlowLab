import { executionVariableChanges, stepExecution, type ExecutionState } from './interpreter'

/** Keep this target while a step waits for input or a native library load. */
export interface StepOverTarget {
  depth: number
  startSteps: number
  initialState: ExecutionState
}

export interface ExecutionChunkOptions {
  /** IDs from the editable root program; imported IDs occupy a separate scope. */
  breakpoints?: ReadonlySet<string>
  /** Skip only the first breakpoint check, so a loop can hit it again. */
  skipCurrentBreakpoint?: boolean
  stepOver?: StepOverTarget
  maxSteps?: number
  maxMilliseconds?: number
}

export interface ExecutionChunkResult {
  state: ExecutionState
  reason: 'yield' | 'breakpoint' | 'step-over' | 'blocked' | 'completed'
}

export function createStepOverTarget(state: ExecutionState): StepOverTarget {
  return { depth: state.callStack.length, startSteps: state.steps, initialState: state }
}

/**
 * Execute a bounded amount of work, then yield to the UI. The caller schedules
 * another chunk after 'yield' and cancels that schedule to stop execution.
 * Preserve stepOver across chunks and async input/load completion, but pass
 * skipCurrentBreakpoint only on an explicit Continue or Step Over action.
 */
export function runExecutionChunk(
  state: ExecutionState,
  options: ExecutionChunkOptions = {},
): ExecutionChunkResult {
  const limit = Math.max(1, Math.floor(options.maxSteps ?? 100))
  const deadline = performance.now() + Math.max(0, options.maxMilliseconds ?? 8)
  let next = state
  let executed = 0

  while (true) {
    if (next.status === 'halted' || next.status === 'error' || !next.currentNodeId) {
      return { state: stepOverFeedback(next, options.stepOver), reason: 'completed' }
    }
    if (
      next.status === 'asking' || next.status === 'loading' ||
      (next.status === 'waiting' && next.inputQueue.length === 0)
    ) {
      return { state: next, reason: 'blocked' }
    }
    if (
      options.stepOver && next.status === 'running' &&
      next.steps > options.stepOver.startSteps &&
      next.callStack.length <= options.stepOver.depth
    ) {
      return { state: stepOverFeedback(next, options.stepOver), reason: 'step-over' }
    }
    if (
      !(executed === 0 && options.skipCurrentBreakpoint) &&
      next.program === next.rootProgram && options.breakpoints?.has(next.currentNodeId)
    ) {
      return { state: next, reason: 'breakpoint' }
    }
    // At least one step per chunk prevents a zero-time budget from starving.
    if (executed >= limit || (executed > 0 && performance.now() >= deadline)) {
      return { state: next, reason: 'yield' }
    }
    next = stepExecution(next)
    executed += 1
  }
}

function stepOverFeedback(state: ExecutionState, target?: StepOverTarget): ExecutionState {
  if (!target || !state.lastStep) return state
  return {
    ...state,
    lastStep: {
      ...state.lastStep,
      changedVariables: executionVariableChanges(target.initialState, state),
    },
  }
}
