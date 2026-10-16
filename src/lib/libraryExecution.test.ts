import { describe, expect, it } from 'vitest'
import { runExecutionChunk, stepExecutionChunk, visibleExecution } from './debugger'
import { answerAskExecution, completeTextLoadExecution, createExecution, replaceExecutionInputQueue, type ExecutionState } from './interpreter'
import type { BranchLabel, Program, ProgramNode } from './types'

function program(nodes: [string, ProgramNode['type'], string][], edges: [string, string, BranchLabel?][]): Program {
  return {
    version: 1,
    nodes: nodes.map(([id, type, text]) => ({ id, type, text, position: { x: 0, y: 0 } })),
    edges: edges.map(([source, target, label]) => ({ id: `${source}-${target}`, source, target, label })),
  }
}

const consumer = program([
  ['main', 'function', 'main'], ['call', 'assignment', 'result <- helper(4)'],
  ['output', 'output', 'result'], ['end', 'return', 'result'],
], [['main', 'call'], ['call', 'output'], ['output', 'end']])
const helper = program([
  ['helper', 'function', 'helper'], ['input', 'input', 'n'], ['end', 'return', 'n + 1'],
], [['helper', 'input'], ['input', 'end']])
const unlimited = { maxSteps: 1000, maxMilliseconds: Infinity }

function atCall(library: Program = helper, source: Program = consumer): ExecutionState {
  return stepExecutionChunk(createExecution(source, [], { importedPrograms: [library], nativeLibraries: ['text'] })).state
}

function finishStep(state: ExecutionState): ExecutionState {
  let result = stepExecutionChunk(state, unlimited)
  for (let chunks = 0; result.reason === 'yield' && chunks < 100; chunks += 1) {
    result = stepExecutionChunk(result.state, unlimited)
  }
  expect(result.reason).not.toBe('yield')
  return result.state
}

function localConsumer(library = helper, expression = 'helper(4)'): Program {
  const outer = program([
    ['main', 'function', 'main'], ['main-call', 'assignment', 'answer <- outer()'],
    ['main-end', 'return', 'answer'], ['outer', 'function', 'outer'],
    ['call', 'assignment', `result <- ${expression}`], ['end', 'return', 'result'],
  ], [['main', 'main-call'], ['main-call', 'main-end'], ['outer', 'call'], ['call', 'end']])
  return {
    ...outer,
    nodes: [...outer.nodes, ...library.nodes.map(node => ({ ...node, id: `local-${node.id}` }))],
    edges: [...outer.edges, ...library.edges.map(edge => ({ ...edge, id: `local-${edge.id}`, source: `local-${edge.source}`, target: `local-${edge.target}` }))],
  }
}

function atNestedCall(source = localConsumer()): ExecutionState {
  let state = createExecution(source, [], { nativeLibraries: ['text'] })
  state = finishStep(state)
  state = finishStep(state)
  expect(state.functionName).toBe('outer')
  expect(state.currentNodeId).toBe('outer')
  state = finishStep(state)
  expect(state.currentNodeId).toBe('call')
  return state
}

