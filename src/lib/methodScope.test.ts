import { describe, expect, it } from 'vitest'
import { createExecution, runExecution, stepExecution } from './interpreter'
import type { Program } from './types'

function scopeProgram(body: string, result = 'self.x'): Program {
  return {
    version: 1,
    nodes: [
      { id: 'box', type: 'class', text: 'Box', position: { x: 400, y: 0 } },
      { id: 'init', type: 'input', text: 'x\nitems\ncounts\nchild', position: { x: 700, y: 100 } },
      { id: 'child', type: 'class', text: 'Child', position: { x: 1000, y: 0 } },
      { id: 'method', type: 'method', text: 'change', position: { x: 400, y: 100 } },
      { id: 'body', type: 'process', text: body, position: { x: 400, y: 200 } },
      { id: 'result', type: 'return', text: result, position: { x: 400, y: 300 } },
      { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
      {
        id: 'run', type: 'process',
        text: 'child <- Child()\nchild.value <- 7\nitem <- Box(10, [1, 2], {"key": 3}, child)\nresult <- item.change()',
        position: { x: 0, y: 100 },
      },
      { id: 'end', type: 'return', text: 'result', position: { x: 0, y: 200 } },
    ],
    edges: [
      { id: 'init', source: 'box', target: 'init' },
      { id: 'owner', source: 'box', target: 'method' },
      { id: 'body', source: 'method', target: 'body' },
      { id: 'result', source: 'body', target: 'result' },
      { id: 'run', source: 'main', target: 'run' },
      { id: 'end', source: 'run', target: 'end' },
    ],
  }
}

describe('explicit instance attributes in Methods', () => {
  it.each(['Run', 'Step'])('keeps bare assignments local and self assignments on the instance with %s', mode => {
    const program = scopeProgram(
      'x <- 99\nx <- x + 1\nself.y <- 5\ny <- 8\nself.x <- self.x + 1',
      '[x, self.x, y, self.y]',
    )
    let state = createExecution(program, [])
    if (mode === 'Run') state = runExecution(state)
    else for (let step = 0; step < 30 && state.status !== 'halted'; step += 1) state = stepExecution(state)
    expect(state.error).toBeUndefined()
    expect(state.status).toBe('halted')
    expect(state.returnValue).toEqual([100, 11, 8, 5])
    expect(state.objectHeap[2].fields).toMatchObject({ x: 11, y: 5 })
    expect(state.environment).not.toHaveProperty('x')
  })

  it.each([
    ['x', 'x'], ['items[0]', 'items'], ['counts["key"]', 'counts'], ['child.value', 'child'],
  ])('rejects an implicit attribute read in %s and suggests self', (expression, name) => {
    const state = runExecution(createExecution(scopeProgram('local <- 0', expression), []))
    expect(state.status).toBe('error')
    expect(state.error).toContain(`Undefined variable "${name}". Use "self.${name}"`)
  })

  it.each([
    ['items[0] <- 9', 'items'], ['counts["key"] <- 9', 'counts'], ['child.value <- 9', 'child'],
  ])('rejects an implicit attribute assignment target in %s', (statement, name) => {
    const state = runExecution(createExecution(scopeProgram(statement), []))
    expect(state.status).toBe('error')
    expect(state.error).toContain(`Undefined variable "${name}". Use "self.${name}"`)
    expect(state.objectHeap[1].fields.value).toBe(7)
    expect(state.objectHeap[2].fields.items).toEqual([1, 2])
    expect(state.objectHeap[2].fields.counts).toEqual({ kind: 'dictionary', entries: [{ key: 'key', value: 3 }] })
  })

  it('keeps an argument with the same name as an attribute local', () => {
    const program = scopeProgram('x <- x + 1\nself.y <- x', '[x, self.x, self.y]')
    program.nodes.push({ id: 'argument', type: 'input', text: 'x', position: { x: 400, y: 150 } })
    program.nodes = program.nodes.map(node => node.id === 'run' ? { ...node, text: node.text.replace('item.change()', 'item.change(42)') } : node)
    program.edges = program.edges.map(edge => edge.id === 'body' ? { ...edge, target: 'argument' } : edge)
    program.edges.push({ id: 'argument', source: 'argument', target: 'body' })
    const state = runExecution(createExecution(program, []))
    expect(state.status).toBe('halted')
    expect(state.returnValue).toEqual([43, 10, 43])
  })

  it('keeps loop variables local even when an attribute has the same name', () => {
    const program = scopeProgram('self.last <- x', '[x, self.x, self.last]')
    program.nodes.push({ id: 'loop', type: 'for', text: 'x in [1, 2]', position: { x: 400, y: 150 } })
    program.edges = program.edges.map(edge => edge.id === 'body' ? { ...edge, target: 'loop' }
      : edge.id === 'result' ? { ...edge, target: 'loop' } : edge)
    program.edges.push(
      { id: 'true', source: 'loop', target: 'body', label: 'true' },
      { id: 'false', source: 'loop', target: 'result', label: 'false' },
    )
    const state = runExecution(createExecution(program, []))
    expect(state.status).toBe('halted')
    expect(state.returnValue).toEqual([2, 10, 2])
  })

  it.each([false, true])('writes collection changes to attributes only with explicit reassignment: %s', writeBack => {
    const body = 'items <- self.items\nitems[0] <- 9\ncounts <- self.counts\ncounts["key"] <- 4'
      + (writeBack ? '\nself.items <- items\nself.counts <- counts' : '')
    const state = runExecution(createExecution(scopeProgram(body, '[items[0], self.items[0], counts["key"], self.counts["key"]]'), []))
    expect(state.status).toBe('halted')
    expect(state.returnValue).toEqual([9, writeBack ? 9 : 1, 4, writeBack ? 4 : 3])
  })

  it.each(['x', 'self.x'])('uses the same explicit attribute rules in imported Methods: %s', expression => {
    const library = scopeProgram('local <- 0', expression)
    const root: Program = {
      version: 1,
      nodes: library.nodes.filter(node => ['main', 'run', 'end'].includes(node.id)),
      edges: library.edges.filter(edge => ['run', 'end'].includes(edge.id)),
    }
    const state = runExecution(createExecution(root, [], { importedPrograms: [library] }))
    if (expression === 'x') {
      expect(state.status).toBe('error')
      expect(state.error).toContain('Use "self.x"')
    } else {
      expect(state.status).toBe('halted')
      expect(state.returnValue).toBe(10)
    }
  })
})
