import { describe, expect, it, vi } from 'vitest'
import { createStepOverTarget, runExecutionChunk } from './debugger'
import {
  answerAskExecution,
  completeTextLoadExecution,
  createExecution,
  replaceExecutionInputQueue,
  runExecution,
  stepExecution,
} from './interpreter'
import type { BranchLabel, Program, ProgramNode } from './types'

function program(
  nodes: [string, ProgramNode['type'], string][],
  edges: [string, string, BranchLabel?][],
): Program {
  return {
    version: 1,
    nodes: nodes.map(([id, type, text]) => ({ id, type, text, position: { x: 0, y: 0 } })),
    edges: edges.map(([source, target, label]) => ({ id: `${source}-${target}`, source, target, label })),
  }
}

const loop = program([
  ['main', 'function', 'main'],
  ['init', 'assignment', 'n <- 2'],
  ['condition', 'while', 'n > 0'],
  ['decrement', 'assignment', 'n <- n - 1'],
  ['end', 'return', 'n'],
], [
  ['main', 'init'], ['init', 'condition'], ['condition', 'decrement', 'true'],
  ['decrement', 'condition'], ['condition', 'end', 'false'],
])

const recursive = program([
  ['main', 'function', 'main'],
  ['calculate', 'assignment', 'result <- factorial(4)'],
  ['output', 'output', 'result'],
  ['end', 'return', 'result'],
  ['factorial', 'function', 'factorial'],
  ['input', 'input', 'n'],
  ['condition', 'if', 'n < 2'],
  ['base', 'return', '1'],
  ['recursive', 'return', 'n * factorial(n - 1)'],
], [
  ['main', 'calculate'], ['calculate', 'output'], ['output', 'end'],
  ['factorial', 'input'], ['input', 'condition'], ['condition', 'base', 'true'],
  ['condition', 'recursive', 'false'],
])

describe('bounded debugger execution', () => {
  it('yields after a bounded number of steps and resumes with identical results', () => {
    const initial = createExecution(loop, [])
    let result = runExecutionChunk(initial, { maxSteps: 2, maxMilliseconds: Infinity })
    expect(result.reason).toBe('yield')
    expect(result.state.steps).toBe(2)
    expect(result.state.currentNodeId).toBe('condition')
    while (result.reason === 'yield') {
      result = runExecutionChunk(result.state, { maxSteps: 2, maxMilliseconds: Infinity })
    }
    expect(result.reason).toBe('completed')
    expect(result.state).toEqual(runExecution(initial))
  })

  it('yields to the clock even when the step budget has not been reached', () => {
    const now = vi.spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValue(9)
    const result = runExecutionChunk(createExecution(loop, []), { maxMilliseconds: 8 })
    now.mockRestore()
    expect(result.reason).toBe('yield')
    expect(result.state.steps).toBe(1)
  })

  it('stops before a breakpoint and skips it only once when continuing around a loop', () => {
    const breakpoints = new Set(['condition'])
    const first = runExecutionChunk(createExecution(loop, []), { breakpoints })
    expect(first.reason).toBe('breakpoint')
    expect(first.state.environment.n).toBe(2)
    const second = runExecutionChunk(first.state, { breakpoints, skipCurrentBreakpoint: true })
    expect(second.reason).toBe('breakpoint')
    expect(second.state.environment.n).toBe(1)
    expect(second.state.steps).toBe(first.state.steps + 2)
  })

  it('steps over recursive calls across chunks and reports the caller assignment', () => {
    let state = stepExecution(createExecution(recursive, []))
    const stepOver = createStepOverTarget(state)
    let result = runExecutionChunk(state, { stepOver, maxSteps: 2 })
    let deepestStack = 0
    while (result.reason === 'yield') {
      state = result.state
      deepestStack = Math.max(deepestStack, state.callStack.length)
      result = runExecutionChunk(state, { stepOver, maxSteps: 2 })
    }
    expect(deepestStack).toBeGreaterThan(1)
    expect(result.reason).toBe('step-over')
    expect(result.state.currentNodeId).toBe('output')
    expect(result.state.environment).toEqual({ result: 24 })
    expect(result.state.output).toEqual([])
    expect(result.state.lastStep?.changedVariables).toEqual([
      { name: 'result', before: undefined, after: 24 },
    ])
    expect(result.state.lastStep?.callStack).toEqual(['main'])
  })

  it('honors a breakpoint inside Step Over and can resume the same target', () => {
    const state = stepExecution(createExecution(recursive, []))
    const stepOver = createStepOverTarget(state)
    const stopped = runExecutionChunk(state, { stepOver, breakpoints: new Set(['condition']) })
    expect(stopped.reason).toBe('breakpoint')
    expect(stopped.state.functionName).toBe('factorial')
    const resumed = runExecutionChunk(stopped.state, { stepOver, maxSteps: 100 })
    expect(resumed.reason).toBe('step-over')
    expect(resumed.state.environment.result).toBe(24)
  })

  it('finishes Step Over after ask resumes without executing the next block', () => {
    const source = program([
      ['main', 'function', 'main'], ['ask', 'assignment', 'answer <- ask()'],
      ['output', 'output', 'answer'], ['end', 'return', 'answer'],
    ], [['main', 'ask'], ['ask', 'output'], ['output', 'end']])
    const state = stepExecution(createExecution(source, []))
    const stepOver = createStepOverTarget(state)
    const blocked = runExecutionChunk(state, { stepOver })
    expect(blocked.reason).toBe('blocked')
    expect(blocked.state.status).toBe('asking')
    const answered = answerAskExecution(blocked.state, '42')
    const resumed = runExecutionChunk(answered, { stepOver })
    expect(resumed.reason).toBe('step-over')
    expect(resumed.state.currentNodeId).toBe('output')
    expect(resumed.state.output).toEqual([])
    expect(resumed.state.lastStep?.changedVariables).toEqual([
      { name: 'answer', before: undefined, after: 42 },
    ])
  })

  it('steps over a call containing an async text load before returning to the caller', () => {
    const source = program([
      ['main', 'function', 'main'], ['call', 'assignment', 'result <- load()'],
      ['end', 'return', 'result'], ['load', 'function', 'load'],
      ['load-return', 'return', 'text_from_url("https://example.com/text")'],
    ], [['main', 'call'], ['call', 'end'], ['load', 'load-return']])
    const state = stepExecution(createExecution(source, [], { nativeLibraries: ['text'] }))
    const stepOver = createStepOverTarget(state)
    const blocked = runExecutionChunk(state, { stepOver })
    expect(blocked.reason).toBe('blocked')
    expect(blocked.state.status).toBe('loading')
    const resumed = runExecutionChunk(completeTextLoadExecution(blocked.state, 'hello'), { stepOver })
    expect(resumed.reason).toBe('step-over')
    expect(resumed.state.currentNodeId).toBe('end')
    expect(resumed.state.environment.result).toBe('hello')
  })

  it('does not mistake queued input for a finished Step Over', () => {
    const source = program([
      ['main', 'function', 'main'], ['input', 'input', 'n'], ['end', 'return', 'n'],
    ], [['main', 'input'], ['input', 'end']])
    const state = stepExecution(createExecution(source, []))
    const stepOver = createStepOverTarget(state)
    const blocked = runExecutionChunk(state, { stepOver })
    const resumed = runExecutionChunk(replaceExecutionInputQueue(blocked.state, ['5']), { stepOver })
    expect(resumed.reason).toBe('step-over')
    expect(resumed.state.environment.n).toBe(5)
    expect(resumed.state.currentNodeId).toBe('end')
  })
})

