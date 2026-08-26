import { describe, expect, it } from 'vitest'
import {
  MAX_COMBINED_PROCESS_STATEMENTS,
  combineNodesIntoProcess,
  consolidateProcessBlocks,
  findBackEdgeIds,
  findExecutableOwners,
} from './processConsolidation'
import type { FlowNodeType, Program, ProgramEdge, ProgramNode } from './types'

function node(
  id: string,
  type: FlowNodeType,
  text = type === 'function' ? id : 'x <- 1',
  extra: Partial<ProgramNode> = {},
): ProgramNode {
  return {
    id,
    type,
    text,
    position: { x: 0, y: 0 },
    ...extra,
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  extra: Partial<ProgramEdge> = {},
): ProgramEdge {
  return { id, source, target, ...extra }
}

function linearProgram(
  body: ProgramNode[],
  bodyEdges?: ProgramEdge[],
): Program {
  const main = node('main', 'function', 'main')
  const end = node('end', 'return', '0')
  const edges = bodyEdges ?? [
    edge('entry', main.id, body[0].id),
    ...body.slice(0, -1).map((source, index) =>
      edge(`body-${index}`, source.id, body[index + 1].id),
    ),
    edge('exit', body.at(-1)?.id ?? main.id, end.id),
  ]

  return { version: 1, nodes: [main, ...body, end], edges }
}

function statements(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, index) =>
    `${prefix}${index + 1} <- ${index + 1}`,
  ).join('\n')
}

