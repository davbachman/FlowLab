import { describe, expect, it } from 'vitest'
import {
  answerAskExecution, completeImageLoadExecution, completeTextLoadExecution,
  createExecution, executionVariableChanges, failImageLoadExecution, failTextLoadExecution,
  replaceExecutionInputQueue, runExecution, stepExecution, type ExecutionState,
} from './interpreter'
import { runExecutionChunk, stepExecutionChunk, visibleExecution } from './debugger'
import { program } from '../../scripts/benchmarks/programs'
import { cellLibrary, indexedResumption, references } from '../../scripts/benchmarks/compatibility'
import type { Program, RuntimeObject } from './types'

function objectProgram(body: string, result = '[a.value, alias.value]'): Program {
  return program([
    ['main', 'function', 'main'], ['make', 'process', 'a <- Cell(1)\nalias <- a'],
    ['change', 'process', body], ['end', 'return', result], ['cell', 'class', 'Cell(value)'],
  ], [['main', 'make'], ['make', 'change'], ['change', 'end']])
}

function atChange(p: Program): ExecutionState {
  return stepExecution(stepExecution(createExecution(p, [])))
}

function finish(state: ExecutionState): ExecutionState {
  for (let guard = 0; guard < 500 && state.status !== 'halted' && state.status !== 'error'; guard++) {
    if (state.status === 'asking') state = answerAskExecution(state, '7')
    else if (state.status === 'loading' && state.textRequest) state = completeTextLoadExecution(state, 'text')
    else if (state.status === 'loading') state = completeImageLoadExecution(state, { width: 1, height: 1, pixels: new Uint8ClampedArray([1, 2, 3, 255]) })
    else state = stepExecution(state)
  }
  expect(state.status).toBe('halted')
  return state
}