describe('execution feedback', () => {
  it('records variable changes and the selected branch edge', () => {
    let state = stepExecution(stepExecution(createExecution(loop, [])))
    expect(state.lastStep?.changedVariables).toEqual([{ name: 'n', before: undefined, after: 2 }])
    state = stepExecution(state)
    expect(state.lastStep?.branch).toEqual({
      nodeId: 'condition', expression: 'n > 0', label: 'true', edgeId: 'condition-decrement', program: loop,
    })
    state = stepExecution(state)
    expect(state.lastStep?.branch).toBeUndefined()
    expect(state.lastStep?.changedVariables).toEqual([{ name: 'n', before: 2, after: 1 }])
  })

  it('records a resumed branch decision without running its side effects again', () => {
    const source = program([
      ['main', 'function', 'main'], ['condition', 'if', 'check()'],
      ['yes', 'return', '1'], ['no', 'return', '0'],
      ['check', 'function', 'check'], ['log', 'output', '"checked"'], ['check-return', 'return', 'True'],
    ], [
      ['main', 'condition'], ['condition', 'yes', 'true'], ['condition', 'no', 'false'],
      ['check', 'log'], ['log', 'check-return'],
    ])
    const state = stepExecution(createExecution(source, []))
    const result = runExecutionChunk(state, { stepOver: createStepOverTarget(state) })
    expect(result.reason).toBe('step-over')
    expect(result.state.output).toEqual(['checked'])
    expect(result.state.lastStep?.nodeId).toBe('condition')
    expect(result.state.lastStep?.branch?.label).toBe('true')
    expect(result.state.lastStep?.branch?.edgeId).toBe('condition-yes')
  })

  it('highlights objects changed inside a stepped-over method without invoking repr', () => {
    const source = program([
      ['main', 'function', 'main'], ['make', 'assignment', 'counter <- Counter(1)'],
      ['call', 'call', 'counter.increment()'], ['end', 'return', 'counter.value'],
      ['class', 'class', 'Counter(value)'], ['method', 'method', 'increment'],
      ['increment', 'assignment', 'value <- value + 1'], ['method-return', 'return', '0'],
    ], [
      ['main', 'make'], ['make', 'call'], ['call', 'end'], ['class', 'method'],
      ['method', 'increment'], ['increment', 'method-return'],
    ])
    const state = stepExecution(stepExecution(createExecution(source, [])))
    const result = runExecutionChunk(state, { stepOver: createStepOverTarget(state) })
    expect(result.reason).toBe('step-over')
    expect(result.state.objectHeap[1].fields.value).toBe(2)
    expect(result.state.lastStep?.changedVariables.map((change) => change.name)).toEqual(['counter'])
    expect(result.state.output).toEqual([])
  })
})
