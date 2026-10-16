import { describe, expect, it } from 'vitest'
import { classAttributeNames, classInitializationInputs } from './classInitialization'
import { createExecution, runExecution } from './interpreter'
import { parseProgramDraft } from './drafts'
import { layoutProgram, estimateProgramNodeDimensions } from './flowLayout'
import { CLASS_INIT_HANDLE, sourceHandleForProgramEdge } from './flowRouting'
import { validateProgram } from './validation'
import type { Program, ProgramNode } from './types'

function node(id: string, type: ProgramNode['type'], text: string): ProgramNode {
  return { id, type, text, position: { x: 0, y: 0 } }
}

const point: Program = {
  version: 1,
  nodes: [
    node('point', 'class', 'point'), node('init', 'input', 'x\ny'),
    node('set', 'method', 'set'), node('set-body', 'process', 'self.total <- self.x + self.y'), node('set-end', 'return', 'self'),
    node('main', 'function', 'main'),
    node('make', 'process', 'p <- point(2, 3)\nq <- point(4, 5)\np.set()'),
    node('end', 'return', 'p'),
  ],
  edges: [
    { id: 'init', source: 'point', target: 'init' }, { id: 'set', source: 'point', target: 'set' },
    { id: 'set-body', source: 'set', target: 'set-body' }, { id: 'set-end', source: 'set-body', target: 'set-end' },
    { id: 'start', source: 'main', target: 'make' }, { id: 'end', source: 'make', target: 'end' },
  ],
}

describe('Class init connections', () => {
  it('initializes instance attributes through a multiline Input with no Return', () => {
    expect(validateProgram(point).errors).toEqual([])
    expect(classAttributeNames(point, point.nodes[0])).toEqual(['x', 'y'])
    expect(sourceHandleForProgramEdge(point, point.edges[0])).toBe(CLASS_INIT_HANDLE)
    const state = runExecution(createExecution(point, []))
    expect(state.status).toBe('halted')
    expect(state.objectHeap[1].fields).toEqual({ x: 2, y: 3, total: 5 })
    expect(state.objectHeap[2].fields).toEqual({ x: 4, y: 5 })
  })

  it('reads chained Inputs in wire order, including blank lines and whitespace', () => {
    const program: Program = {
      ...point,
      nodes: [...point.nodes.map((entry) => entry.id === 'init' ? { ...entry, text: ' x\n\n' } : entry), node('init-y', 'input', ' y ')],
      edges: [...point.edges, { id: 'next-input', source: 'init', target: 'init-y' }],
    }
    expect(validateProgram(program).errors).toEqual([])
    expect(classInitializationInputs(program, program.nodes[0]).map((entry) => entry.id)).toEqual(['init', 'init-y'])
    const state = runExecution(createExecution(program, []))
    expect(state.status).toBe('halted')
    expect(state.objectHeap[1].fields).toEqual({ x: 2, y: 3, total: 5 })
  })

  it('allows disconnected init and creates attributes on self without sharing them between instances', () => {
    const program: Program = {
      ...point,
      nodes: point.nodes.filter((entry) => entry.id !== 'init').map((entry) =>
        entry.id === 'make' ? { ...entry, text: 'p <- point()\nq <- point()\np.set()' }
          : entry.id === 'set-body' ? { ...entry, text: 'self.x <- 10\nself.y <- 20\nself.x <- self.x + 1' } : entry,
      ),
      edges: point.edges.filter((edge) => edge.id !== 'init'),
    }
    expect(validateProgram(program).errors).toEqual([])
    const state = runExecution(createExecution(program, []))
    expect(state.status).toBe('halted')
    expect(state.objectHeap[1].fields).toEqual({ x: 11, y: 20 })
    expect(state.objectHeap[2].fields).toEqual({})
    expect(classAttributeNames(program, program.nodes[0])).toEqual([])

    const incorrectAlias = {
      ...program,
      nodes: program.nodes.map((entry) => entry.id === 'set-body' ? { ...entry, text: 'point.x <- 1' } : entry),
    }
    expect(runExecution(createExecution(incorrectAlias, [])).error).toMatch(/Undefined variable "point"/)
  })

  it.each(['point(2)', 'point(2, 3, 4)'])('checks constructor argument count for %s', (call) => {
    const program: Program = { ...point, nodes: point.nodes.map((entry) => entry.id === 'make' ? { ...entry, text: `p <- ${call}` } : entry) }
    expect(runExecution(createExecution(program, [])).error).toMatch(/expects exactly 2 constructor arguments/)
  })

  it('uses the same initializer and dynamic attributes for imported Classes', () => {
    const root: Program = {
      version: 1,
      nodes: [node('root', 'function', 'main'), node('new', 'process', 'p <- point(6, 7)\np.set()'), node('return', 'return', 'p.total')],
      edges: [{ id: 'start', source: 'root', target: 'new' }, { id: 'end', source: 'new', target: 'return' }],
    }
    const result = runExecution(createExecution(root, [], { importedPrograms: [point] }))
    expect(result.status).toBe('halted')
    expect(result.returnValue).toBe(13)
  })

  it.each([
    { text: 'x\nx', error: /duplicate field "x"/ },
    { text: 'x\nself', error: /reserved/ },
    { text: 'x\nnot a name', error: /line 2.*variable name/i },
  ])('rejects invalid initializer attributes: $text', ({ text, error }) => {
    const program: Program = { ...point, nodes: point.nodes.map((entry) => entry.id === 'init' ? { ...entry, text } : entry) }
    expect(validateProgram(program).errors.join('\n')).toMatch(error)
  })

  it('rejects shared, branching, cyclic, and multiple init roots', () => {
    const cases: Program[] = [
      { ...point, edges: [...point.edges, { id: 'shared', source: 'main', target: 'init' }] },
      { ...point, edges: [...point.edges, { id: 'cycle', source: 'init', target: 'init' }] },
      { ...point, nodes: [...point.nodes, node('other', 'input', 'z')], edges: [...point.edges, { id: 'other', source: 'point', target: 'other' }] },
      { ...point, edges: [...point.edges, { id: 'invalid', source: 'init', target: 'end' }] },
    ]
    for (const program of cases) expect(validateProgram(program).valid).toBe(false)
  })

  it('preserves init Inputs, attributes, and methods when saving and reopening', () => {
    const reopened = parseProgramDraft(JSON.parse(JSON.stringify(point)))
    expect(reopened).toEqual(point)
    expect(runExecution(createExecution(reopened, [])).objectHeap[1].fields).toEqual({ x: 2, y: 3, total: 5 })
  })

  it('keeps init Inputs beside their Class and away from Methods during cleanup', () => {
    const laidOut = layoutProgram(point).program
    const classNode = laidOut.nodes.find((entry) => entry.id === 'point')!
    const init = laidOut.nodes.find((entry) => entry.id === 'init')!
    expect(init.position.y).toBeGreaterThan(classNode.position.y)
    for (const [index, entry] of laidOut.nodes.entries()) {
      const size = estimateProgramNodeDimensions(laidOut, entry)
      for (const other of laidOut.nodes.slice(index + 1)) {
        const otherSize = estimateProgramNodeDimensions(laidOut, other)
        const overlaps = entry.position.x < other.position.x + otherSize.width && entry.position.x + size.width > other.position.x && entry.position.y < other.position.y + otherSize.height && entry.position.y + size.height > other.position.y
        expect(overlaps, `${entry.id} overlaps ${other.id}`).toBe(false)
      }
    }
    expect(runExecution(createExecution(laidOut, [])).objectHeap[1].fields).toEqual({ x: 2, y: 3, total: 5 })
  })
})
