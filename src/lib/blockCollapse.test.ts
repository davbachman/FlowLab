import { describe, expect, it } from 'vitest'
import { collapsedBlockBodies, collapsedBlockNodeIds, collapsedInitBodies } from './blockCollapse'
import { objectSampleProgram } from './objectSampleProgram'
import type { Program } from './types'

describe('collapsed block bodies', () => {
  it('hides both branches and loops without crossing another declaration', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'loop', type: 'while', text: 'true', position: { x: 0, y: 100 } },
        { id: 'body', type: 'process', text: 'x <- 1', position: { x: 100, y: 200 } },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 300 } },
        { id: 'helper', type: 'function', text: 'helper', position: { x: 400, y: 0 } },
        { id: 'helper-end', type: 'return', text: '1', position: { x: 400, y: 100 } },
      ],
      edges: [
        { id: 'start', source: 'main', target: 'loop' },
        { id: 'true', source: 'loop', target: 'body', label: 'true' },
        { id: 'false', source: 'loop', target: 'end', label: 'false' },
        { id: 'back', source: 'body', target: 'loop' },
        { id: 'helper-start', source: 'helper', target: 'helper-end' },
        // Even an invalid connection during editing must keep other roots visible.
        { id: 'invalid', source: 'body', target: 'helper' },
      ],
    }
    expect(collapsedBlockBodies(program, new Set(['main'])))
      .toEqual(new Map([['main', new Set(['loop', 'body', 'end'])]]))
    expect(collapsedBlockBodies(program, new Set(['helper'])))
      .toEqual(new Map([['helper', new Set(['helper-end'])]]))
    expect(collapsedBlockBodies(program, new Set(['missing', 'loop']))).toEqual(new Map())
    expect(collapsedBlockBodies(program, new Set())).toEqual(new Map())
  })

  it('ignores Class collapse flags and hides only collapsed Methods and their flows', () => {
    const program: Program = {
      ...objectSampleProgram,
      nodes: objectSampleProgram.nodes.map(node => ['point-class', 'point-move'].includes(node.id)
        ? { ...node, collapsed: true } : node),
    }
    const before = structuredClone(program)
    const bodies = collapsedBlockBodies(program)
    expect(bodies.has('point-class')).toBe(false)
    expect(bodies.get('point-move')).toEqual(new Set(['move-dx', 'move-dy', 'move-x', 'move-return']))
    expect(program).toEqual(before)
    expect(collapsedBlockNodeIds(program, bodies)).toEqual(new Set(['point-move', 'move-dx', 'move-dy', 'move-x', 'move-return']))

    const expanded = { ...program, nodes: program.nodes.map(node => node.id === 'point-class' ? { ...node, collapsed: false } : node) }
    expect(collapsedBlockBodies(expanded)).toEqual(new Map([
      ['point-move', new Set(['move-dx', 'move-dy', 'move-x', 'move-return'])],
    ]))
  })

  it('keeps other declarations visible even when unfinished wires point at them', () => {
    const program: Program = {
      ...objectSampleProgram,
      nodes: [
        ...objectSampleProgram.nodes,
        { id: 'other-class', type: 'class', text: 'Other', collapsed: true, position: { x: 1000, y: 0 } },
        { id: 'other-method', type: 'method', text: 'other', position: { x: 1000, y: 200 } },
      ],
      edges: [
        ...objectSampleProgram.edges,
        { id: 'other-attachment', source: 'other-class', target: 'other-method' },
        { id: 'invalid-method', source: 'move-x', target: 'other-method' },
        { id: 'invalid-class', source: 'move-x', target: 'other-class' },
        { id: 'invalid-function', source: 'move-x', target: 'object-main' },
        { id: 'invalid-loop', source: 'move-x', target: 'point-class' },
      ],
    }
    const body = collapsedBlockBodies(program, new Set(['point-move'])).get('point-move')!
    for (const id of ['point-class', 'object-main', 'other-class', 'other-method']) expect(body.has(id)).toBe(false)
    expect(body.has('move-return')).toBe(true)
    expect(collapsedBlockBodies(program, new Set(['point-move'])).get('point-move'))
      .toEqual(new Set(['move-dx', 'move-dy', 'move-x', 'move-return']))
  })

  it('keeps unattached collapsed Methods visible, including after removing their Class or wire', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'class', type: 'class', text: 'Empty', collapsed: true, position: { x: 0, y: 0 } },
        { id: 'method', type: 'method', text: 'unfinished', collapsed: true, position: { x: 300, y: 0 } },
      ],
      edges: [],
    }
    expect(collapsedBlockBodies(program)).toEqual(new Map())
    const attached = { ...program, edges: [{ id: 'owner', source: 'class', target: 'method' }] }
    expect(collapsedBlockBodies(attached)).toEqual(new Map([['method', new Set()]]))
    expect(collapsedBlockNodeIds(attached)).toEqual(new Set(['method']))
    expect(collapsedBlockNodeIds(program)).toEqual(new Set())
    expect(collapsedBlockNodeIds({ ...attached, nodes: attached.nodes.filter(node => node.id !== 'class') })).toEqual(new Set())
  })

  it('hides an entire init Input chain independently of Methods, stopping at invalid executable links', () => {
    const program: Program = {
      ...objectSampleProgram,
      nodes: [
        ...objectSampleProgram.nodes.map(node => node.id === 'point-class' ? { ...node, initCollapsed: true } : node),
        { id: 'init-y', type: 'input', text: 'y', position: { x: 0, y: 200 } },
      ],
      edges: [
        ...objectSampleProgram.edges,
        { id: 'init-chain', source: 'point-init', target: 'init-y' },
        { id: 'init-cycle', source: 'init-y', target: 'point-init' },
        { id: 'unfinished', source: 'init-y', target: 'move-x' },
      ],
    }
    expect(collapsedInitBodies(program)).toEqual(new Map([['point-class', new Set(['point-init', 'init-y'])]]))
    expect(collapsedBlockNodeIds(program)).toEqual(new Set(['point-init', 'init-y']))
    expect(collapsedBlockBodies(program)).toEqual(new Map())
    const withoutClass = { ...program, nodes: program.nodes.filter(node => node.id !== 'point-class') }
    expect(collapsedBlockNodeIds(withoutClass)).toEqual(new Set())
    const disconnected = { ...program, edges: program.edges.filter(edge => edge.source !== 'point-class') }
    expect(collapsedBlockNodeIds(disconnected)).toEqual(new Set())
  })

  it('allows empty init cards to keep their own collapse setting', () => {
    const program: Program = {
      version: 1,
      nodes: [{ id: 'class', type: 'class', text: 'Empty', initCollapsed: true, position: { x: 0, y: 0 } }],
      edges: [],
    }
    expect(collapsedInitBodies(program)).toEqual(new Map([['class', new Set()]]))
    expect(collapsedBlockNodeIds(program)).toEqual(new Set())
  })
})
