import { describe, expect, it, vi } from 'vitest'
import { evaluateExpression, parseExpression, prepareExpression } from './expression'
import { preparedProgram, refreshProgram } from './runtimePreparation'
import {
  answerAskExecution, completeImageLoadExecution, completeTextLoadExecution,
  createExecution, replaceExecutionInputQueue, runExecution, stepExecution,
} from './interpreter'
import { runExecutionChunk, stepExecutionChunk } from './debugger'
import { libraryA, libraryB, program } from '../../scripts/benchmarks/programs'
import { scenarios } from '../../scripts/benchmarks/compatibility'
import type { Program, RuntimeDictionary, RuntimeValue } from './types'

function linear(text: string, result = 'value'): Program {
  return program([
    ['main', 'function', 'main'], ['body', 'process', text], ['end', 'return', result],
  ], [['main', 'body'], ['body', 'end']])
}

function box(body = 'self.value <- self.value + 1', method = 'bump'): Program {
  const p = linear('b <- Box(0)\nalias <- b\nfirst <- b.bump()\nsecond <- b.bump()', '[first, second, alias.value]')
  const definitions = program([
    ['class', 'class', 'Box'], ['fields', 'input', 'value'], ['method', 'method', method],
    ['change', 'process', body], ['result', 'return', 'self.value'],
  ], [['class', 'fields'], ['class', 'method'], ['method', 'change'], ['change', 'result']])
  p.nodes.push(...definitions.nodes)
  p.edges.push(...definitions.edges.map(e => ({ ...e, id: `box-${e.id}` })))
  return p
}

describe('prepared syntax', () => {
  it('reuses syntax while reading a new environment and context on every evaluation', () => {
    const p = linear('value <- x + helper()')
    refreshProgram(p)
    const syntax = preparedProgram(p).expression('x + helper()')
    expect(preparedProgram(p).expression('x + helper()')).toBe(syntax)
    const callFunction = vi.fn().mockReturnValueOnce(2).mockReturnValueOnce(4)
    expect(syntax({ x: 1 }, { callFunction })).toBe(3)
    expect(syntax({ x: 10 }, { callFunction })).toBe(14)
    expect(callFunction).toHaveBeenCalledTimes(2)
  })

  it('allocates independent nested List and Dictionary values and preserves supplied aliases', () => {
    const syntax = prepareExpression('[[x], {"key": [x]}, alias]')
    const alias: RuntimeValue[] = [9]
    const first = syntax({ x: 1, alias }) as RuntimeValue[]
    ;(first[0] as RuntimeValue[])[0] = 99
    ;((first[1] as RuntimeDictionary).entries[0].value as RuntimeValue[])[0] = 98
    const second = syntax({ x: 2, alias }) as RuntimeValue[]
    expect(second).toEqual([[2], { kind: 'dictionary', entries: [{ key: 'key', value: [2] }] }, alias])
    expect(second[0]).not.toBe(first[0])
    expect(second[1]).not.toBe(first[1])
    expect(first[2]).toBe(alias)
    expect(second[2]).toBe(alias)
  })

  it('keeps public parsed trees independent from each other and the internal cache', () => {
    const one = parseExpression('1 + 2')
    const two = parseExpression('1 + 2')
    expect(one).not.toBe(two)
    if (one.kind === 'binary') one.operator = '*'
    expect(prepareExpression('1 + 2')({})).toBe(3)
    expect(evaluateExpression('1 + 2', {})).toBe(3)
  })

  it('preserves evaluation order, short circuiting, calls, member reads, and random sites', () => {
    const prepared = prepareExpression('[False and f(), True or f(), f() + rand(), item.value]')
    const events: string[] = []
    const context = {
      callFunction: () => { events.push('call'); return 2 },
      random: () => { events.push('random'); return 0.25 },
      getMember: () => { events.push('member'); return 8 },
    }
    for (let i = 0; i < 2; i++) {
      expect(prepared({ item: { kind: 'object', id: 1, className: 'Box' } }, context)).toEqual([false, true, 2.25, 8])
    }
    expect(events).toEqual(['call', 'random', 'member', 'call', 'random', 'member'])
  })

  it('bounds syntax caches and reparses evicted syntax without changing results', () => {
    const p = linear('value <- 0')
    const prepared = preparedProgram(p)
    const first = prepared.expression('0')
    for (let i = 1; i <= 1024; i++) prepared.expression(String(i))
    expect(prepared.expression('0')).not.toBe(first)
    expect(prepared.expression('0')({})).toBe(0)
  })
})