describe('calls made by local functions', () => {
  it('enters the function called by main but completes its local calls in one visible step', () => {
    const state = finishStep(atNestedCall())
    expect(state.currentNodeId).toBe('end')
    expect(state.functionName).toBe('outer')
    expect(state.callStack.map(frame => frame.functionName)).toEqual(['main'])
    expect(state.environment).toEqual({ result: 5 })
    expect(state.lastStep?.changedVariables).toEqual([{ name: 'result', before: undefined, after: 5 }])
    expect(state.incomingEdge?.edgeId).toBe('call-end')
    expect(visibleExecution(state).steps).toBe(4)
    const returned = finishStep(state)
    expect(returned.currentNodeId).toBe('main-end')
    expect(returned.environment.answer).toBe(5)
  })

  it('keeps the caller visible across chunks and completes repeated calls in the same expression', () => {
    const before = atNestedCall(localConsumer(helper, 'helper(4) + helper(5)'))
    const partial = stepExecutionChunk(before, { maxSteps: 1, maxMilliseconds: Infinity })
    expect(partial.reason).toBe('yield')
    const visible = visibleExecution(partial.state)
    expect(visible.currentNodeId).toBe('call')
    expect(visible.functionName).toBe('outer')
    expect(visible.environment).toEqual({})
    expect(visible.callStack.map(frame => frame.functionName)).toEqual(['main'])
    expect(visible.steps).toBe(4)
    const state = finishStep(partial.state)
    expect(state.currentNodeId).toBe('end')
    expect(state.environment.result).toBe(11)
    expect(visibleExecution(state).steps).toBe(4)
  })

  it('skips breakpoints inside stepped-over calls and stops at the next visible block', () => {
    const result = runExecutionChunk(atNestedCall(), { ...unlimited, breakpoints: new Set(['local-helper', 'local-input', 'end']) })
    expect(result.reason).toBe('breakpoint')
    expect(result.state.currentNodeId).toBe('end')
    expect(result.state.environment.result).toBe(5)
  })

  it.each(['ask()', 'text_from_url("https://example.com/data")'])('resumes %s in a local call without advancing past the calling block', expression => {
    const local = program([['helper', 'function', 'helper'], ['input', 'input', 'n'], ['end', 'return', expression]],
      [['helper', 'input'], ['input', 'end']])
    const blocked = finishStep(atNestedCall(localConsumer(local)))
    expect(['asking', 'loading']).toContain(blocked.status)
    expect(visibleExecution(blocked).currentNodeId).toBe('call')
    const answered = expression === 'ask()' ? answerAskExecution(blocked, '42') : completeTextLoadExecution(blocked, '42')
    const state = finishStep(answered)
    expect(state.currentNodeId).toBe('end')
    expect(state.environment.result).toBe(expression === 'ask()' ? 42 : '42')
    expect(visibleExecution(state).steps).toBe(4)
  })

  it('reveals every block in direct recursive calls made by the function that main entered', () => {
    const recursive = program([
      ['main', 'function', 'main'], ['call', 'assignment', 'result <- factorial(4)'], ['end', 'return', 'result'],
      ['factorial', 'function', 'factorial'], ['input', 'input', 'n'], ['condition', 'if', 'n > 1'],
      ['recurse', 'return', 'n * factorial(n - 1)'], ['base', 'return', '1'],
    ], [['main', 'call'], ['call', 'end'], ['factorial', 'input'], ['input', 'condition'], ['condition', 'recurse', 'true'], ['condition', 'base', 'false']])
    let state = createExecution(recursive, [])
    state = finishStep(finishStep(state))
    for (let n = 4; n >= 1; n--) {
      expect(state.currentNodeId).toBe('factorial')
      expect(state.callStack.map(frame => frame.functionName)).toEqual(['main', ...Array(4 - n).fill('factorial')])
      state = finishStep(state)
      expect(state.currentNodeId).toBe('input')
      state = finishStep(state)
      expect(state.currentNodeId).toBe('condition')
      expect(state.environment.n).toBe(n)
      state = finishStep(state)
      expect(state.currentNodeId).toBe(n > 1 ? 'recurse' : 'base')
      if (n > 1) state = finishStep(state)
      expect(state.stepOverCall).toBeUndefined()
    }
    state = finishStep(state)
    expect(state.currentNodeId).toBe('end')
    expect(state.environment.result).toBe(24)
    expect(state.lastStep?.changedVariables).toEqual([{ name: 'result', before: undefined, after: 24 }])
    expect(visibleExecution(state).steps).toBe(18)
    expect(state.hiddenSteps ?? 0).toBe(0)
  })

  it('keeps recursion hidden inside a call to a different local function', () => {
    const recursiveHelper = program([
      ['helper', 'function', 'helper'], ['input', 'input', 'n'], ['condition', 'if', 'n > 1'],
      ['recurse', 'return', 'n * helper(n - 1)'], ['base', 'return', '1'],
    ], [['helper', 'input'], ['input', 'condition'], ['condition', 'recurse', 'true'], ['condition', 'base', 'false']])
    const state = finishStep(atNestedCall(localConsumer(recursiveHelper)))
    expect(state.currentNodeId).toBe('end')
    expect(state.functionName).toBe('outer')
    expect(state.environment.result).toBe(24)
    expect(visibleExecution(state).steps).toBe(4)
  })

  it.each(['helper(n) * factorial(n - 1)', 'factorial(n - 1) * helper(n)'])(
    'steps over other functions alongside visible self-calls in %s', expression => {
      const source = program([
        ['main', 'function', 'main'], ['call', 'assignment', 'result <- factorial(4)'], ['end', 'return', 'result'],
        ['factorial', 'function', 'factorial'], ['input', 'input', 'n'], ['condition', 'if', 'n > 1'],
        ['recurse', 'return', expression], ['base', 'return', '1'],
        ['helper', 'function', 'helper'], ['helper-input', 'input', 'value'], ['helper-end', 'return', 'value'],
      ], [
        ['main', 'call'], ['call', 'end'], ['factorial', 'input'], ['input', 'condition'],
        ['condition', 'recurse', 'true'], ['condition', 'base', 'false'],
        ['helper', 'helper-input'], ['helper-input', 'helper-end'],
      ])
      let state = createExecution(source, [])
      const argumentsSeen: unknown[] = []
      for (let i = 0; i < 40 && state.currentNodeId !== 'end'; i++) {
        state = finishStep(state)
        expect(state.functionName).not.toBe('helper')
        expect(state.stepOverCall).toBeUndefined()
        if (state.currentNodeId === 'condition') argumentsSeen.push(state.environment.n)
      }
      expect(argumentsSeen).toEqual([4, 3, 2, 1])
      expect(state.currentNodeId).toBe('end')
      expect(state.environment.result).toBe(24)
    },
  )

  it('keeps errors inside local calls at the caller', () => {
    const local = program([['helper', 'function', 'helper'], ['input', 'input', 'n'], ['end', 'return', '1 / 0']],
      [['helper', 'input'], ['input', 'end']])
    const state = finishStep(atNestedCall(localConsumer(local)))
    expect(state.status).toBe('error')
    expect(visibleExecution(state).currentNodeId).toBe('call')
    expect(visibleExecution(state).environment).toEqual({})
  })
})