describe('consolidateProcessBlocks', () => {
  it('combines two sequential Process blocks and retains the first ID', () => {
    const program = linearProgram([
      node('first', 'process', 'x <- 1'),
      node('second', 'process', 'y <- x + 1'),
    ])

    const result = consolidateProcessBlocks(program)

    expect(result.mergedNodeCount).toBe(1)
    expect(result.absorbedNodeIds.get('second')).toBe('first')
    expect(result.program.nodes.map((candidate) => candidate.id)).toEqual([
      'main',
      'first',
      'end',
    ])
    expect(result.program.nodes[1]).toMatchObject({
      id: 'first',
      type: 'process',
      text: 'x <- 1\ny <- x + 1',
    })
  })

  it('combines a safely scoped chain whose final Process is temporarily incomplete', () => {
    const program: Program = {
      version: 1,
      nodes: [
        node('main', 'function', 'main'),
        node('a', 'process', 'a <- 1'),
        node('b', 'process', 'b <- 2'),
      ],
      edges: [
        edge('entry', 'main', 'a'),
        edge('a-b', 'a', 'b'),
      ],
    }

    const result = consolidateProcessBlocks(program)

    expect(result.mergedNodeCount).toBe(1)
    expect(result.program.nodes.map(({ id }) => id)).toEqual(['main', 'a'])
    expect(result.program.nodes.find(({ id }) => id === 'a')?.text).toBe(
      'a <- 1\nb <- 2',
    )
    expect(result.program.edges).toEqual([edge('entry', 'main', 'a')])
  })

  it('combines a maximal chain in execution order', () => {
    const program = linearProgram([
      node('third-in-array', 'process', 'c <- b + 1'),
      node('first-in-flow', 'process', 'a <- 1'),
      node('second-in-flow', 'process', 'b <- a + 1'),
    ], [
      edge('entry', 'main', 'first-in-flow'),
      edge('one', 'first-in-flow', 'second-in-flow'),
      edge('two', 'second-in-flow', 'third-in-array'),
      edge('exit', 'third-in-array', 'end'),
    ])

    const result = consolidateProcessBlocks(program)
    const survivor = result.program.nodes.find(
      (candidate) => candidate.id === 'first-in-flow',
    )

    expect(survivor?.text).toBe('a <- 1\nb <- a + 1\nc <- b + 1')
    expect(result.absorbedNodeIds).toEqual(
      new Map([
        ['second-in-flow', 'first-in-flow'],
        ['third-in-array', 'first-in-flow'],
      ]),
    )
  })

  it('handles multiple maximal chains independently', () => {
    const program: Program = {
      version: 1,
      nodes: [
        node('main', 'function', 'main'),
        node('a', 'process', 'a <- 1'),
        node('b', 'process', 'b <- 2'),
        node('main-return', 'return', '0'),
        node('helper', 'function', 'helper'),
        node('c', 'process', 'c <- 3'),
        node('d', 'process', 'd <- 4'),
        node('helper-return', 'return', '0'),
      ],
      edges: [
        edge('m1', 'main', 'a'),
        edge('m2', 'a', 'b'),
        edge('m3', 'b', 'main-return'),
        edge('h1', 'helper', 'c'),
        edge('h2', 'c', 'd'),
        edge('h3', 'd', 'helper-return'),
      ],
    }

    const result = consolidateProcessBlocks(program)

    expect(result.program.nodes.map((candidate) => candidate.id)).toEqual([
      'main',
      'a',
      'main-return',
      'helper',
      'c',
      'helper-return',
    ])
    expect(result.program.nodes.find((candidate) => candidate.id === 'a')?.text)
      .toBe('a <- 1\nb <- 2')
    expect(result.program.nodes.find((candidate) => candidate.id === 'c')?.text)
      .toBe('c <- 3\nd <- 4')
  })

  it('segments maximal chains at the readability limit', () => {
    expect(MAX_COMBINED_PROCESS_STATEMENTS).toBe(8)
    const program = linearProgram([
      node('a', 'process', statements('a', 4)),
      node('b', 'process', statements('b', 4)),
      node('c', 'process', statements('c', 1)),
    ])

    const result = consolidateProcessBlocks(program)

    expect(result.program.nodes.map((candidate) => candidate.id)).toEqual([
      'main',
      'a',
      'c',
      'end',
    ])
    expect(result.program.nodes.find((candidate) => candidate.id === 'a')?.text)
      .toBe(`${statements('a', 4)}\n${statements('b', 4)}`)
    expect(result.program.nodes.find((candidate) => candidate.id === 'c')?.text)
      .toBe(statements('c', 1))
  })

  it('does not split an oversized Process and resumes merging after it', () => {
    const oversizedText = statements('large', 9)
    const program = linearProgram([
      node('oversized', 'process', oversizedText),
      node('a', 'process', 'a <- 1'),
      node('b', 'process', 'b <- 2'),
    ])

    const result = consolidateProcessBlocks(program)

    expect(result.program.nodes.find((candidate) => candidate.id === 'oversized'))
      .toMatchObject({ text: oversizedText })
    expect(result.program.nodes.find((candidate) => candidate.id === 'a')?.text)
      .toBe('a <- 1\nb <- 2')
  })

  it('does not merge nodes with ambiguous Function or Method ownership', () => {
    const program: Program = {
      version: 1,
      nodes: [
        node('main', 'function', 'main'),
        node('helper', 'function', 'helper'),
        node('class', 'class', 'Point()'),
        node('method', 'method', 'move'),
        node('a', 'process', 'a <- 1'),
        node('b', 'process', 'b <- 2'),
        node('end', 'return', '0'),
      ],
      edges: [
        edge('main-a', 'main', 'a'),
        edge('helper-a', 'helper', 'a'),
        edge('class-method', 'class', 'method'),
        edge('method-a', 'method', 'a'),
        edge('a-b', 'a', 'b'),
        edge('b-end', 'b', 'end'),
      ],
    }

    const owners = findExecutableOwners(program)
    expect(owners.get('a')).toEqual(new Set(['main', 'helper', 'method']))
    expect(consolidateProcessBlocks(program).program).toBe(program)
  })

  it.each(['input', 'output', 'return', 'if', 'while', 'for'] as const)(
    'does not merge Process blocks separated by a %s boundary',
    (boundaryType) => {
      const boundaryText = boundaryType === 'input'
        ? 'value'
        : boundaryType === 'for'
          ? 'item in [1]'
          : boundaryType === 'return'
            ? '0'
            : 'True'
      const program = linearProgram([
        node('a', 'process', 'a <- 1'),
        node('boundary', boundaryType, boundaryText),
        node('b', 'process', 'b <- 2'),
      ])

      const result = consolidateProcessBlocks(program)
      expect(result.program).toBe(program)
      expect(result.mergedNodeCount).toBe(0)
    },
  )

  it('does not merge across join or fan-out graph shapes', () => {
    const program: Program = {
      version: 1,
      nodes: [
        node('main', 'function', 'main'),
        node('other', 'function', 'other'),
        node('a', 'process', 'a <- 1'),
        node('b', 'process', 'b <- 2'),
        node('c', 'process', 'c <- 3'),
        node('end', 'return', '0'),
      ],
      edges: [
        edge('entry', 'main', 'a'),
        edge('other-entry', 'other', 'b'),
        edge('a-b', 'a', 'b'),
        edge('a-c', 'a', 'c'),
        edge('b-end', 'b', 'end'),
        edge('c-end', 'c', 'end'),
      ],
    }

    expect(consolidateProcessBlocks(program).program).toBe(program)
  })

  it('does not merge through labeled or loop-back edges', () => {
    const labeled = linearProgram(
      [node('a', 'process', 'a <- 1'), node('b', 'process', 'b <- 2')],
      [
        edge('entry', 'main', 'a'),
        edge('labeled', 'a', 'b', { label: 'true' }),
        edge('exit', 'b', 'end'),
      ],
    )
    expect(consolidateProcessBlocks(labeled).program).toBe(labeled)

    const loop: Program = {
      version: 1,
      nodes: [
        node('main', 'function', 'main'),
        node('b', 'process', 'b <- 2'),
        node('a', 'process', 'a <- 1'),
        node('end', 'return', '0'),
      ],
      edges: [
        edge('entry', 'main', 'b'),
        edge('forward', 'b', 'a'),
        edge('back', 'a', 'b'),
      ],
    }
    expect(findBackEdgeIds(loop)).toEqual(new Set(['back']))
    expect(consolidateProcessBlocks(loop).program).toBe(loop)
  })

  it('uses root-first structural loop detection when nodes are serialized out of flow order', () => {
    const reorderedLoop: Program = {
      version: 1,
      nodes: [
        node('body', 'process', 'x <- x + 1'),
        node('loop', 'while', 'x < 3'),
        node('main', 'function', 'main'),
        node('end', 'return', 'x'),
      ],
      edges: [
        edge('entry', 'main', 'loop'),
        edge('body-edge', 'loop', 'body', { label: 'true' }),
        edge('back', 'body', 'loop'),
        edge('exit', 'loop', 'end', { label: 'false' }),
      ],
    }

    expect(findBackEdgeIds(reorderedLoop)).toEqual(new Set(['back']))
  })

  it('leaves malformed Process text unchanged but continues elsewhere', () => {
    const program = linearProgram([
      node('bad', 'process', 'not a call'),
      node('a', 'process', 'a <- 1'),
      node('b', 'process', 'b <- 2'),
    ])

    const result = consolidateProcessBlocks(program)

    expect(result.program.nodes.find((candidate) => candidate.id === 'bad')?.text)
      .toBe('not a call')
    expect(result.program.nodes.find((candidate) => candidate.id === 'a')?.text)
      .toBe('a <- 1\nb <- 2')
  })

  it('preserves comments, widths, unaffected IDs, and external edge metadata', () => {
    const external = {
      ...edge('exit-edge', 'b', 'end'),
      routingHint: 'keep-me',
    } as ProgramEdge
    const program = linearProgram(
      [
        node('a', 'process', 'a <- 1', {
          comment: 'first comment',
          width: 320,
        }),
        node('b', 'process', 'b <- 2', {
          comment: 'second comment',
          width: 480,
        }),
      ],
      [edge('entry-edge', 'main', 'a'), edge('internal-edge', 'a', 'b'), external],
    )

    const result = consolidateProcessBlocks(program)
    const survivor = result.program.nodes.find((candidate) => candidate.id === 'a')

    expect(survivor).toMatchObject({
      comment: 'first comment\n\nsecond comment',
      width: 480,
    })
    expect(result.program.edges).toEqual([
      edge('entry-edge', 'main', 'a'),
      { ...external, source: 'a' },
    ])
    expect(result.program.edges[1]).toHaveProperty('routingHint', 'keep-me')
    expect(result.program.nodes.find((candidate) => candidate.id === 'end'))
      .toBe(program.nodes.find((candidate) => candidate.id === 'end'))
  })

  it('is deterministic and idempotent', () => {
    const program = linearProgram([
      node('a', 'process', ' a <- 1 '),
      node('b', 'process', '\n b <- a + 1\n'),
      node('c', 'process', 'c <- b + 1'),
    ])

    const first = consolidateProcessBlocks(program)
    const sameInputAgain = consolidateProcessBlocks(program)
    const second = consolidateProcessBlocks(first.program)

    expect(first.program).toEqual(sameInputAgain.program)
    expect(second.program).toBe(first.program)
    expect(second.mergedNodeCount).toBe(0)
    expect(JSON.stringify(second.program)).toBe(JSON.stringify(first.program))
  })
})