describe('runtime revision invalidation', () => {
  it('invalidates expression and statement caches after in-place text edits, including repeated runs', () => {
    const p = linear('value <- 1')
    expect(runExecution(createExecution(p, [])).returnValue).toBe(1)
    const old = preparedProgram(p)
    p.nodes[1].text = 'value <- 2\nvalue <- value + 3'
    expect(runExecution(createExecution(p, [])).returnValue).toBe(5)
    expect(preparedProgram(p)).not.toBe(old)
    const atBody = stepExecution(createExecution(p, []))
    p.nodes[1].text = 'value <- 7'
    expect(runExecution(atBody).returnValue).toBe(7)
  })

  it('invalidates wiring, edge order, node IDs, type, and imports but ignores display-only edits', () => {
    const p = linear('value <- 1')
    refreshProgram(p)
    let old = preparedProgram(p)
    p.nodes[0].position.x = 100
    p.nodes[0].width = 300
    p.nodes[0].comment = 'note'
    refreshProgram(p)
    expect(preparedProgram(p)).toBe(old)
    for (const edit of [
      () => { p.edges[0].target = 'end' },
      () => { p.edges.reverse() },
      () => { p.nodes[1].id = 'changed' },
      () => { p.nodes[1].type = 'output' },
      () => { p.imports = 'new-library.flowlab' },
      () => { p.nodes[0] = { ...p.nodes[0] } },
    ]) {
      edit()
      refreshProgram(p)
      expect(preparedProgram(p)).not.toBe(old)
      old = preparedProgram(p)
    }
  })

  it('follows edited wires and branch labels when a headless execution resumes', () => {
    const p = program([
      ['main', 'function', 'main'], ['test', 'if', 'True'],
      ['yes', 'return', '1'], ['no', 'return', '2'],
    ], [['main', 'test'], ['test', 'yes', 'true'], ['test', 'no', 'false']])
    const paused = stepExecution(createExecution(p, []))
    p.edges[1].label = 'false'
    p.edges[2].label = 'true'
    expect(runExecution(paused).returnValue).toBe(2)
    p.edges[2].target = 'yes'
    expect(runExecution({ ...paused }).returnValue).toBe(1)
  })

  it('preserves first-wire and first-node lookup semantics even on a modified graph', () => {
    const p = linear('value <- 1', '42')
    const initial = createExecution(p, [])
    p.edges.unshift({ id: 'first', source: 'main', target: 'end' })
    expect(stepExecution(initial).currentNodeId).toBe('end')
    p.edges.reverse()
    expect(stepExecution(initial).currentNodeId).toBe('body')
    p.nodes.unshift({ ...p.nodes[2], text: '43' })
    expect(runExecution({ ...initial, currentNodeId: 'end' }).returnValue).toBe(43)
  })

  it('refreshes constructor attributes and Method ownership after edits', () => {
    const p = box()
    expect(runExecution(createExecution(p, [])).returnValue).toEqual([1, 2, 2])
    p.nodes.find(n => n.id === 'fields')!.text = 'renamed'
    p.nodes.find(n => n.id === 'change')!.text = 'self.renamed <- self.renamed + 2'
    p.nodes.find(n => n.id === 'result')!.text = 'self.renamed'
    p.nodes.find(n => n.id === 'end')!.text = '[first, second, alias.renamed]'
    expect(runExecution(createExecution(p, [])).returnValue).toEqual([2, 4, 4])
    p.nodes.push({ id: 'new-owner', type: 'class', text: 'Other(renamed)', position: { x: 0, y: 0 } })
    p.edges.find(e => e.target === 'method')!.source = 'new-owner'
    const result = runExecution(createExecution(p, []))
    expect(result.error).toContain('Method "Box.bump" does not exist.')
  })

  it('does not attach caches to project JSON or execution state', () => {
    const p = box()
    const original = JSON.stringify(p)
    const initial = createExecution(p, [])
    const keys = Object.keys(initial).sort()
    const result = runExecution(initial)
    expect(result.returnValue).toEqual([1, 2, 2])
    expect(JSON.stringify(p)).toBe(original)
    expect(Object.keys(initial).sort()).toEqual(keys)
    expect(Object.getOwnPropertySymbols(p)).toHaveLength(0)
  })

  it('runs unchanged version 1 JSON with legacy Assignment and inline constructor fields', () => {
    const p = box()
    p.nodes = p.nodes.filter(n => n.id !== 'fields').map(n => ({
      ...n, type: n.type === 'process' && n.id === 'change' ? 'assignment' : n.type,
      text: n.id === 'class' ? 'Box(value)' : n.text,
    }))
    p.edges = p.edges.filter(e => e.target !== 'fields')
    const json = JSON.stringify(p)
    const loaded = JSON.parse(json) as Program
    for (let run = 0; run < 2; run++) {
      const result = runExecution(createExecution(loaded, []))
      expect(result.returnValue).toEqual([1, 2, 2])
      expect(JSON.stringify(loaded)).toBe(json)
    }
  })
})

