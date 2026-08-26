import { describe, expect, it } from 'vitest'
import {
  adaptiveFlowNodeWidth,
  BRANCH_CENTER_SEPARATION,
  classifyBackEdges,
  COMPONENT_HORIZONTAL_GUTTER,
  estimateProgramNodeDimensions,
  layoutProgram,
  LOOP_BODY_CENTER_OFFSET,
  MAX_COMPONENT_ROW_WIDTH,
  minimumFlowNodeWidth,
  type FlowNodeDimensions,
} from './flowLayout'
import type {
  FlowNodeType,
  Program,
  ProgramEdge,
  ProgramNode,
} from './types'

function node(
  id: string,
  type: FlowNodeType,
  text = defaultText(type),
  extra: Partial<ProgramNode> = {},
): ProgramNode {
  return {
    id,
    type,
    text,
    position: { x: 9999, y: -9999 },
    ...extra,
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  label?: 'true' | 'false',
): ProgramEdge {
  return { id, source, target, ...(label ? { label } : {}) }
}

function program(nodes: ProgramNode[], edges: ProgramEdge[]): Program {
  return { version: 1, nodes, edges }
}

function defaultText(type: FlowNodeType): string {
  if (type === 'function') return 'main'
  if (type === 'class') return 'Thing(value)'
  if (type === 'method') return 'method'
  if (type === 'return') return '0'
  if (type === 'process') return 'x <- 1'
  if (type === 'assignment') return 'x <- 1'
  if (type === 'call') return 'work()'
  if (type === 'input') return 'x'
  if (type === 'output') return 'x'
  if (type === 'for') return 'item in items'
  return 'x > 0'
}

function byId(value: Program, id: string): ProgramNode {
  const result = value.nodes.find((candidate) => candidate.id === id)
  if (!result) throw new Error(`Missing node ${id}`)
  return result
}

function centerX(value: Program, id: string): number {
  const current = byId(value, id)
  return (
    current.position.x + estimateProgramNodeDimensions(value, current).width / 2
  )
}

function bottom(value: Program, id: string): number {
  const current = byId(value, id)
  return (
    current.position.y + estimateProgramNodeDimensions(value, current).height
  )
}

function expectNoNodeOverlap(value: Program): void {
  const rectangles = value.nodes.map((current) => {
    const dimensions = estimateProgramNodeDimensions(value, current)
    return {
      id: current.id,
      left: current.position.x,
      right: current.position.x + dimensions.width,
      top: current.position.y,
      bottom: current.position.y + dimensions.height,
    }
  })

  for (let leftIndex = 0; leftIndex < rectangles.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < rectangles.length;
      rightIndex += 1
    ) {
      const left = rectangles[leftIndex]
      const right = rectangles[rightIndex]
      const overlaps =
        left.left < right.right &&
        left.right > right.left &&
        left.top < right.bottom &&
        left.bottom > right.top
      expect(overlaps, `${left.id} overlaps ${right.id}`).toBe(false)
    }
  }
}

function expectNonBackEdgesDownward(
  value: Program,
  backEdgeIds: ReadonlySet<string>,
): void {
  for (const current of value.edges) {
    if (backEdgeIds.has(current.id)) continue
    const source = byId(value, current.source)
    const target = byId(value, current.target)
    expect(
      target.position.y,
      `${current.id} should travel downward`,
    ).toBeGreaterThan(source.position.y)
  }
}