describe('combineNodesIntoProcess', () => {
  it('canonicalizes a selected Assignment, Call, and Process chain', () => {
    const program = linearProgram([
      node('assign', 'assignment', ' x <- 1 '),
      node('call', 'call', 'helper(x)'),
      node('process', 'process', 'y <- x + 1\nhelper(y)', {
        comment: 'keep this',
      }),
    ])

    const result = combineNodesIntoProcess(program, [
      'assign',
      'call',
      'process',
    ])

    expect(result.program.nodes.find((candidate) => candidate.id === 'assign'))
      .toMatchObject({
        type: 'process',
        text: 'x <- 1\nhelper(x)\ny <- x + 1\nhelper(y)',
        comment: 'keep this',
      })
    expect(result.program.edges.map(({ id, source, target }) => ({ id, source, target })))
      .toEqual([
        { id: 'entry', source: 'main', target: 'assign' },
        { id: 'exit', source: 'assign', target: 'end' },
      ])
  })

  it('keeps manual combining available for a disconnected incomplete chain', () => {
    const program: Program = {
      version: 1,
      nodes: [
        node('a', 'assignment', 'a <- 1'),
        node('b', 'call', 'show(a)'),
      ],
      edges: [edge('a-b', 'a', 'b')],
    }

    const result = combineNodesIntoProcess(program, ['a', 'b'])

    expect(result.mergedNodeCount).toBe(1)
    expect(result.program.nodes).toHaveLength(1)
    expect(result.program.nodes[0]).toMatchObject({
      id: 'a',
      type: 'process',
      text: 'a <- 1\nshow(a)',
    })
  })

  it('rejects malformed text, unordered selections, and branch edges', () => {
    const malformed = linearProgram([
      node('assign', 'assignment', 'x <-'),
      node('call', 'call', 'helper()'),
    ])
    expect(combineNodesIntoProcess(malformed, ['assign', 'call']).program)
      .toBe(malformed)

    const valid = linearProgram([
      node('assign', 'assignment', 'x <- 1'),
      node('call', 'call', 'helper()'),
    ])
    expect(combineNodesIntoProcess(valid, ['call', 'assign']).program).toBe(valid)

    const labeled: Program = {
      ...valid,
      edges: valid.edges.map((candidate) =>
        candidate.source === 'assign'
          ? { ...candidate, label: 'false' }
          : candidate,
      ),
    }
    expect(combineNodesIntoProcess(labeled, ['assign', 'call']).program)
      .toBe(labeled)
  })
})