describe('runtime lookup scope', () => {
  it('isolates overlapping IDs in libraries and lets local functions override imports', () => {
    const root = linear('value <- helperB(4)')
    const local = program([
      ['local', 'function', 'helperA'], ['local-input', 'input', 'x'], ['local-result', 'return', 'x + 10'],
    ], [['local', 'local-input'], ['local-input', 'local-result']])
    root.nodes.push(...local.nodes)
    root.edges.push(...local.edges.map(e => ({ ...e, id: `local-${e.id}` })))
    const a = structuredClone(libraryA)
    const b = structuredClone(libraryB)
    expect(runExecution(createExecution(root, [], { importedPrograms: [a, b] })).returnValue).toBe(28)
    root.nodes.find(n => n.id === 'local')!.text = 'unused'
    expect(runExecution(createExecution(root, [], { importedPrograms: [a, b] })).returnValue).toBe(10)
    b.nodes.find(n => n.id === 'end')!.text = 'helperA(x) * 3'
    expect(runExecution(createExecution(root, [], { importedPrograms: [a, b] })).returnValue).toBe(15)
  })

  it('uses the first imported Class and its Methods even when a later library adds Methods', () => {
    const first = box()
    const second = box('self.value <- self.value + 100')
    const root = linear('b <- Box(1)\nvalue <- b.bump()')
    expect(runExecution(createExecution(root, [], { importedPrograms: [first, second] })).returnValue).toBe(2)
    expect(runExecution(createExecution(root, [], { importedPrograms: [second, first] })).returnValue).toBe(101)
    // A local Class blocks the entire imported Class, including its Methods.
    root.nodes.push({ id: 'local-box', type: 'class', text: 'Box(value)', position: { x: 0, y: 0 } })
    expect(runExecution(createExecution(root, [], { importedPrograms: [first] })).error).toContain('Method "Box.bump" does not exist.')
  })

  it('keeps indexes separate for concurrent executions of the same root with different imports', () => {
    const root = linear('value <- helperA(4)')
    const other = structuredClone(libraryA)
    other.nodes[2].text = 'x + 100'
    const one = stepExecution(createExecution(root, [], { importedPrograms: [libraryA] }))
    const two = stepExecution(createExecution(root, [], { importedPrograms: [other] }))
    expect(runExecution(two).returnValue).toBe(104)
    expect(runExecution(one).returnValue).toBe(5)
  })

  it('scopes imported Class attributes and Methods to programs with overlapping IDs', () => {
    const first = box()
    const second = box('self.amount <- self.amount + 100')
    second.nodes.find(n => n.id === 'class')!.text = 'Other'
    second.nodes.find(n => n.id === 'fields')!.text = 'amount'
    second.nodes.find(n => n.id === 'result')!.text = 'self.amount'
    const root = linear('a <- Box(1)\nb <- Other(2)\nvalue <- [a.bump(), b.bump(), a.value, b.amount]')
    const state = runExecution(createExecution(root, [], { importedPrograms: [first, second] }))
    expect(state.returnValue).toEqual([2, 102, 2, 102])
  })
})

