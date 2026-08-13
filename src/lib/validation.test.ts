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

const validObjectProgram: Program = {
  version: 1,
  nodes: [
    { id: 'point', type: 'class', text: 'Point(x, y)', position: { x: 400, y: 0 } },
    { id: 'move', type: 'method', text: 'move', position: { x: 650, y: 0 } },
    { id: 'move-end', type: 'return', text: 'self', position: { x: 650, y: 120 } },
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    {
      id: 'make',
      type: 'assignment',
      text: 'p <- Point(1, 2)',
      position: { x: 0, y: 120 },
    },
    { id: 'end', type: 'return', text: 'p', position: { x: 0, y: 240 } },
  ],
  edges: [
    { id: 'point-move', source: 'point', target: 'move' },
    { id: 'm1', source: 'move', target: 'move-end' },
    { id: 'e1', source: 'main', target: 'make' },
    { id: 'e2', source: 'make', target: 'end' },
  ],
}

describe('validateProgram', () => {
  it('accepts valid linear and branch programs', () => {
    expect(validateProgram(validLinearProgram).valid).toBe(true)
    expect(validateProgram(validBranchProgram).valid).toBe(true)
    expect(validateProgram(validForProgram).valid).toBe(true)
  })

  it('accepts multiline Process assignments and standalone calls', () => {
    const program: Program = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'set-total'
          ? {
              ...node,
              type: 'process',
              text:
                'total <- 2 + 3\n\nroot <- sqrt(total)\nsqrt(root)\nsqrt("<-")',
            }
          : node,
      ),
    }

    expect(validateProgram(program).errors).toEqual([])
  })

  it('reports Process syntax and missing calls with source line numbers', () => {
    const malformed: Program = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'set-total'
          ? {
              ...node,
              type: 'process',
              text: 'total <- 2\n\nnot_a_call',
            }
          : node,
      ),
    }
    const missingCall: Program = {
      ...malformed,
      nodes: malformed.nodes.map((node) =>
        node.id === 'set-total'
          ? { ...node, text: 'total <- 2\n\nmissing(total)' }
          : node,
      ),
    }

    expect(validateProgram(malformed).errors.join('\n')).toMatch(/line 3/i)
    expect(validateProgram(missingCall).errors.join('\n')).toMatch(
      /missing Function "missing" on line 3/i,
    )
  })

  it('rejects an empty Process', () => {
    const program: Program = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'set-total'
          ? { ...node, type: 'process', text: '\n  \n' }
          : node,
      ),
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(
      /Process must contain at least one/i,
    )
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

  it('accepts dictionary literals in expressions', () => {
    const program = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'set-total'
          ? {
              ...node,
              text: 'D <- {"name": "Ada", 1: [True, {"nested": 3}]}',
            }
          : node,
      ),
    }

    expect(validateProgram(program).errors).toEqual([])
  })

  it('rejects malformed dictionary literals', () => {
    const program = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'set-total'
          ? { ...node, text: 'D <- {"name" "Ada"}' }
          : node,
      ),
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(
      /Assignment node "set-total" has invalid text/i,
    )
  })

  it('accepts dictionary indexed assignment targets and For iteration', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set-dictionary',
          type: 'assignment',
          text: 'D <- {"name": "Ada"}',
          position: { x: 0, y: 100 },
        },
        {
          id: 'update',
          type: 'assignment',
          text: 'D["name"] <- "Grace"',
          position: { x: 0, y: 200 },
        },
        {
          id: 'for',
          type: 'for',
          text: 'key in D',
          position: { x: 0, y: 300 },
        },
        {
          id: 'show',
          type: 'output',
          text: 'D[key]',
          position: { x: -120, y: 400 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 500 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'set-dictionary' },
        { id: 'e2', source: 'set-dictionary', target: 'update' },
        { id: 'e3', source: 'update', target: 'for' },
        { id: 'e4', source: 'for', target: 'show', label: 'true' },
        { id: 'e5', source: 'show', target: 'for' },
        { id: 'e6', source: 'for', target: 'end', label: 'false' },
      ],
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

  it('accepts Call blocks that contain a function call expression', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'draw',
          type: 'call',
          text: 'forward(100)',
          position: { x: 0, y: 120 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 240 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'draw' },
        { id: 'e2', source: 'draw', target: 'end' },
      ],
    }

    expect(
      validateProgram(program, {
        externalFunctionNames: new Set(['forward']),
      }).errors,
    ).toEqual([])
  })

  it('rejects malformed Call blocks and non-call expressions', () => {
    const malformedProgram: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'draw',
          type: 'call',
          text: 'forward 100',
          position: { x: 0, y: 120 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 240 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'draw' },
        { id: 'e2', source: 'draw', target: 'end' },
      ],
    }
    const expressionProgram: Program = {
      ...malformedProgram,
      nodes: malformedProgram.nodes.map((node) =>
        node.id === 'draw' ? { ...node, text: '1 + 2' } : node,
      ),
    }

    expect(validateProgram(malformedProgram).errors.join('\n')).toMatch(
      /Call node "draw" has invalid text/i,
    )
    expect(validateProgram(expressionProgram).errors.join('\n')).toMatch(
      /Call must contain a function call/i,
    )
  })

  it('rejects turtle calls unless the turtle library is imported', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'draw',
          type: 'call',
          text: 'forward(100)',
          position: { x: 0, y: 120 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 240 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'draw' },
        { id: 'e2', source: 'draw', target: 'end' },
      ],
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(
      /calls missing Function "forward"/i,
    )
    expect(
      validateProgram(program, {
        externalFunctionNames: new Set(['forward']),
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

  it('accepts Class declarations, constructor calls, and Method flowcharts', () => {
    expect(validateProgram(validObjectProgram).errors).toEqual([])
  })

  it('requires each Method to attach to exactly one Class', () => {
    const orphaned: Program = {
      ...validObjectProgram,
      edges: validObjectProgram.edges.filter((edge) => edge.id !== 'point-move'),
    }
    const multiplyAttached: Program = {
      ...validObjectProgram,
      edges: [
        ...validObjectProgram.edges,
        { id: 'second-class-edge', source: 'point', target: 'move' },
      ],
    }

    expect(validateProgram(orphaned).errors.join('\n')).toMatch(
      /Method node "move" must have exactly one incoming edge from a Class/i,
    )
    expect(validateProgram(multiplyAttached).errors.join('\n')).toMatch(
      /Method node "move" must have exactly one incoming edge from a Class/i,
    )
  })

  it('requires a Method attachment from a Class and an executable outgoing flow', () => {
    const wrongOwner: Program = {
      ...validObjectProgram,
      edges: validObjectProgram.edges.map((edge) =>
        edge.id === 'point-move' ? { ...edge, source: 'main' } : edge,
      ),
    }
    const declarationTarget: Program = {
      ...validObjectProgram,
      edges: validObjectProgram.edges.map((edge) =>
        edge.id === 'm1' ? { ...edge, target: 'main' } : edge,
      ),
    }

    expect(validateProgram(wrongOwner).errors.join('\n')).toMatch(
      /Method node "move" must receive its incoming edge from a Class/i,
    )
    expect(validateProgram(declarationTarget).errors.join('\n')).toMatch(
      /Method node "move" must connect to an executable node/i,
    )
  })

  it('allows Classes to connect only to Methods', () => {
    const program: Program = {
      ...validObjectProgram,
      edges: [
        ...validObjectProgram.edges,
        { id: 'bad-class-edge', source: 'point', target: 'end' },
      ],
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(
      /Class node "point" may connect only to Method nodes/i,
    )
  })

  it('rejects duplicate Classes, fields, and Methods attached to one Class', () => {
    const duplicateClass: Program = {
      ...validObjectProgram,
      nodes: [
        ...validObjectProgram.nodes,
        { id: 'point-2', type: 'class', text: 'Point(z)', position: { x: 900, y: 0 } },
      ],
    }
    const duplicateField: Program = {
      ...validObjectProgram,
      nodes: validObjectProgram.nodes.map((node) =>
        node.id === 'point' ? { ...node, text: 'Point(x, x)' } : node,
      ),
    }
    const duplicateMethod: Program = {
      ...validObjectProgram,
      nodes: [
        ...validObjectProgram.nodes,
        { id: 'move-2', type: 'method', text: 'move', position: { x: 900, y: 0 } },
        { id: 'move-2-end', type: 'return', text: 'self', position: { x: 900, y: 120 } },
      ],
      edges: [
        ...validObjectProgram.edges,
        { id: 'point-move-2', source: 'point', target: 'move-2' },
        { id: 'm2', source: 'move-2', target: 'move-2-end' },
      ],
    }

    expect(validateProgram(duplicateClass).errors.join('\n')).toMatch(
      /Duplicate Class name "Point"/i,
    )
    expect(validateProgram(duplicateField).errors.join('\n')).toMatch(
      /duplicate field "x"/i,
    )
    expect(validateProgram(duplicateMethod).errors.join('\n')).toMatch(
      /Duplicate Method name "Point\.move"/i,
    )
  })

  it('reserves self for the implicit Method receiver instead of a Class field', () => {
    const reservedField: Program = {
      ...validObjectProgram,
      nodes: validObjectProgram.nodes.map((node) =>
        node.id === 'point' ? { ...node, text: 'Point(x, self)' } : node,
      ),
    }
    const similarFieldName: Program = {
      ...validObjectProgram,
      nodes: validObjectProgram.nodes.map((node) =>
        node.id === 'point' ? { ...node, text: 'Point(x, self_value)' } : node,
      ),
    }

    expect(validateProgram(reservedField).errors.join('\n')).toMatch(
      /Class "Point" cannot declare field "self".*reserved.*Method receiver/i,
    )
    expect(validateProgram(similarFieldName).errors).toEqual([])
  })

  it('allows only exact zero-argument dunders without Input blocks', () => {
    const withInput = (methodName: string): Program => ({
      ...validObjectProgram,
      nodes: [
        ...validObjectProgram.nodes.map((node) =>
          node.id === 'move' ? { ...node, text: methodName } : node,
        ),
        {
          id: 'repr-input',
          type: 'input',
          text: 'format',
          position: { x: 650, y: 60 },
        },
      ],
      edges: [
        ...validObjectProgram.edges.filter((edge) => edge.id !== 'm1'),
        { id: 'repr-input-start', source: 'move', target: 'repr-input' },
        { id: 'repr-input-end', source: 'repr-input', target: 'move-end' },
      ],
    })

    for (const methodName of ['__repr__', '__neg__']) {
      const withoutInput: Program = {
        ...validObjectProgram,
        nodes: validObjectProgram.nodes.map((node) =>
          node.id === 'move' ? { ...node, text: methodName } : node,
        ),
      }

      expect(validateProgram(withoutInput).errors).toEqual([])
      expect(validateProgram(withInput(methodName)).errors.join('\n')).toMatch(
        new RegExp(
          `Method "Point\\.${methodName}".*exactly 0 Input blocks?.*has 1`,
          'i',
        ),
      )
    }

    expect(validateProgram(withInput('repr')).errors).toEqual([])
    expect(validateProgram(withInput('__Repr__')).errors).toEqual([])
  })

  it('requires binary dunders to start with exactly one sole Input block', () => {
    const binaryDunders = [
      '__add__',
      '__sub__',
      '__mul__',
      '__truediv__',
      '__eq__',
      '__ne__',
      '__lt__',
      '__le__',
      '__gt__',
      '__ge__',
    ]
    const withInputs = (
      methodName: string,
      inputCount: 0 | 1 | 2,
      immediate = true,
    ): Program => {
      const inputs = Array.from({ length: inputCount }, (_, index) => ({
        id: `dunder-input-${index}`,
        type: 'input' as const,
        text: `argument_${index}`,
        position: { x: 650, y: 80 + index * 80 },
      }))
      const prefix = immediate
        ? []
        : [
            {
              id: 'before-input',
              type: 'assignment' as const,
              text: 'temporary <- 0',
              position: { x: 650, y: 40 },
            },
          ]
      const path = [...prefix, ...inputs]

      return {
        ...validObjectProgram,
        nodes: [
          ...validObjectProgram.nodes.map((node) =>
            node.id === 'move' ? { ...node, text: methodName } : node,
          ),
          ...path,
        ],
        edges: [
          ...validObjectProgram.edges.filter((edge) => edge.id !== 'm1'),
          ...(path.length === 0
            ? [{ id: 'dunder-start', source: 'move', target: 'move-end' }]
            : [
                { id: 'dunder-start', source: 'move', target: path[0].id },
                ...path.slice(0, -1).map((node, index) => ({
                  id: `dunder-path-${index}`,
                  source: node.id,
                  target: path[index + 1].id,
                })),
                {
                  id: 'dunder-end',
                  source: path[path.length - 1].id,
                  target: 'move-end',
                },
              ]),
        ],
      }
    }

    for (const methodName of binaryDunders) {
      expect(validateProgram(withInputs(methodName, 1)).errors).toEqual([])
      expect(validateProgram(withInputs(methodName, 0)).errors.join('\n')).toMatch(
        new RegExp(
          `Method "Point\\.${methodName}".*exactly 1 Input block.*has 0`,
          'i',
        ),
      )
      expect(validateProgram(withInputs(methodName, 2)).errors.join('\n')).toMatch(
        new RegExp(
          `Method "Point\\.${methodName}".*exactly 1 Input block.*has 2`,
          'i',
        ),
      )
    }

    expect(
      validateProgram(withInputs('__add__', 1, false)).errors.join('\n'),
    ).toMatch(/Point\.__add__.*connect directly.*single Input/i)
  })

  it('allows different Classes to use the same bare Method name', () => {
    const program: Program = {
      ...validObjectProgram,
      nodes: [
        ...validObjectProgram.nodes,
        { id: 'box', type: 'class', text: 'Box(value)', position: { x: 900, y: 0 } },
        { id: 'box-move', type: 'method', text: 'move', position: { x: 900, y: 120 } },
        { id: 'box-end', type: 'return', text: 'self', position: { x: 900, y: 240 } },
      ],
      edges: [
        ...validObjectProgram.edges,
        { id: 'box-move-owner', source: 'box', target: 'box-move' },
        { id: 'box-move-flow', source: 'box-move', target: 'box-end' },
      ],
    }

    expect(validateProgram(program).errors).toEqual([])
  })

  it('derives Method ownership from its Class edge and rejects name conflicts', () => {
    const invalidQualifiedMethod: Program = {
      ...validObjectProgram,
      nodes: validObjectProgram.nodes.map((node) =>
        node.id === 'move' ? { ...node, text: 'Point.move' } : node,
      ),
    }
    const conflictingName: Program = {
      ...validObjectProgram,
      nodes: validObjectProgram.nodes.map((node) =>
        node.id === 'point' ? { ...node, text: 'main(x, y)' } : node,
      ),
    }

    expect(validateProgram(invalidQualifiedMethod).errors.join('\n')).toMatch(
      /Method node "move" has invalid text.*Method name/i,
    )
    expect(validateProgram(conflictingName).errors.join('\n')).toMatch(
      /Function and Class cannot both use the name "main"/i,
    )
  })

  it('reserves built-in call names for the language runtime', () => {
    const builtInFunction: Program = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'main' ? { ...node, text: 'sqrt' } : node,
      ),
    }
    const builtInClass: Program = {
      ...validObjectProgram,
      nodes: validObjectProgram.nodes.map((node) =>
        node.id === 'point' ? { ...node, text: 'rand(x, y)' } : node,
      ),
    }

    expect(validateProgram(builtInFunction).errors.join('\n')).toMatch(
      /Function name "sqrt" is reserved for a built-in/i,
    )
    expect(validateProgram(builtInClass).errors.join('\n')).toMatch(
      /Class name "rand" is reserved for a built-in/i,
    )
  })

  it('does not let Method flows replace their implicit self receiver', () => {
    const binders = [
      { id: 'bind-input', type: 'input', text: 'self' },
      { id: 'bind-assignment', type: 'assignment', text: 'self <- 0' },
      { id: 'bind-for', type: 'for', text: 'self in []' },
    ] as const

    for (const binder of binders) {
      const program: Program = {
        ...validObjectProgram,
        nodes: [
          ...validObjectProgram.nodes,
          { ...binder, position: { x: 650, y: 60 } },
        ],
        edges: [
          ...validObjectProgram.edges.filter((edge) => edge.id !== 'm1'),
          { id: `${binder.id}-start`, source: 'move', target: binder.id },
          ...(binder.type === 'for'
            ? [
                {
                  id: `${binder.id}-true`,
                  source: binder.id,
                  target: 'move-end',
                  label: 'true' as const,
                },
                {
                  id: `${binder.id}-false`,
                  source: binder.id,
                  target: 'move-end',
                  label: 'false' as const,
                },
              ]
            : [
                {
                  id: `${binder.id}-end`,
                  source: binder.id,
                  target: 'move-end',
                },
              ]),
        ],
      }

      expect(validateProgram(program).errors.join('\n')).toMatch(
        new RegExp(`${binder.id}.*reserved receiver name "self"`, 'i'),
      )
    }
  })
})
