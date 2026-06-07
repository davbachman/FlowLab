import { describe, expect, it } from 'vitest'
import { normalizeImportedProgram, validateProgram } from './validation'
import type { Program } from './types'

const validLinearProgram: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    {
      id: 'set-total',
      type: 'assignment',
      text: 'total <- 2 + 3',
      position: { x: 0, y: 120 },
    },
    {
      id: 'show-total',
      type: 'output',
      text: 'total',
      position: { x: 0, y: 240 },
    },
    { id: 'end', type: 'return', text: '0', position: { x: 0, y: 360 } },
  ],
  edges: [
    { id: 'e1', source: 'main', target: 'set-total' },
    { id: 'e2', source: 'set-total', target: 'show-total' },
    { id: 'e3', source: 'show-total', target: 'end' },
  ],
}

const validBranchProgram: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    {
      id: 'check',
      type: 'if',
      text: 'x < 10',
      position: { x: 0, y: 120 },
    },
    {
      id: 'small',
      type: 'output',
      text: '"small"',
      position: { x: -120, y: 240 },
    },
    {
      id: 'large',
      type: 'output',
      text: '"large"',
      position: { x: 120, y: 240 },
    },
    { id: 'end', type: 'return', text: '0', position: { x: 0, y: 360 } },
  ],
  edges: [
    { id: 'e1', source: 'main', target: 'check' },
    { id: 'e2', source: 'check', target: 'small', label: 'true' },
    { id: 'e3', source: 'check', target: 'large', label: 'false' },
    { id: 'e4', source: 'small', target: 'end' },
    { id: 'e5', source: 'large', target: 'end' },
  ],
}

const validForProgram: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    {
      id: 'loop',
      type: 'for',
      text: 'item in [1, 2, 3]',
      position: { x: 0, y: 120 },
    },
    {
      id: 'show',
      type: 'output',
      text: 'item',
      position: { x: -120, y: 240 },
    },
    { id: 'end', type: 'return', text: '0', position: { x: 0, y: 360 } },
  ],
  edges: [
    { id: 'e1', source: 'main', target: 'loop' },
    { id: 'e2', source: 'loop', target: 'show', label: 'true' },
    { id: 'e3', source: 'show', target: 'loop' },
    { id: 'e4', source: 'loop', target: 'end', label: 'false' },
  ],
}