describe('cached execution progress and debugger boundaries', () => {
  it('repeats overloaded arithmetic, equality fallback, unary operators, and repr effects on every run', () => {
    const p = scenarios.find(s => s.name === 'operators')!.program
    for (let run = 0; run < 2; run++) {
      const state = runExecution(createExecution(p, []))
      expect(state.status).toBe('halted')
      expect(state.returnValue).toEqual([7, 1, 2])
      expect(state.output).toEqual(['value=2', 'value=3', '[8, True, -2, 8, True, -2, 8, True, -2]'])
      expect(state.nextObjectId).toBe(9)
    }
  })

  it('keeps repeated for-loop syntax separate from each iterable and bound input value', () => {
    const p = program([
      ['main', 'function', 'main'], ['init', 'process', 'value <- []'],
      ['loop', 'for', 'x in [1, 2, 3]'], ['body', 'process', 'value <- value + [double(x)]'],
      ['end', 'return', 'value'], ['double', 'function', 'double'], ['input', 'input', 'n'], ['result', 'return', 'n * 2'],
    ], [['main', 'init'], ['init', 'loop'], ['loop', 'body', 'true'], ['body', 'loop'], ['loop', 'end', 'false'],
      ['double', 'input'], ['input', 'result']])
    expect(runExecution(createExecution(p, [])).returnValue).toEqual([2, 4, 6])
    p.nodes.find(n => n.id === 'loop')!.text = 'x in [4, 5]'
    p.nodes.find(n => n.id === 'input')!.text = 'renamed'
    p.nodes.find(n => n.id === 'result')!.text = 'renamed * 3'
    expect(runExecution(createExecution(p, [])).returnValue).toEqual([12, 15])
  })

  it('keeps calls, operators, member reads, and random progress separate across loop evaluations', () => {
    const p = box()
    p.nodes.find(n => n.id === 'body')!.text = 'b <- Box(0)\nalias <- b\nfirst <- b.value + b.bump() + rand()\nsecond <- b.value + b.bump() + rand()'
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.5)
    try {
      expect(runExecution(createExecution(p, [])).returnValue).toEqual([1.25, 3.5, 2])
      expect(random).toHaveBeenCalledTimes(2)
    } finally { random.mockRestore() }
  })

  it('does not repeat completed effects across ask, text loading, image loading, or queue waits', () => {
    const p = box()
    p.nodes.find(n => n.id === 'body')!.text = 'b <- Box(0)\nalias <- b\nfirst <- [b.bump(), rand(), ask(), text_from_url("https://example.com"), imload()]\nsecond <- b.bump()'
    p.nodes.find(n => n.id === 'end')!.text = '[first, second, alias.value]'
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25)
    try {
      let state = runExecution(createExecution(p, [], { nativeLibraries: ['text', 'image'] }))
      expect(state.status).toBe('asking')
      // A revision change must not discard progress in the suspended expression.
      p.nodes.find(n => n.id === 'end')!.text = '[first, second, alias.value, 9]'
      state = runExecution(answerAskExecution(state, '7'))
      expect(state.status).toBe('loading')
      state = runExecution(completeTextLoadExecution(state, 'loaded'))
      expect(state.status).toBe('loading')
      state = runExecution(completeImageLoadExecution(state, { width: 1, height: 1, pixels: new Uint8ClampedArray([1, 2, 3, 255]) }))
      expect(state.returnValue).toEqual([[1, 0.25, 7, 'loaded', { kind: 'image', id: 1, width: 1, height: 1 }], 2, 2, 9])
      expect(random).toHaveBeenCalledTimes(1)
    } finally { random.mockRestore() }

    const inputs = program([
      ['main', 'function', 'main'], ['input', 'input', 'a\nb'], ['end', 'return', '[a, b]'],
    ], [['main', 'input'], ['input', 'end']])
    const waiting = runExecution(createExecution(inputs, ['4']))
    expect(waiting.environment).toEqual({ a: 4 })
    const supplied = replaceExecutionInputQueue(waiting, ['5'])
    const done = runExecution({ ...supplied, status: 'running' })
    expect(done.returnValue).toEqual([4, 5])
    expect(done.steps).toBe(4)
  })

  it('retains source line errors for cached Process and Output syntax', () => {
    const p = linear('value <- 0\n\nvalue <- 1 / 0')
    for (let run = 0; run < 2; run++) {
      expect(runExecution(createExecution(p, [])).error).toBe('Process node "body", line 3: Division by zero')
    }
    p.nodes[1].type = 'output'
    p.nodes[1].text = '1\n\n1 / 0'
    for (let run = 0; run < 2; run++) {
      expect(runExecution(createExecution(p, [])).error).toBe('Output node "body", line 3: Division by zero')
    }
  })

  it('preserves breakpoint pauses, step feedback, execution limits and a stopped state', () => {
    const p = linear('value <- ask() + 1')
    let result = runExecutionChunk(createExecution(p, []), { breakpoints: new Set(['body']), maxMilliseconds: Infinity })
    expect(result.reason).toBe('breakpoint')
    expect(result.state.steps).toBe(1)
    const stopped = result.state
    expect(stopped.currentNodeId).toBe('body')
    result = stepExecutionChunk(stopped, { maxMilliseconds: Infinity })
    expect(result.state.status).toBe('asking')
    const answered = answerAskExecution(result.state, '4')
    expect(answered.lastStep?.changedVariables).toEqual([{ name: 'value', before: undefined, after: 5 }])
    expect(answered.steps).toBe(2)
    expect(runExecution(answered).steps).toBe(3)
    expect(runExecution(createExecution(p, [], { maxSteps: 1 })).error).toBe('Maximum step count of 1 was reached.')
  })
})
