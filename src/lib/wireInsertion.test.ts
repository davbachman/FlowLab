import { describe, expect, it } from 'vitest'
import { edgeTypeForProgramEdge } from './flowRouting'
import { estimateProgramNodeDimensions } from './flowLayout'
import { createExecution, runExecution } from './interpreter'
import type { Program, ProgramNode } from './types'
import { canInsertOnEdge, connectNewNode, findFreeNodePosition, insertNodeOnEdge } from './wireInsertion'

const program: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    { id: 'init', type: 'process', text: 'n <- 0', position: { x: 0, y: 100 } },
    { id: 'loop', type: 'while', text: 'n < 2', position: { x: 0, y: 200 } },
    { id: 'add', type: 'process', text: 'n <- n + 1', position: { x: -250, y: 350 } },
    { id: 'show', type: 'output', text: 'n', position: { x: 0, y: 400 } },
    { id: 'end', type: 'return', text: 'n', position: { x: 0, y: 500 } },
  ],
  edges: [
    { id: 'start', source: 'main', target: 'init' },
    { id: 'enter-loop', source: 'init', target: 'loop' },
    { id: 'true', source: 'loop', target: 'add', label: 'true' },
    { id: 'back', source: 'add', target: 'loop' },
    { id: 'false', source: 'loop', target: 'show', label: 'false' },
    { id: 'finish', source: 'show', target: 'end' },
  ],
}

const newNode: ProgramNode = {
  id: 'inserted',
  type: 'output',
  text: 'n',
  position: { x: -150, y: 280 },
}

describe('wire insertion', () => {
  it('finds nearby space without overlapping existing blocks or changing their positions', () => {
    const updated = insertNodeOnEdge(program, 'true', newNode)!
    const inserted = updated.nodes.find((node) => node.id === newNode.id)!
    const insertedSize = estimateProgramNodeDimensions(updated, inserted)
    expect(inserted.position).not.toEqual(newNode.position)
    expect(updated.nodes.filter((node) => node.id !== newNode.id)).toEqual(program.nodes)
    for (const node of program.nodes) {
      const size = estimateProgramNodeDimensions(updated, node)
      const separated =
        inserted.position.x + insertedSize.width <= node.position.x ||
        node.position.x + size.width <= inserted.position.x ||
        inserted.position.y + insertedSize.height <= node.position.y ||
        node.position.y + size.height <= inserted.position.y
      expect(separated, `Inserted block overlaps ${node.id}`).toBe(true)
    }
  })

  it('keeps a requested insertion position when space is already available', () => {
    const desired = { ...newNode, position: { x: -900, y: 900 } }
    expect(findFreeNodePosition(program, desired)).toEqual(desired.position)
  })

  it('preserves both branches and runs the inserted block along the chosen branch', () => {
    const snapshot = JSON.stringify(program)
    const updated = insertNodeOnEdge(program, 'true', newNode)!
    expect(updated.edges.find((edge) => edge.id === 'true')).toEqual({
      id: 'true', source: 'loop', target: 'inserted', label: 'true',
    })
    expect(updated.edges.find((edge) => edge.source === 'inserted')).toEqual({
      id: 'edge-inserted-add', source: 'inserted', target: 'add',
    })
    expect(updated.edges.find((edge) => edge.id === 'false')).toEqual(program.edges[4])
    expect(runExecution(createExecution(updated, [])).output).toEqual(['0', '1', '2'])
    expect(JSON.stringify(program)).toBe(snapshot)
  })

  it('preserves a loop back and reroutes the new continuation as a loop-back edge', () => {
    const updated = insertNodeOnEdge(program, 'back', newNode)!
    const continuation = updated.edges.find((edge) => edge.source === 'inserted')!
    expect(edgeTypeForProgramEdge(updated, continuation)).toBe('loopback')
    const result = runExecution(createExecution(updated, []))
    expect(result.status).toBe('halted')
    expect(result.output).toEqual(['1', '2', '2'])
  })

  it.each(['function', 'class', 'method', 'return', 'if', 'while', 'for'] as const)(
    'does not splice a %s block into an existing continuation',
    (type) => {
      expect(insertNodeOnEdge(program, 'finish', { ...newNode, type })).toBeNull()
    },
  )

  it('rejects stale edges and duplicate node IDs', () => {
    expect(insertNodeOnEdge(program, 'missing', newNode)).toBeNull()
    expect(insertNodeOnEdge(program, 'finish', { ...newNode, id: 'main' })).toBeNull()
  })

  it('excludes class and method attachment wires while allowing method body wires', () => {
    const classProgram: Program = {
      version: 1,
      nodes: [
        { id: 'class', type: 'class', text: 'Counter()', position: { x: 0, y: 0 } },
        { id: 'method', type: 'method', text: 'count', position: { x: 0, y: 100 } },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 200 } },
      ],
      edges: [
        { id: 'attachment', source: 'class', target: 'method' },
        { id: 'body', source: 'method', target: 'end' },
      ],
    }
    expect(canInsertOnEdge(classProgram, 'attachment')).toBe(false)
    expect(insertNodeOnEdge(classProgram, 'attachment', newNode)).toBeNull()
    expect(canInsertOnEdge(classProgram, 'body')).toBe(true)
  })

  it('chooses a unique continuation ID without changing existing IDs', () => {
    const collision = {
      ...program,
      edges: [...program.edges, { id: 'edge-inserted-end', source: 'init', target: 'end' }],
    }
    const updated = insertNodeOnEdge(collision, 'finish', newNode)!
    expect(updated.edges.find((edge) => edge.source === 'inserted')?.id).toBe('edge-inserted-end-2')
    expect(new Set(updated.edges.map((edge) => edge.id)).size).toBe(updated.edges.length)
  })
})

describe('connected quick add', () => {
  it('replaces only the dragged branch and accepts a terminating Return', () => {
    const updated = connectNewNode(program, 'loop', { ...newNode, type: 'return' }, 'false')!
    expect(updated.edges).toContainEqual(program.edges[2])
    expect(updated.edges).not.toContainEqual(program.edges[4])
    expect(updated.edges.at(-1)).toMatchObject({ source: 'loop', target: 'inserted', label: 'false' })
  })

  it('replaces the single ordinary output and preserves every unrelated wire', () => {
    const updated = connectNewNode(program, 'main', newNode)!
    expect(updated.edges).not.toContainEqual(program.edges[0])
    expect(updated.edges.slice(0, -1)).toEqual(program.edges.slice(1))
    expect(updated.edges.at(-1)).toMatchObject({ source: 'main', target: 'inserted' })
  })

  it('rejects missing sources, missing branch choices, and definition blocks', () => {
    expect(connectNewNode(program, 'missing', newNode)).toBeNull()
    expect(connectNewNode(program, 'loop', newNode)).toBeNull()
    expect(connectNewNode(program, 'end', newNode)).toBeNull()
    expect(connectNewNode(program, 'main', { ...newNode, type: 'method' })).toBeNull()
  })
})