describe('validateProgram', () => {
  it('accepts valid linear and branch programs', () => {
    expect(validateProgram(validLinearProgram).valid).toBe(true)
    expect(validateProgram(validBranchProgram).valid).toBe(true)
    expect(validateProgram(validForProgram).valid).toBe(true)
  })

  it('requires exactly one main function and at least one return', () => {
    const program = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.type === 'function' ? { ...node, text: 'helper' } : node,
      ),
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(
      /exactly one main Function/i,
    )
  })

  it('rejects malformed node text', () => {
    const program = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'set-total' ? { ...node, text: 'total = 5' } : node,
      ),
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(/assignment/i)
  })

  it('rejects malformed For text', () => {
    const program = {
      ...validForProgram,
      nodes: validForProgram.nodes.map((node) =>
        node.id === 'loop' ? { ...node, text: 'item of L' } : node,
      ),
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(/For/i)
  })

  it('accepts list index assignment targets', () => {
    const program = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'set-total' ? { ...node, text: 'L[2] <- L[2] - 1' } : node,
      ),
    }

    expect(validateProgram(program).errors).toEqual([])
  })

  it('accepts rand as a built-in and rejects removed built-in calls', () => {
    const randProgram = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'set-total' ? { ...node, text: 'total <- rand()' } : node,
      ),
    }
    const lenProgram = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'set-total' ? { ...node, text: 'total <- len([1])' } : node,
      ),
    }

    expect(validateProgram(randProgram).errors).toEqual([])
    expect(validateProgram(lenProgram).errors.join('\n')).toMatch(
      /missing Function "len"/,
    )
  })

  it('requires true and false labels on branch nodes', () => {
    const program = {
      ...validBranchProgram,
      edges: validBranchProgram.edges.map((edge) =>
        edge.id === 'e2' ? { ...edge, label: undefined } : edge,
      ),
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(/true.*false/i)
  })

  it('rejects labels on non-branch nodes', () => {
    const program = {
      ...validLinearProgram,
      edges: validLinearProgram.edges.map((edge) =>
        edge.id === 'e2' ? { ...edge, label: 'true' as const } : edge,
      ),
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(
      /only If, While, and For/i,
    )
  })

  it('rejects nodes that are not reachable from a function', () => {
    const program: Program = {
      ...validLinearProgram,
      nodes: [
        ...validLinearProgram.nodes,
        {
          id: 'hidden',
          type: 'output',
          text: '"hidden"',
          position: { x: 400, y: 400 },
        },
      ],
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(
      /not reachable from any Function/i,
    )
  })

  it('accepts disjoint functions called from expressions', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set-total',
          type: 'assignment',
          text: `total <- helper([1, 2, 3], 'hello', 7)`,
          position: { x: 0, y: 120 },
        },
        {
          id: 'show-total',
          type: 'output',
          text: 'total',
          position: { x: 0, y: 240 },
        },
        { id: 'main-return', type: 'return', text: 'total', position: { x: 0, y: 360 } },
        {
          id: 'helper',
          type: 'function',
          text: 'helper',
          position: { x: 320, y: 0 },
        },
        {
          id: 'helper-list',
          type: 'input',
          text: 'L',
          position: { x: 320, y: 120 },
        },
        {
          id: 'helper-word',
          type: 'input',
          text: 'word',
          position: { x: 320, y: 240 },
        },
        { id: 'helper-input', type: 'input', text: 'n', position: { x: 320, y: 360 } },
        {
          id: 'set-result',
          type: 'assignment',
          text: 'result <- L[0] + L[2] + n',
          position: { x: 320, y: 480 },
        },
        {
          id: 'helper-return',
          type: 'return',
          text: 'result',
          position: { x: 320, y: 600 },
        },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'set-total' },
        { id: 'e2', source: 'set-total', target: 'show-total' },
        { id: 'e3', source: 'show-total', target: 'main-return' },
        { id: 'e4', source: 'helper', target: 'helper-list' },
        { id: 'e5', source: 'helper-list', target: 'helper-word' },
        { id: 'e6', source: 'helper-word', target: 'helper-input' },
        { id: 'e7', source: 'helper-input', target: 'set-result' },
        { id: 'e8', source: 'set-result', target: 'helper-return' },
      ],
    }

    expect(validateProgram(program).errors).toEqual([])
  })

  it('normalizes legacy Start nodes to a main Function on import', () => {
    const legacyProgram = {
      version: 1,
      nodes: [
        { id: 'start', type: 'start', text: '', position: { x: 0, y: 0 } },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 120 } },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'end' }],
    }
    const normalized = normalizeImportedProgram(legacyProgram)

    expect(normalized.nodes[0]).toMatchObject({
      id: 'start',
      type: 'function',
      text: 'main',
    })
    expect(validateProgram(normalized).errors).toEqual([])
  })

  it('rejects duplicate function names', () => {
    const program: Program = {
      ...validLinearProgram,
      nodes: [
        ...validLinearProgram.nodes,
        {
          id: 'duplicate-main',
          type: 'function',
          text: 'main',
          position: { x: 320, y: 0 },
        },
        { id: 'other-end', type: 'return', text: '0', position: { x: 320, y: 120 } },
      ],
      edges: [
        ...validLinearProgram.edges,
        { id: 'e4', source: 'duplicate-main', target: 'other-end' },
      ],
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(
      /Duplicate Function name "main"/i,
    )
  })

  it('rejects expression calls to missing functions', () => {
    const program: Program = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'set-total'
          ? { ...node, text: 'total <- missing(5)' }
          : node,
      ),
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(
      /calls missing Function "missing"/i,
    )
  })

  it('accepts expression calls to external imported functions', () => {
    const program: Program = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'set-total'
          ? { ...node, text: 'total <- importedHelper(5)' }
          : node,
      ),
    }

    expect(
      validateProgram(program, {
        externalFunctionNames: new Set(['importedHelper']),
      }).errors,
    ).toEqual([])
  })

  it('rejects function bodies that share nodes', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'helper',
          type: 'function',
          text: 'helper',
          position: { x: 320, y: 0 },
        },
        {
          id: 'shared',
          type: 'output',
          text: '"shared"',
          position: { x: 160, y: 120 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 160, y: 240 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'shared' },
        { id: 'e2', source: 'helper', target: 'shared' },
        { id: 'e3', source: 'shared', target: 'end' },
      ],
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(
      /reachable from more than one Function/i,
    )
  })
})