describe('opaque imported library execution', () => {
  it('finishes an imported call in one visible step with caller feedback and the arrival wire', () => {
    const state = finishStep(atCall())
    expect(state.program).toBe(consumer)
    expect(state.currentNodeId).toBe('output')
    expect(state.environment).toEqual({ result: 5 })
    expect(state.output).toEqual([])
    expect(state.incomingEdge).toEqual({ program: consumer, edgeId: 'call-output' })
    expect(state.lastStep?.changedVariables).toEqual([{ name: 'result', before: undefined, after: 5 }])
    expect(visibleExecution(state).steps).toBe(2)
  })

  it('keeps the caller visible across bounded chunks and skips library breakpoints with duplicate IDs', () => {
    let state = atCall()
    const breakpoints = new Set(['input', 'end', 'output'])
    for (let index = 0; index < 3; index += 1) {
      const chunk = runExecutionChunk(state, { maxSteps: 1, maxMilliseconds: Infinity, breakpoints })
      expect(chunk.reason).toBe('yield')
      state = chunk.state
      const view = visibleExecution(state)
      expect(view.currentNodeId).toBe('call')
      expect(view.functionName).toBe('main')
      expect(view.environment).toEqual({})
      expect(view.callStack).toEqual([])
      expect(view.lastStep).toBeUndefined()
      expect(view.incomingEdge).toEqual({ program: consumer, edgeId: 'main-call' })
      expect(view.steps).toBe(2)
    }
    const done = runExecutionChunk(state, { ...unlimited, breakpoints })
    expect(done.reason).toBe('breakpoint')
    expect(done.state.currentNodeId).toBe('output')
    expect(visibleExecution(done.state).steps).toBe(2)
  })

  it('hides recursive imported calls and retains their output', () => {
    const recursive = program([
      ['helper', 'function', 'helper'], ['input', 'input', 'n'], ['condition', 'if', 'n > 0'],
      ['recurse', 'return', 'n * helper(n - 1)'], ['log', 'output', '"base"'], ['base', 'return', '1'],
    ], [['helper', 'input'], ['input', 'condition'], ['condition', 'recurse', 'true'], ['condition', 'log', 'false'], ['log', 'base']])
    const state = finishStep(atCall(recursive))
    expect(state.environment.result).toBe(24)
    expect(state.output).toEqual(['base'])
    expect(visibleExecution(state).steps).toBe(2)
  })

  it('hides callbacks within repeated library calls but enters subsequent local calls', () => {
    const source = program([
      ['main', 'function', 'main'], ['call', 'assignment', 'result <- helper() + helper() + local()'],
      ['end', 'return', 'result'], ['local', 'function', 'local'], ['local-return', 'return', '3'],
    ], [['main', 'call'], ['call', 'end'], ['local', 'local-return']])
    const library = program([
      ['helper', 'function', 'helper'], ['return', 'return', 'local()'],
    ], [['helper', 'return']])
    const initial = atCall(library, source)
    const run = runExecutionChunk(initial, { ...unlimited, breakpoints: new Set(['local']) })
    expect(run.reason).toBe('breakpoint')
    expect(run.state.callStack).toHaveLength(1)
    expect(run.state.stepOverCall).toBeUndefined()
    expect(visibleExecution(run.state).steps).toBe(2)
    const stepped = finishStep(initial)
    expect(stepped.currentNodeId).toBe('local')
    expect(stepped.callStack).toHaveLength(1)
    expect(stepped.stepOverCall).toBeUndefined()
  })

  it('still steps into a function defined on the current canvas when it overrides an import', () => {
    const source = { ...consumer, nodes: [...consumer.nodes, ...helper.nodes.map(node => ({ ...node, id: `local-${node.id}` }))], edges: [...consumer.edges, ...helper.edges.map(edge => ({ ...edge, id: `local-${edge.id}`, source: `local-${edge.source}`, target: `local-${edge.target}` }))] }
    const state = finishStep(atCall(helper, source))
    expect(state.currentNodeId).toBe('local-helper')
    expect(state.functionName).toBe('helper')
    expect(state.stepOverCall).toBeUndefined()
  })

  it('shows the ancestor caller when a local Return starts the next library call', () => {
    const source = program([
      ['main', 'function', 'main'], ['call', 'assignment', 'result <- local() + helper(4)'],
      ['end', 'return', 'result'], ['local', 'function', 'local'], ['local-return', 'return', '3'],
    ], [['main', 'call'], ['call', 'end'], ['local', 'local-return']])
    let state = finishStep(atCall(helper, source))
    state = finishStep(state)
    const chunk = stepExecutionChunk(state, { maxSteps: 1, maxMilliseconds: Infinity })
    expect(chunk.reason).toBe('yield')
    const view = visibleExecution(chunk.state)
    expect(view.currentNodeId).toBe('call')
    expect(view.functionName).toBe('main')
    expect(view.callStack).toEqual([])
    state = finishStep(chunk.state)
    expect(state.currentNodeId).toBe('end')
    expect(state.environment.result).toBe(8)
    expect(visibleExecution(state).steps).toBe(4)
  })

  it('reports the caller branch after an imported predicate finishes', () => {
    const source = program([
      ['main', 'function', 'main'], ['condition', 'if', 'helper(4) > 0'],
      ['yes', 'return', '1'], ['no', 'return', '0'],
    ], [['main', 'condition'], ['condition', 'yes', 'true'], ['condition', 'no', 'false']])
    const state = finishStep(atCall(helper, source))
    expect(state.currentNodeId).toBe('yes')
    expect(state.lastStep?.branch).toMatchObject({ program: source, expression: 'helper(4) > 0', label: 'true' })
    expect(state.incomingEdge).toEqual({ program: source, edgeId: 'condition-yes' })
  })

  it('steps over imported methods and reports object changes in the caller', () => {
    const source = program([
      ['main', 'function', 'main'], ['make', 'assignment', 'counter <- Counter(1)'],
      ['call', 'call', 'counter.increment()'], ['end', 'return', 'counter.value'],
    ], [['main', 'make'], ['make', 'call'], ['call', 'end']])
    const library = program([
      ['class', 'class', 'Counter(value)'], ['method', 'method', 'increment'],
      ['increment', 'assignment', 'self.value <- self.value + 1'], ['return', 'return', '0'],
    ], [['class', 'method'], ['method', 'increment'], ['increment', 'return']])
    const state = finishStep(finishStep(atCall(library, source)))
    expect(state.currentNodeId).toBe('end')
    expect(state.objectHeap[1].fields.value).toBe(2)
    expect(state.lastStep?.changedVariables.map(change => change.name)).toEqual(['counter'])
    expect(visibleExecution(state).steps).toBe(3)
  })

  it.each(['ask()', 'text_from_url("https://example.com/data")'])('resumes %s inside a library without stepping past the caller', expression => {
    const library = program([
      ['helper', 'function', 'helper'], ['input', 'input', 'n'], ['end', 'return', expression],
    ], [['helper', 'input'], ['input', 'end']])
    const blocked = finishStep(atCall(library))
    expect(['asking', 'loading']).toContain(blocked.status)
    expect(visibleExecution(blocked).environment).toEqual({})
    const answered = expression === 'ask()' ? answerAskExecution(blocked, '42') : completeTextLoadExecution(blocked, '42')
    const state = finishStep(answered)
    expect(state.currentNodeId).toBe('output')
    expect(state.output).toEqual([])
    expect(state.lastStep?.changedVariables[0]?.name).toBe('result')
    expect(visibleExecution(state).steps).toBe(2)
  })

  it('allows a library input wait to resume without exposing its variables', () => {
    const library = program([
      ['helper', 'function', 'helper'], ['first', 'input', 'n'], ['second', 'input', 'secret'], ['end', 'return', 'n + secret'],
    ], [['helper', 'first'], ['first', 'second'], ['second', 'end']])
    const waiting = finishStep(atCall(library))
    expect(waiting.status).toBe('waiting')
    expect(visibleExecution(waiting).currentNodeId).toBe('call')
    expect(visibleExecution(waiting).environment).toEqual({})
    const state = finishStep(replaceExecutionInputQueue(waiting, ['8']))
    expect(state.environment.result).toBe(12)
    expect(visibleExecution(state).steps).toBe(2)
  })

  it('keeps errors and runaway limits while hiding the internal failure location', () => {
    const library = program([
      ['helper', 'function', 'helper'], ['loop', 'while', 'True'], ['end', 'return', '0'],
    ], [['helper', 'loop'], ['loop', 'loop', 'true'], ['loop', 'end', 'false']])
    const state = finishStep({ ...atCall(library), maxSteps: 30 })
    expect(state.status).toBe('error')
    expect(state.error).toContain('Maximum step count of 30')
    const view = visibleExecution(state)
    expect(view.currentNodeId).toBe('call')
    expect(view.steps).toBe(2)
    expect(view.lastStep).toBeUndefined()
    expect(view.environment).toEqual({})
  })
})
