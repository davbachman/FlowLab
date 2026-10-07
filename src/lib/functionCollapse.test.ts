import { describe, expect, it } from 'vitest'
import { collapsedFunctionBodies } from './functionCollapse'
import type { Program } from './types'

describe('collapsed function bodies', () => {
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
    expect(collapsedFunctionBodies(program, new Set(['main'])))
      .toEqual(new Map([['main', new Set(['loop', 'body', 'end'])]]))
    expect(collapsedFunctionBodies(program, new Set(['helper'])))
      .toEqual(new Map([['helper', new Set(['helper-end'])]]))
    expect(collapsedFunctionBodies(program, new Set(['missing', 'loop']))).toEqual(new Map())
    expect(collapsedFunctionBodies(program, new Set())).toEqual(new Map())
  })
})
