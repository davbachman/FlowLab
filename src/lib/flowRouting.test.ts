import { describe, expect, it } from 'vitest'
import { programToEdges } from './editorEdges'
import {
  CLASS_METHOD_NEW_HANDLE,
  classMethodHandleId,
  METHOD_OWNER_HANDLE,
  sourceHandleForProgramEdge,
  targetHandleForProgramEdge,
} from './flowRouting'
import type { Program } from './types'

const program: Program = {
  version: 1,
  nodes: [
    { id: 'date', type: 'class', text: 'Date(day)', position: { x: 0, y: 0 } },
    { id: 'next-day', type: 'method', text: 'next_day', position: { x: 0, y: 120 } },
    { id: 'method-end', type: 'return', text: 'self', position: { x: 0, y: 240 } },
    { id: 'main', type: 'function', text: 'main', position: { x: 300, y: 0 } },
    { id: 'main-end', type: 'return', text: '0', position: { x: 300, y: 120 } },
  ],
  edges: [
    { id: 'attachment', source: 'date', target: 'next-day' },
    { id: 'method-flow', source: 'next-day', target: 'method-end' },
    { id: 'main-flow', source: 'main', target: 'main-end' },
  ],
}

describe('Class to Method routing', () => {
  it('derives stable attachment handles from the Method id', () => {
    const attachment = program.edges[0]

    expect(sourceHandleForProgramEdge(program, attachment)).toBe(
      classMethodHandleId('next-day'),
    )
    expect(targetHandleForProgramEdge(program, attachment)).toBe(
      METHOD_OWNER_HANDLE,
    )
  })

  it('recomputes attachment handles when rebuilding editor edges', () => {
    const [attachment] = programToEdges(program, [
      {
        id: 'attachment',
        source: 'date',
        target: 'next-day',
        sourceHandle: 'stale-source',
        targetHandle: 'stale-target',
      },
    ])

    expect(attachment.sourceHandle).toBe('class-method-next-day')
    expect(attachment.targetHandle).toBe('method-owner')
  })

  it('temporarily preserves the open handle while a new attachment is measured', () => {
    const [attachment] = programToEdges(program, [
      {
        id: 'attachment',
        source: 'date',
        target: 'next-day',
        sourceHandle: CLASS_METHOD_NEW_HANDLE,
        targetHandle: METHOD_OWNER_HANDLE,
      },
    ])

    expect(attachment.sourceHandle).toBe(CLASS_METHOD_NEW_HANDLE)
    expect(attachment.targetHandle).toBe(METHOD_OWNER_HANDLE)
  })
})
