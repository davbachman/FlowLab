import { describe, expect, it } from 'vitest'
import {
  answerAskExecution,
  completeTextLoadExecution,
  createExecution,
  failTextLoadExecution,
  replaceExecutionInputQueue,
  stepExecution,
  type ExecutionState,
} from './interpreter'
import type { BranchLabel, Program, ProgramNode } from './types'

function program(
  nodes: [string, ProgramNode['type'], string][],
  edges: [string, string, BranchLabel?][],
): Program {
  return {
    version: 1,
    nodes: nodes.map(([id, type, text]) => ({ id, type, text, position: { x: 0, y: 0 } })),
    edges: edges.map(([source, target, label], index) => ({ id: `e${index}`, source, target, label })),
  }
}

function expectArrival(state: ExecutionState, source: Program, edgeIndex: number) {
  const edge = source.edges[edgeIndex]
  expect(state.program).toBe(source)
  expect(state.currentNodeId).toBe(edge.target)
  expect(state.incomingEdge?.edgeId).toBe(edge.id)
  expect(state.incomingEdge?.program).toBe(source)
}

describe('execution wire tracing', () => {
  it('follows each linear block and retains the arrival wire when Return finishes', () => {
    const source = program([
      ['main', 'function', 'main'], ['input', 'input', 'n'],
      ['process', 'process', 'n <- n + 1\nn <- n * 2'],
      ['output', 'output', 'n'], ['end', 'return', 'n'],
    ], [['main', 'input'], ['input', 'process'], ['process', 'output'], ['output', 'end']])
    let state = createExecution(source, ['3'])
    expect(state.incomingEdge).toBeUndefined()
    for (let index = 0; index < source.edges.length; index += 1) {
      state = stepExecution(state)
      expectArrival(state, source, index)
    }
    state = stepExecution(state)
    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['8'])
    expectArrival(state, source, 3)
    expect(createExecution(source, ['3']).incomingEdge).toBeUndefined()
  })

  it.each(['True', 'False'])('records the actual %s If branch even when both wires share a target', (condition) => {
    const source = program([
      ['main', 'function', 'main'], ['if', 'if', condition], ['end', 'return', '0'],
    ], [['main', 'if'], ['if', 'end', 'true'], ['if', 'end', 'false']])
    const state = stepExecution(stepExecution(createExecution(source, [])))
    const edgeIndex = condition === 'True' ? 1 : 2
    expectArrival(state, source, edgeIndex)
    expect(state.lastStep?.branch?.edgeId).toBe(source.edges[edgeIndex].id)
  })

  it.each([
    ['while', 'n > 0'], ['for', 'item in [1]'],
  ] as const)('distinguishes the initial, loopback, and exit wires of a %s loop', (type, text) => {
    const source = program([
      ['main', 'function', 'main'], ['init', 'assignment', 'n <- 1'],
      ['loop', type, text], ['body', 'assignment', 'n <- n - 1'], ['end', 'return', 'n'],
    ], [
      ['main', 'init'], ['init', 'loop'], ['loop', 'body', 'true'],
      ['body', 'loop'], ['loop', 'end', 'false'],
    ])
    let state = createExecution(source, [])
    for (const edgeIndex of [0, 1, 2, 3, 4]) {
      state = stepExecution(state)
      expectArrival(state, source, edgeIndex)
    }
  })

  it('keeps the incoming wire while waiting for input, then moves it after input is consumed', () => {
    const source = program([
      ['main', 'function', 'main'], ['input', 'input', 'n'], ['end', 'return', 'n'],
    ], [['main', 'input'], ['input', 'end']])
    const arrived = stepExecution(createExecution(source, []))
    const waiting = stepExecution(arrived)
    expect(waiting.status).toBe('waiting')
    expectArrival(waiting, source, 0)
    expect(stepExecution(waiting)).toBe(waiting)
    const resumed = stepExecution(replaceExecutionInputQueue(waiting, ['4']))
    expectArrival(resumed, source, 1)
    expect(resumed.environment.n).toBe(4)
  })

  it('keeps the incoming wire during ask and advances it when the answer completes the block', () => {
    const source = program([
      ['main', 'function', 'main'], ['ask', 'assignment', 'answer <- ask()'], ['end', 'return', 'answer'],
    ], [['main', 'ask'], ['ask', 'end']])
    const asking = stepExecution(stepExecution(createExecution(source, [])))
    expect(asking.status).toBe('asking')
    expectArrival(asking, source, 0)
    expect(stepExecution(asking)).toBe(asking)
    expectArrival(answerAskExecution(asking, '42'), source, 1)
  })

  it('keeps the incoming wire while loading and on failure, and advances on success', () => {
    const source = program([
      ['main', 'function', 'main'], ['load', 'assignment', 'result <- text_from_url("https://example.com/text")'],
      ['end', 'return', 'result'],
    ], [['main', 'load'], ['load', 'end']])
    const loading = stepExecution(stepExecution(createExecution(source, [], { nativeLibraries: ['text'] })))
    expect(loading.status).toBe('loading')
    expectArrival(loading, source, 0)
    expect(stepExecution(loading)).toBe(loading)
    const failed = failTextLoadExecution(loading, 'Network unavailable')
    expect(failed.status).toBe('error')
    expectArrival(failed, source, 0)
    expectArrival(completeTextLoadExecution(loading, 'loaded'), source, 1)
  })

  it('preserves the arrival wire when a block encounters a runtime error', () => {
    const source = program([
      ['main', 'function', 'main'], ['bad', 'assignment', 'result <- unknown'], ['end', 'return', 'result'],
    ], [['main', 'bad'], ['bad', 'end']])
    const failed = stepExecution(stepExecution(createExecution(source, [])))
    expect(failed.status).toBe('error')
    expectArrival(failed, source, 0)
  })

  it('scopes duplicate edge IDs to their programs and traces the caller after an imported return', () => {
    const source = program([
      ['main', 'function', 'main'], ['call', 'assignment', 'result <- helper(4)'], ['end', 'return', 'result'],
    ], [['main', 'call'], ['call', 'end']])
    const imported = program([
      ['helper', 'function', 'helper'], ['input', 'input', 'n'], ['return', 'return', 'n + 1'],
    ], [['helper', 'input'], ['input', 'return']])
    let state = stepExecution(createExecution(source, [], { importedPrograms: [imported] }))
    expectArrival(state, source, 0)
    state = stepExecution(state)
    expect(state.currentNodeId).toBe('helper')
    expect(state.program).toBe(imported)
    expect(state.incomingEdge).toBeUndefined()
    state = stepExecution(state)
    expectArrival(state, imported, 0)
    state = stepExecution(state)
    expectArrival(state, imported, 1)
    state = stepExecution(state)
    expectArrival(state, source, 1)
    expect(state.environment.result).toBe(5)
  })

  it('clears the callee wire if its caller suspends again before traversing a wire', () => {
    const source = program([
      ['main', 'function', 'main'], ['call', 'assignment', 'result <- helper() + ask()'], ['end', 'return', 'result'],
      ['helper', 'function', 'helper'], ['return', 'return', '1'],
    ], [['main', 'call'], ['call', 'end'], ['helper', 'return']])
    let state = createExecution(source, [])
    for (let index = 0; index < 4; index += 1) state = stepExecution(state)
    expect(state.currentNodeId).toBe('call')
    expect(state.status).toBe('asking')
    expect(state.incomingEdge).toBeUndefined()
    expectArrival(answerAskExecution(state, '2'), source, 1)
  })

  it('starts a method without highlighting the class ownership wire and traces its return', () => {
    const source = program([
      ['main', 'function', 'main'], ['make', 'assignment', 'counter <- Counter(1)'],
      ['call', 'call', 'counter.increment()'], ['end', 'return', 'counter.value'],
      ['class', 'class', 'Counter(value)'], ['method', 'method', 'increment'],
      ['increment', 'assignment', 'value <- value + 1'], ['method-return', 'return', '0'],
    ], [
      ['main', 'make'], ['make', 'call'], ['call', 'end'], ['class', 'method'],
      ['method', 'increment'], ['increment', 'method-return'],
    ])
    let state = createExecution(source, [])
    state = stepExecution(stepExecution(stepExecution(state)))
    expect(state.currentNodeId).toBe('method')
    expect(state.incomingEdge).toBeUndefined()
    state = stepExecution(state)
    expectArrival(state, source, 4)
    state = stepExecution(state)
    expectArrival(state, source, 5)
    state = stepExecution(state)
    expectArrival(state, source, 2)
    expect(state.objectHeap[1].fields.value).toBe(2)
  })
})
