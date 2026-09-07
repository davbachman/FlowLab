import { stepExecution, type ExecutionState } from './interpreter'

export interface ExecutionChunkOptions {
  /** IDs from the editable root program; imported IDs occupy a separate scope. */
  breakpoints?: ReadonlySet<string>
  /** Skip only the first breakpoint check, so a loop can hit it again. */
  skipCurrentBreakpoint?: boolean
  maxSteps?: number
  maxMilliseconds?: number
}

export interface ExecutionChunkResult {
  state: ExecutionState
  reason: 'yield' | 'breakpoint' | 'blocked' | 'completed'
}

/**
 * Execute a bounded amount of work, then yield to the UI. The caller schedules
 * another chunk after 'yield' and cancels that schedule to stop execution.
 * Pass skipCurrentBreakpoint only on an explicit Continue action.
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