describe('persistent object storage and public snapshots', () => {
  it.each([false, true])('preserves earlier states across allocations and aliased writes (observed heap: %s)', observe => {
    const before = atChange(objectProgram('b <- Cell(2)\na.value <- 9\na.extra <- b'))
    const retained = observe ? structuredClone(before) : undefined
    const after = stepExecution(before)
    expect(before.objectHeap).toEqual({ 1: { id: 1, className: 'Cell', fields: { value: 1 } } })
    expect(after.objectHeap[1].fields).toEqual({ value: 9, extra: after.environment.b })
    expect(after.objectHeap[2].fields).toEqual({ value: 2 })
    expect(after.environment.a).toBe(after.environment.alias)
    expect(after.environment.a).toBe(before.environment.a)
    expect(after.objectHeap[1]).not.toBe(before.objectHeap[1])
    expect(runExecution(after).returnValue).toEqual([9, 9])
    if (retained) expect(before).toEqual(retained)
  })

  it('shares unchanged instances and preserves heap identity when execution does not write', () => {
    const before = atChange(objectProgram('b <- Cell(2)'))
    const after = stepExecution(before)
    expect(after.objectHeap).not.toBe(before.objectHeap)
    expect(after.objectHeap[1]).toBe(before.objectHeap[1])
    const ended = stepExecution(after)
    expect(ended.objectHeap).toBe(after.objectHeap)
    expect(replaceExecutionInputQueue(ended, []).objectHeap).toBe(ended.objectHeap)
    expect(stepExecution(ended)).toBe(ended)
    expect(runExecution(ended)).toBe(ended)
  })

  it('exposes a normal enumerable heap through direct reads, spread, JSON, and structuredClone', () => {
    const state = runExecution(createExecution(objectProgram('b <- Cell(2)\na.peer <- b'), []))
    const heap = state.objectHeap
    expect(Object.getPrototypeOf(heap)).toBe(Object.prototype)
    expect(Object.keys(heap)).toEqual(['1', '2'])
    expect(Object.values(heap).map(instance => instance.fields.value)).toEqual([1, 2])
    expect(Object.hasOwn(heap, '1')).toBe(true)
    expect({ ...heap }).toEqual(heap)
    expect(JSON.parse(JSON.stringify(heap))).toEqual(heap)
    expect(structuredClone(heap)).toEqual(heap)
    const cloned = structuredClone(state)
    expect(cloned).toEqual(state)
    expect(cloned.environment.a).toBe(cloned.environment.alias)
    expect(cloned.objectHeap[1].fields.peer).toBe(cloned.environment.b)
    expect(Object.getOwnPropertySymbols(heap)).toHaveLength(0)
  })

  it('resumes plain, cloned, and externally edited/replaced heaps and preserves sparse IDs', () => {
    const before = atChange(objectProgram('b <- Cell(2)\na.value <- a.value + 10', '[a.value, b.value]'))
    const jsonState = JSON.parse(JSON.stringify(before)) as ExecutionState
    expect(runExecution(jsonState).returnValue).toEqual([11, 2])
    const clone = structuredClone(before)
    clone.objectHeap[1].fields.value = 5
    clone.nextObjectId = 1000000000000
    const after = runExecution(clone)
    expect(after.returnValue).toEqual([15, 2])
    expect(Object.keys(after.objectHeap)).toEqual(['1', '1000000000000'])
    expect(after.nextObjectId).toBe(1000000000001)
    expect(before.objectHeap[1].fields.value).toBe(1)
    const replaced = atChange(objectProgram('a.value <- a.value + 3'))
    replaced.objectHeap = { 1: { id: 1, className: 'Cell', fields: { value: 7 } } }
    expect(runExecution(replaced).returnValue).toEqual([10, 10])
    const edited = atChange(objectProgram('a.value <- a.value + 4'))
    edited.objectHeap[1] = { ...edited.objectHeap[1], fields: { value: 8 } }
    edited.objectHeap[42] = { id: 42, className: 'Cell', fields: { value: 42 } }
    const done = runExecution(edited)
    expect(done.returnValue).toEqual([12, 12])
    expect(done.objectHeap[42].fields.value).toBe(42)
  })

  it('preserves insertion order above array-index IDs and does not recycle deleted IDs', () => {
    const state = atChange(objectProgram('b <- Cell(2)\na.value <- 4'))
    const plain = structuredClone(state)
    plain.objectHeap[9000000000000] = { id: 9000000000000, className: 'Cell', fields: {} }
    plain.objectHeap[8000000000000] = { id: 8000000000000, className: 'Cell', fields: {} }
    plain.nextObjectId = 7000000000000
    const done = runExecution(plain)
    expect(Object.keys(done.objectHeap)).toEqual(['1', '9000000000000', '8000000000000', '7000000000000'])
    expect(done.nextObjectId).toBe(7000000000001)
    delete plain.objectHeap[8000000000000]
    expect(runExecution(plain).objectHeap).not.toHaveProperty('8000000000000')
  })

  it('keeps separate executions and branches from an earlier state independent', () => {
    const p = objectProgram('a.value <- a.value + 1')
    const one = atChange(p)
    const two = atChange(p)
    expect(stepExecution(one).objectHeap[1].fields.value).toBe(2)
    expect(two.objectHeap[1].fields.value).toBe(1)
    expect(stepExecution(one).objectHeap[1].fields.value).toBe(2)
    expect(one.objectHeap[1].fields.value).toBe(1)
    const cloned = structuredClone(one)
    cloned.objectHeap[1].fields.value = 100
    expect(stepExecution(cloned).objectHeap[1].fields.value).toBe(101)
    expect(stepExecution(two).objectHeap[1].fields.value).toBe(2)
  })

  it('preserves older roots while growing across leaf, branch, and large-ID boundaries', () => {
    let state = atChange(objectProgram('b <- Cell(2)'))
    const retained = [state]
    const ids = [63, 64, 2047, 2048, 65535, 65536, 2 ** 32 - 1]
    for (const id of ids) {
      state = stepExecution({ ...state, currentNodeId: 'change', nextObjectId: id })
      retained.push(state)
    }
    retained.forEach((snapshot, index) => {
      expect(Object.keys(snapshot.objectHeap)).toEqual(['1', ...ids.slice(0, index).map(String)])
      expect(snapshot.objectHeap[1].fields.value).toBe(1)
      for (const id of ids.slice(0, index)) expect(snapshot.objectHeap[id].fields.value).toBe(2)
    })
    expect(state.nextObjectId).toBe(2 ** 32)
  })

  it('can resume frozen public states and heaps without writing into them', () => {
    const state = atChange(objectProgram('a.value <- 9\nb <- Cell(2)'))
    Object.freeze(state.objectHeap)
    Object.freeze(state.objectHeap[1].fields)
    Object.freeze(state.objectHeap[1])
    Object.freeze(state)
    expect(runExecution(state).returnValue).toEqual([9, 9])
    expect(state.objectHeap[1].fields).toEqual({ value: 1 })
  })

  it('retains all snapshots through Functions, imported Methods, nested collections, cycles, and async resumption', () => {
    let state = createExecution(references, [], { importedPrograms: [cellLibrary], nativeLibraries: ['text', 'image'] })
    const retained: Array<{ original: ExecutionState; copy: ExecutionState }> = []
    while (state.status !== 'halted' && state.status !== 'error') {
      retained.push({ original: state, copy: structuredClone(state) })
      if (state.status === 'asking') state = answerAskExecution(structuredClone(state), '7')
      else if (state.status === 'loading' && state.textRequest) state = completeTextLoadExecution(structuredClone(state), 'text')
      else if (state.status === 'loading') state = completeImageLoadExecution(structuredClone(state), { width: 1, height: 1, pixels: new Uint8ClampedArray([1, 2, 3, 255]) })
      else state = stepExecution(state)
    }
    expect(state.returnValue).toEqual([13, 13, true, true, true, true, true])
    const a = state.environment.a as RuntimeObject
    expect(state.objectHeap[a.id].fields.self).toBe(a)
    expect(state.output[0]).toContain('{...}')
    for (const { original, copy } of retained) expect(structuredClone(original)).toEqual(copy)
  })

  it('keeps unpublished nested debugger callers valid and clonable while stepping over imported Methods', () => {
    let state = createExecution(references, [], { importedPrograms: [cellLibrary], nativeLibraries: ['text', 'image'] })
    const retained: ExecutionState[] = []
    let sawBoundary = false
    for (let guard = 0; guard < 100 && state.status !== 'asking'; guard++) {
      retained.push(state)
      state = stepExecutionChunk(state, { maxSteps: 1, maxMilliseconds: Infinity }).state
      if (state.stepOverCall) {
        sawBoundary = true
        const visible = visibleExecution(state)
        expect(structuredClone(state)).toEqual(state)
        expect(visible.objectHeap).toEqual(state.stepOverCall.caller.objectHeap)
        state = structuredClone(state)
      }
    }
    expect(sawBoundary).toBe(true)
    const copies = retained.map(s => structuredClone(s))
    const done = finish(state)
    expect(done.returnValue).toEqual([13, 13, true, true, true, true, true])
    retained.forEach((s, i) => expect(s).toEqual(copies[i]))
  })

  it('preserves untouched index-progress maps when an RHS Method resumes into rand and ask', () => {
    let state = createExecution(indexedResumption, [], { importedPrograms: [cellLibrary] })
    const retained: Array<{ state: ExecutionState; copy: ExecutionState }> = []
    while (state.status !== 'halted' && state.status !== 'error') {
      retained.push({ state, copy: structuredClone(state) })
      state = state.status === 'asking' ? answerAskExecution(state, '0') : stepExecution(state)
    }
    expect(state.returnValue).toEqual([[2], 2])
    for (const snapshot of retained) expect(snapshot.state).toEqual(snapshot.copy)
  })

  it('preserves breakpoint/Stop snapshots and referenced-object debugger changes', () => {
    const p = objectProgram('a.value <- 9\na.dynamic <- [a]', 'a.value')
    const stopped = runExecutionChunk(createExecution(p, []), { breakpoints: new Set(['change']), maxMilliseconds: Infinity })
    expect(stopped.reason).toBe('breakpoint')
    const saved = structuredClone(stopped.state)
    const done = runExecutionChunk(stopped.state, { skipCurrentBreakpoint: true, maxMilliseconds: Infinity }).state
    expect(done.returnValue).toBe(9)
    expect(stopped.state).toEqual(saved)
    expect(executionVariableChanges(stopped.state, done).map(c => c.name)).toEqual(['a', 'alias'])
  })

  it('preserves retained heaps on loading failures, input waits, and step-limit errors', () => {
    for (const expression of ['ask()', 'text_from_url("https://example.com")', 'imload()']) {
      const p = objectProgram(`a.value <- 9\nvalue <- ${expression}`)
      const blocked = runExecution(createExecution(p, [], { nativeLibraries: ['text', 'image'] }))
      const copy = structuredClone(blocked)
      const next = expression === 'ask()' ? answerAskExecution(blocked, '7')
        : expression.startsWith('text') ? failTextLoadExecution(blocked, 'failed') : failImageLoadExecution(blocked, 'failed')
      expect(blocked).toEqual(copy)
      expect(next.objectHeap[1].fields.value).toBe(9)
    }
    const p = objectProgram('a.value <- 9')
    const before = atChange(p)
    const limited = runExecution({ ...before, maxSteps: before.steps + 1 })
    expect(limited.status).toBe('error')
    expect(limited.objectHeap[1].fields.value).toBe(9)
    expect(before.objectHeap[1].fields.value).toBe(1)
  })

  it('resumes a cloned partial Input queue without altering the waiting object snapshot', () => {
    const p = objectProgram('a.value <- x + y')
    p.nodes.push({ id: 'input', type: 'input', text: 'x\ny', position: { x: 0, y: 0 } })
    p.edges.find(edge => edge.source === 'make')!.target = 'input'
    p.edges.push({ id: 'input-next', source: 'input', target: 'change' })
    const waiting = runExecution(createExecution(p, ['2']))
    const copy = structuredClone(waiting)
    expect(waiting.status).toBe('waiting')
    const resumed = stepExecution(replaceExecutionInputQueue(structuredClone(waiting), ['3']))
    const done = runExecution(resumed)
    expect(done.returnValue).toEqual([5, 5])
    expect(done.steps).toBe(6)
    expect(waiting).toEqual(copy)
    expect(waiting.objectHeap[1].fields.value).toBe(1)
  })

  it('keeps missing-object errors compatible for externally supplied heaps', () => {
    const state = atChange(objectProgram('a.value <- 2'))
    const missing = stepExecution({ ...state, objectHeap: {} })
    expect(missing.status).toBe('error')
    expect(missing.error).toBe('Process node "change", line 1: Object Cell #1 does not exist in the object heap.')
    expect(state.objectHeap[1].fields.value).toBe(1)
  })
})