describe('deterministic control-flow layout', () => {
  it('lays out a linear main flow on one vertical spine', () => {
    const input = program(
      [
        node('main', 'function'),
        node('work', 'process', 'x <- 1\ny <- x + 1'),
        node('show', 'output', 'y'),
        node('return', 'return', 'y'),
      ],
      [
        edge('main-work', 'main', 'work'),
        edge('work-show', 'work', 'show'),
        edge('show-return', 'show', 'return'),
      ],
    )

    const result = layoutProgram(input)
    expect(centerX(result.program, 'main')).toBe(centerX(result.program, 'work'))
    expect(centerX(result.program, 'work')).toBe(centerX(result.program, 'show'))
    expect(centerX(result.program, 'show')).toBe(centerX(result.program, 'return'))
    expect(byId(result.program, 'work').position.y).toBeGreaterThan(
      byId(result.program, 'main').position.y,
    )
    expect(byId(result.program, 'return').position.y).toBeGreaterThan(
      byId(result.program, 'show').position.y,
    )
    expectNoNodeOverlap(result.program)
    expectNonBackEdgesDownward(result.program, result.backEdgeIds)
  })

  it('keeps Function Inputs in executable order and Return below the body', () => {
    const input = program(
      [
        node('main', 'function'),
        node('main-return', 'return'),
        node('helper', 'function', 'helper'),
        node('first', 'input', 'first'),
        node('second', 'input', 'second'),
        node('body', 'assignment', 'total <- first + second'),
        node('helper-return', 'return', 'total'),
      ],
      [
        edge('m-r', 'main', 'main-return'),
        edge('h-i1', 'helper', 'first'),
        edge('i1-i2', 'first', 'second'),
        edge('i2-b', 'second', 'body'),
        edge('b-r', 'body', 'helper-return'),
      ],
    )
    const result = layoutProgram(input)
    const ids = ['helper', 'first', 'second', 'body', 'helper-return']
    const ys = ids.map((id) => byId(result.program, id).position.y)

    expect(ys).toEqual([...ys].sort((left, right) => left - right))
    expect(new Set(ids.map((id) => centerX(result.program, id))).size).toBe(1)
    expectNoNodeOverlap(result.program)
  })

  it('puts a True-only If body left and False fallthrough on the spine', () => {
    const input = program(
      [
        node('main', 'function'),
        node('decision', 'if'),
        node('yes', 'process'),
        node('join', 'output'),
        node('return', 'return'),
      ],
      [
        edge('m-d', 'main', 'decision'),
        edge('d-y', 'decision', 'yes', 'true'),
        edge('d-j', 'decision', 'join', 'false'),
        edge('y-j', 'yes', 'join'),
        edge('j-r', 'join', 'return'),
      ],
    )
    const { program: output } = layoutProgram(input)

    expect(centerX(output, 'yes')).toBeLessThan(centerX(output, 'decision'))
    expect(centerX(output, 'join')).toBe(centerX(output, 'decision'))
    expect(centerX(output, 'return')).toBe(centerX(output, 'decision'))
    expect(byId(output, 'join').position.y).toBeGreaterThan(
      byId(output, 'yes').position.y,
    )
  })

  it('puts full If/Else arms on opposite sides and centers their join', () => {
    const input = program(
      [
        node('main', 'function'),
        node('decision', 'if'),
        node('yes', 'process'),
        node('no', 'output'),
        node('join', 'process'),
        node('return', 'return'),
      ],
      [
        edge('m-d', 'main', 'decision'),
        edge('d-y', 'decision', 'yes', 'true'),
        edge('d-n', 'decision', 'no', 'false'),
        edge('y-j', 'yes', 'join'),
        edge('n-j', 'no', 'join'),
        edge('j-r', 'join', 'return'),
      ],
    )
    const { program: output } = layoutProgram(input)
    const decisionCenter = centerX(output, 'decision')

    expect(centerX(output, 'yes')).toBe(
      decisionCenter - BRANCH_CENTER_SEPARATION / 2,
    )
    expect(centerX(output, 'no')).toBe(
      decisionCenter + BRANCH_CENTER_SEPARATION / 2,
    )
    expect(centerX(output, 'join')).toBe(decisionCenter)
    expectNoNodeOverlap(output)
  })

  it('classifies a simple loop structurally and puts its exit below its body', () => {
    const input = program(
      [
        node('main', 'function'),
        node('loop', 'while'),
        node('body', 'process'),
        node('exit', 'return'),
      ],
      [
        edge('m-l', 'main', 'loop'),
        edge('l-b', 'loop', 'body', 'true'),
        edge('l-e', 'loop', 'exit', 'false'),
        edge('b-l', 'body', 'loop'),
      ],
    )
    const result = layoutProgram(input)

    expect(result.backEdgeIds).toEqual(new Set(['b-l']))
    expect(centerX(result.program, 'body')).toBe(
      centerX(result.program, 'loop') - LOOP_BODY_CENTER_OFFSET,
    )
    expect(centerX(result.program, 'exit')).toBe(centerX(result.program, 'loop'))
    expect(byId(result.program, 'exit').position.y).toBeGreaterThan(
      byId(result.program, 'body').position.y,
    )
    expect(byId(result.program, 'loop').position.y).toBeLessThan(
      byId(result.program, 'body').position.y,
    )
    expectNonBackEdgesDownward(result.program, result.backEdgeIds)
  })

  it('does not constrain a nested loop False edge that is itself a back edge', () => {
    const input = program(
      [
        node('main', 'function'),
        node('outer', 'while', 'outer_condition'),
        node('inner', 'while', 'inner_condition'),
        node('inner-body', 'process'),
        node('exit', 'return'),
      ],
      [
        edge('m-o', 'main', 'outer'),
        edge('o-i', 'outer', 'inner', 'true'),
        edge('o-e', 'outer', 'exit', 'false'),
        edge('i-b', 'inner', 'inner-body', 'true'),
        edge('b-i', 'inner-body', 'inner'),
        edge('i-o', 'inner', 'outer', 'false'),
      ],
    )
    const result = layoutProgram(input)

    expect(result.backEdgeIds).toEqual(new Set(['b-i', 'i-o']))
    expect(centerX(result.program, 'inner')).toBeLessThan(
      centerX(result.program, 'outer'),
    )
    expect(centerX(result.program, 'inner-body')).toBeLessThan(
      centerX(result.program, 'inner'),
    )
    expect(byId(result.program, 'outer').position.y).toBeLessThan(
      byId(result.program, 'inner').position.y,
    )
    expect(byId(result.program, 'exit').position.y).toBeGreaterThan(
      byId(result.program, 'inner-body').position.y,
    )
    expectNonBackEdgesDownward(result.program, result.backEdgeIds)
    expectNoNodeOverlap(result.program)
  })

  it('reflects nested conditional depth in progressively nested lanes', () => {
    const input = program(
      [
        node('main', 'function'),
        node('outer', 'if'),
        node('inner', 'if'),
        node('inner-yes', 'process'),
        node('inner-no', 'output'),
        node('outer-no', 'output'),
        node('return', 'return'),
      ],
      [
        edge('m-o', 'main', 'outer'),
        edge('o-i', 'outer', 'inner', 'true'),
        edge('o-n', 'outer', 'outer-no', 'false'),
        edge('i-y', 'inner', 'inner-yes', 'true'),
        edge('i-n', 'inner', 'inner-no', 'false'),
        edge('iy-r', 'inner-yes', 'return'),
        edge('in-r', 'inner-no', 'return'),
        edge('on-r', 'outer-no', 'return'),
      ],
    )
    const { program: output } = layoutProgram(input)

    expect(centerX(output, 'inner')).toBeLessThan(centerX(output, 'outer'))
    expect(centerX(output, 'inner-yes')).toBeLessThan(centerX(output, 'inner'))
    expect(centerX(output, 'inner-no')).toBeGreaterThan(centerX(output, 'inner'))
    expect(centerX(output, 'outer-no')).toBeGreaterThan(centerX(output, 'outer'))
    expect(centerX(output, 'return')).toBe(centerX(output, 'outer'))
    expectNoNodeOverlap(output)
  })

  it('groups a Class above distinct Method lanes without interleaving a Function', () => {
    const input = program(
      [
        node('class', 'class', 'Point(x, y)'),
        node('left-method', 'method', 'move'),
        node('left-return', 'return', 'self'),
        node('right-method', 'method', '__repr__'),
        node('right-return', 'return', '"Point"'),
        node('main', 'function'),
        node('main-return', 'return'),
      ],
      [
        edge('c-l', 'class', 'left-method'),
        edge('c-r', 'class', 'right-method'),
        edge('l-r', 'left-method', 'left-return'),
        edge('r-r', 'right-method', 'right-return'),
        edge('m-r', 'main', 'main-return'),
      ],
    )
    const result = layoutProgram(input)

    expect(byId(result.program, 'left-method').position.y).toBeGreaterThan(
      bottom(result.program, 'class'),
    )
    expect(byId(result.program, 'right-method').position.y).toBe(
      byId(result.program, 'left-method').position.y,
    )
    expect(centerX(result.program, 'left-method')).toBeLessThan(
      centerX(result.program, 'right-method'),
    )
    expect(byId(result.program, 'main').position.x).toBeGreaterThanOrEqual(
      Math.max(
        byId(result.program, 'left-return').position.x,
        byId(result.program, 'right-return').position.x,
      ) + COMPONENT_HORIZONTAL_GUTTER,
    )
    expectNoNodeOverlap(result.program)
    expectNonBackEdgesDownward(result.program, result.backEdgeIds)
  })

  it('orders Method lanes to match the Class attachment handle order', () => {
    const input = program(
      [
        node('class', 'class', 'Point()'),
        node('method-b', 'method', 'b'),
        node('return-b', 'return', '0'),
        node('method-a', 'method', 'a'),
        node('return-a', 'return', '0'),
      ],
      [
        edge('attach-a', 'class', 'method-a'),
        edge('attach-b', 'class', 'method-b'),
        edge('a-return', 'method-a', 'return-a'),
        edge('b-return', 'method-b', 'return-b'),
      ],
    )
    const { program: output } = layoutProgram(input)

    expect(centerX(output, 'method-a')).toBeLessThan(
      centerX(output, 'method-b'),
    )
    expectNoNodeOverlap(output)
  })

  it('packs many independent Functions into stable bounded rows', () => {
    const nodes: ProgramNode[] = []
    const edges: ProgramEdge[] = []
    for (let index = 0; index < 8; index += 1) {
      nodes.push(node(`function-${index}`, 'function', index ? `f${index}` : 'main'))
      nodes.push(node(`return-${index}`, 'return'))
      edges.push(edge(`edge-${index}`, `function-${index}`, `return-${index}`))
    }
    const first = layoutProgram(program(nodes, edges)).program
    const second = layoutProgram(program(nodes, edges)).program
    const rootRows = new Set(
      nodes
        .filter(({ type }) => type === 'function')
        .map(({ id }) => byId(first, id).position.y),
    )
    const maximumRightInFirstRow = first.nodes
      .filter((current) => current.position.y === 0)
      .reduce(
        (maximum, current) =>
          Math.max(
            maximum,
            current.position.x +
              estimateProgramNodeDimensions(first, current).width,
          ),
        0,
      )

    expect(rootRows.size).toBeGreaterThan(1)
    expect(maximumRightInFirstRow).toBeLessThanOrEqual(MAX_COMPONENT_ROW_WIDTH)
    expect(first).toEqual(second)
    expectNoNodeOverlap(first)
  })

  it('uses adaptive widths for long Process and Assignment text and comments', () => {
    const longAssignment = `result <- ${'some_long_variable + '.repeat(30)}0`
    const input = program(
      [
        node('main', 'function'),
        node(
          'process',
          'process',
          `first <- 1\n${longAssignment}\nthird <- 3`,
          { comment: 'A comment that must remain visible and clear of other nodes.' },
        ),
        node('assignment', 'assignment', longAssignment),
        node('return', 'return'),
      ],
      [
        edge('m-p', 'main', 'process'),
        edge('p-a', 'process', 'assignment'),
        edge('a-r', 'assignment', 'return'),
      ],
    )
    const { program: output } = layoutProgram(input)
    const processWidth = estimateProgramNodeDimensions(
      output,
      byId(output, 'process'),
    ).width
    const assignmentWidth = estimateProgramNodeDimensions(
      output,
      byId(output, 'assignment'),
    ).width

    expect(processWidth).toBeGreaterThan(minimumFlowNodeWidth('process'))
    expect(processWidth).toBeLessThanOrEqual(760)
    expect(assignmentWidth).toBeGreaterThan(minimumFlowNodeWidth('assignment'))
    expect(assignmentWidth).toBeLessThanOrEqual(680)
    expect(byId(output, 'process').comment).toBe(
      byId(input, 'process').comment,
    )
    expectNoNodeOverlap(output)
  })

  it('places disconnected and incomplete graph fragments after rooted components', () => {
    const input = program(
      [
        node('main', 'function'),
        node('main-return', 'return'),
        node('orphan-a', 'process'),
        node('orphan-b', 'output'),
        node('incomplete-if', 'if'),
      ],
      [
        edge('m-r', 'main', 'main-return'),
        edge('o-a-b', 'orphan-a', 'orphan-b'),
        edge('incomplete-true', 'incomplete-if', 'orphan-a', 'true'),
      ],
    )
    const result = layoutProgram(input)
    const rootedRight = Math.max(
      ...['main', 'main-return'].map((id) => {
        const current = byId(result.program, id)
        return (
          current.position.x +
          estimateProgramNodeDimensions(result.program, current).width
        )
      }),
    )
    const orphan = byId(result.program, 'incomplete-if')

    expect(
      orphan.position.x >= rootedRight + COMPONENT_HORIZONTAL_GUTTER ||
        orphan.position.y > byId(result.program, 'main-return').position.y,
    ).toBe(true)
    expect(byId(result.program, 'orphan-b').position.y).toBeGreaterThan(
      byId(result.program, 'orphan-a').position.y,
    )
    expectNoNodeOverlap(result.program)
  })

  it('keeps invalid cross-owner edges downward by re-ranking their fragments together', () => {
    const input = program(
      [
        node('main', 'function'),
        node('target', 'process'),
        node('return', 'return'),
        node('orphan-x', 'process', 'x <- 1'),
        node('orphan-y', 'process', 'y <- x + 1'),
      ],
      [
        edge('main-target', 'main', 'target'),
        edge('target-return', 'target', 'return'),
        edge('x-y', 'orphan-x', 'orphan-y'),
        edge('y-target', 'orphan-y', 'target'),
      ],
    )
    const result = layoutProgram(input)

    expect(result.backEdgeIds).not.toContain('y-target')
    expect(byId(result.program, 'orphan-y').position.y).toBeGreaterThan(
      byId(result.program, 'orphan-x').position.y,
    )
    expect(byId(result.program, 'target').position.y).toBeGreaterThan(
      byId(result.program, 'orphan-y').position.y,
    )
    expectNonBackEdgesDownward(result.program, result.backEdgeIds)
    expectNoNodeOverlap(result.program)
    expect(layoutProgram(result.program).program).toEqual(result.program)
  })

  it('classifies back edges without consulting existing coordinates', () => {
    const first = program(
      [
        node('main', 'function', 'main', { position: { x: 0, y: 900 } }),
        node('loop', 'for', 'i in items', { position: { x: 0, y: -200 } }),
        node('body', 'process', 'work()', { position: { x: 0, y: -500 } }),
        node('exit', 'return', '0', { position: { x: 0, y: 600 } }),
      ],
      [
        edge('main-loop', 'main', 'loop'),
        edge('loop-body', 'loop', 'body', 'true'),
        edge('body-loop', 'body', 'loop'),
        edge('loop-exit', 'loop', 'exit', 'false'),
      ],
    )
    const moved: Program = {
      ...first,
      nodes: first.nodes.map((current, index) => ({
        ...current,
        position: { x: -index * 1000, y: index * 3000 },
      })),
    }

    expect(classifyBackEdges(first)).toEqual(new Set(['body-loop']))
    expect(classifyBackEdges(moved)).toEqual(new Set(['body-loop']))
  })

  it('starts a disconnected reordered loop at its condition', () => {
    const disconnected = program(
      [
        node('body', 'process', 'x <- x + 1'),
        node('loop', 'while', 'x < 3'),
        node('exit', 'return', 'x'),
      ],
      [
        edge('loop-body', 'loop', 'body', 'true'),
        edge('body-loop', 'body', 'loop'),
        edge('loop-exit', 'loop', 'exit', 'false'),
      ],
    )

    expect(classifyBackEdges(disconnected)).toEqual(new Set(['body-loop']))
  })

  it('classifies very deep flows without using the JavaScript call stack', () => {
    const nodes = Array.from({ length: 5_000 }, (_, index) =>
      node(`node-${index}`, 'process', `x <- ${index}`),
    )
    const edges = nodes.slice(1).map((current, index) =>
      edge(`edge-${index}`, nodes[index].id, current.id),
    )

    expect(classifyBackEdges(program(nodes, edges))).toEqual(new Set())
  })

  it('is deeply deterministic and idempotent while preserving graph data', () => {
    const input = program(
      [
        node('main', 'function', 'main', { comment: 'entry metadata' }),
        node('decision', 'if'),
        node('yes', 'process', 'x <- 1'),
        node('no', 'process', 'x <- 2', { width: 500 }),
        node('return', 'return', 'x'),
      ],
      [
        edge('main-decision', 'main', 'decision'),
        edge('decision-yes', 'decision', 'yes', 'true'),
        edge('decision-no', 'decision', 'no', 'false'),
        edge('yes-return', 'yes', 'return'),
        edge('no-return', 'no', 'return'),
      ],
    )
    const first = layoutProgram(input)
    const second = layoutProgram(first.program)
    const independent = layoutProgram(input)

    expect(second.program).toEqual(first.program)
    expect(independent.program).toEqual(first.program)
    expect(second.backEdgeIds).toEqual(first.backEdgeIds)
    expect(first.program.edges).toEqual(input.edges)
    expect(byId(first.program, 'main').comment).toBe('entry metadata')
    expect(byId(first.program, 'no').width).toBe(500)
  })

  it('uses matching measured dimensions and rejects stale measurements', () => {
    const input = program([node('process', 'process', 'x <- 1\ny <- 2')], [])
    const current = input.nodes[0]
    const width = adaptiveFlowNodeWidth(input, current)
    const measured: FlowNodeDimensions = { width, height: 173.2 }

    expect(estimateProgramNodeDimensions(input, current, measured).height).toBe(174)
    expect(
      estimateProgramNodeDimensions(input, current, {
        width: width + 20,
        height: 999,
      }).height,
    ).not.toBe(999)
  })
})
