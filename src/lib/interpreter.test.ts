import { describe, expect, it, vi } from 'vitest'
import {
  answerAskExecution,
  completeImageLoadExecution,
  completeTextLoadExecution,
  createExecution,
  failImageLoadExecution,
  replaceExecutionInputQueue,
  runExecution,
  stepExecution,
} from './interpreter'
import { displayedImageData, requireImageData } from './image'
import type { Program, RuntimeDictionary, RuntimeImage } from './types'

function dictionary(entries: RuntimeDictionary['entries']): RuntimeDictionary {
  return { kind: 'dictionary', entries }
}

const sumProgram: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    { id: 'input', type: 'input', text: 'n', position: { x: 0, y: 100 } },
    {
      id: 'init',
      type: 'assignment',
      text: 'total <- 0',
      position: { x: 0, y: 200 },
    },
    {
      id: 'loop',
      type: 'while',
      text: 'n > 0',
      position: { x: 0, y: 300 },
    },
    {
      id: 'add',
      type: 'assignment',
      text: 'total <- total + n',
      position: { x: -160, y: 400 },
    },
    {
      id: 'dec',
      type: 'assignment',
      text: 'n <- n - 1',
      position: { x: -160, y: 500 },
    },
    {
      id: 'output',
      type: 'output',
      text: 'total',
      position: { x: 0, y: 600 },
    },
    { id: 'end', type: 'return', text: '0', position: { x: 0, y: 700 } },
  ],
  edges: [
    { id: 'e1', source: 'main', target: 'input' },
    { id: 'e2', source: 'input', target: 'init' },
    { id: 'e3', source: 'init', target: 'loop' },
    { id: 'e4', source: 'loop', target: 'add', label: 'true' },
    { id: 'e5', source: 'add', target: 'dec' },
    { id: 'e6', source: 'dec', target: 'loop' },
    { id: 'e7', source: 'loop', target: 'output', label: 'false' },
    { id: 'e8', source: 'output', target: 'end' },
  ],
}

const importedHelperProgram: Program = {
  version: 1,
  nodes: [
    {
      id: 'import-main',
      type: 'function',
      text: 'main',
      position: { x: 0, y: 0 },
    },
    {
      id: 'import-main-return',
      type: 'return',
      text: '0',
      position: { x: 0, y: 100 },
    },
    {
      id: 'import-helper',
      type: 'function',
      text: 'helper',
      position: { x: 320, y: 0 },
    },
    {
      id: 'import-helper-input',
      type: 'input',
      text: 'x',
      position: { x: 320, y: 100 },
    },
    {
      id: 'import-helper-return',
      type: 'return',
      text: 'x + 1',
      position: { x: 320, y: 200 },
    },
  ],
  edges: [
    { id: 'import-e1', source: 'import-main', target: 'import-main-return' },
    { id: 'import-e2', source: 'import-helper', target: 'import-helper-input' },
    {
      id: 'import-e3',
      source: 'import-helper-input',
      target: 'import-helper-return',
    },
  ],
}

const pointProgram: Program = {
  version: 1,
  nodes: [
    { id: 'point', type: 'class', text: 'Point(x, y)', position: { x: 500, y: 0 } },
    { id: 'move', type: 'method', text: 'move', position: { x: 750, y: 0 } },
    { id: 'dx', type: 'input', text: 'dx', position: { x: 750, y: 100 } },
    { id: 'dy', type: 'input', text: 'dy', position: { x: 750, y: 200 } },
    {
      id: 'set-x',
      type: 'assignment',
      text: 'x <- x + dx',
      position: { x: 750, y: 300 },
    },
    {
      id: 'set-y',
      type: 'assignment',
      text: 'y <- y + dy',
      position: { x: 750, y: 400 },
    },
    { id: 'move-return', type: 'return', text: 'self', position: { x: 750, y: 500 } },
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    {
      id: 'make',
      type: 'assignment',
      text: 'p <- Point(2, 3)',
      position: { x: 0, y: 100 },
    },
    {
      id: 'alias',
      type: 'assignment',
      text: 'same <- p',
      position: { x: 0, y: 200 },
    },
    { id: 'call-move', type: 'call', text: 'p.move(5, -1)', position: { x: 0, y: 300 } },
    { id: 'show-object', type: 'output', text: 'p', position: { x: 0, y: 400 } },
    { id: 'show-x', type: 'output', text: 'same.x', position: { x: 0, y: 500 } },
    { id: 'show-y', type: 'output', text: 'p.y', position: { x: 0, y: 600 } },
    { id: 'end', type: 'return', text: 'p', position: { x: 0, y: 700 } },
  ],
  edges: [
    { id: 'point-move', source: 'point', target: 'move' },
    { id: 'm1', source: 'move', target: 'dx' },
    { id: 'm2', source: 'dx', target: 'dy' },
    { id: 'm3', source: 'dy', target: 'set-x' },
    { id: 'm4', source: 'set-x', target: 'set-y' },
    { id: 'm5', source: 'set-y', target: 'move-return' },
    { id: 'e1', source: 'main', target: 'make' },
    { id: 'e2', source: 'make', target: 'alias' },
    { id: 'e3', source: 'alias', target: 'call-move' },
    { id: 'e4', source: 'call-move', target: 'show-object' },
    { id: 'e5', source: 'show-object', target: 'show-x' },
    { id: 'e6', source: 'show-x', target: 'show-y' },
    { id: 'e7', source: 'show-y', target: 'end' },
  ],
}

const reprProgram: Program = {
  version: 1,
  nodes: [
    { id: 'box', type: 'class', text: 'Box(value)', position: { x: 400, y: 0 } },
    {
      id: 'repr',
      type: 'method',
      text: '__repr__',
      position: { x: 400, y: 120 },
    },
    {
      id: 'repr-end',
      type: 'return',
      text: '"Box(" + value + ")"',
      position: { x: 400, y: 240 },
    },
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    {
      id: 'make',
      type: 'assignment',
      text: 'b <- Box(7)',
      position: { x: 0, y: 120 },
    },
    { id: 'show', type: 'output', text: 'b', position: { x: 0, y: 240 } },
    { id: 'end', type: 'return', text: 'b', position: { x: 0, y: 360 } },
  ],
  edges: [
    { id: 'box-repr', source: 'box', target: 'repr' },
    { id: 'repr-flow', source: 'repr', target: 'repr-end' },
    { id: 'main-1', source: 'main', target: 'make' },
    { id: 'main-2', source: 'make', target: 'show' },
    { id: 'main-3', source: 'show', target: 'end' },
  ],
}

interface DunderMethodSpec {
  name: string
  input?: string
  statements?: string[]
  returnExpression: string
}

function objectOperatorProgram(
  methods: DunderMethodSpec[],
  mainExpression: string,
): Program {
  const nodes: Program['nodes'] = [
    {
      id: 'operator-box',
      type: 'class',
      text: 'Box(value, calls)',
      position: { x: 500, y: 0 },
    },
  ]
  const edges: Program['edges'] = []

  methods.forEach((method, methodIndex) => {
    const methodId = `operator-method-${methodIndex}`
    const inputId = `operator-input-${methodIndex}`
    const returnId = `operator-return-${methodIndex}`
    const pathIds: string[] = []

    nodes.push({
      id: methodId,
      type: 'method',
      text: method.name,
      position: { x: 500 + methodIndex * 180, y: 120 },
    })
    edges.push({
      id: `operator-owner-${methodIndex}`,
      source: 'operator-box',
      target: methodId,
    })

    if (method.input) {
      nodes.push({
        id: inputId,
        type: 'input',
        text: method.input,
        position: { x: 500 + methodIndex * 180, y: 220 },
      })
      pathIds.push(inputId)
    }

    for (const [statementIndex, statement] of (
      method.statements ?? []
    ).entries()) {
      const statementId = `operator-statement-${methodIndex}-${statementIndex}`
      nodes.push({
        id: statementId,
        type: 'assignment',
        text: statement,
        position: {
          x: 500 + methodIndex * 180,
          y: 320 + statementIndex * 100,
        },
      })
      pathIds.push(statementId)
    }

    nodes.push({
      id: returnId,
      type: 'return',
      text: method.returnExpression,
      position: { x: 500 + methodIndex * 180, y: 500 },
    })
    pathIds.push(returnId)

    edges.push({
      id: `operator-start-${methodIndex}`,
      source: methodId,
      target: pathIds[0],
    })
    pathIds.slice(0, -1).forEach((pathId, pathIndex) => {
      edges.push({
        id: `operator-path-${methodIndex}-${pathIndex}`,
        source: pathId,
        target: pathIds[pathIndex + 1],
      })
    })
  })

  nodes.push(
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    {
      id: 'make-left',
      type: 'assignment',
      text: 'left <- Box(8, 0)',
      position: { x: 0, y: 120 },
    },
    {
      id: 'make-right',
      type: 'assignment',
      text: 'right <- Box(2, 0)',
      position: { x: 0, y: 240 },
    },
    {
      id: 'operator-main-return',
      type: 'return',
      text: mainExpression,
      position: { x: 0, y: 360 },
    },
  )
  edges.push(
    { id: 'operator-main-1', source: 'main', target: 'make-left' },
    { id: 'operator-main-2', source: 'make-left', target: 'make-right' },
    {
      id: 'operator-main-3',
      source: 'make-right',
      target: 'operator-main-return',
    },
  )

  return { version: 1, nodes, edges }
}

describe('interpreter', () => {
  it('executes a multiline Process as one flowchart step across function calls', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'process',
          type: 'process',
          text: 'x <- 2\n\nx <- helper(x)\ny <- x + 3\nhelper(y)',
          position: { x: 0, y: 100 },
        },
        { id: 'show', type: 'output', text: 'y', position: { x: 0, y: 200 } },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 300 } },
        {
          id: 'helper',
          type: 'function',
          text: 'helper',
          position: { x: 300, y: 0 },
        },
        { id: 'input', type: 'input', text: 'value', position: { x: 300, y: 100 } },
        {
          id: 'helper-end',
          type: 'return',
          text: 'value + 1',
          position: { x: 300, y: 200 },
        },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'process' },
        { id: 'e2', source: 'process', target: 'show' },
        { id: 'e3', source: 'show', target: 'end' },
        { id: 'h1', source: 'helper', target: 'input' },
        { id: 'h2', source: 'input', target: 'helper-end' },
      ],
    }

    const finalState = runExecution(createExecution(program, []))

    expect(finalState.status).toBe('halted')
    expect(finalState.environment).toMatchObject({ x: 3, y: 6 })
    expect(finalState.output).toEqual(['6'])
    expect(finalState.steps).toBe(10)
  })

  it('resumes the remaining Process lines after ask()', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'process',
          type: 'process',
          text: 'x <- ask()\ny <- x + 1',
          position: { x: 0, y: 100 },
        },
        { id: 'end', type: 'return', text: 'y', position: { x: 0, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'process' },
        { id: 'e2', source: 'process', target: 'end' },
      ],
    }

    const asking = runExecution(createExecution(program, []))
    const finalState = runExecution(answerAskExecution(asking, '4'))

    expect(asking.status).toBe('asking')
    expect(finalState.status).toBe('halted')
    expect(finalState.environment).toMatchObject({ x: 4, y: 5 })
  })

  it('reports runtime errors with the Process source line', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'process',
          type: 'process',
          text: 'x <- 1\ny <- missing + 1',
          position: { x: 0, y: 100 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'process' },
        { id: 'e2', source: 'process', target: 'end' },
      ],
    }

    const finalState = runExecution(createExecution(program, []))

    expect(finalState.status).toBe('error')
    expect(finalState.error).toMatch(/Process node "process", line 2/i)
    expect(finalState.environment).toEqual({ x: 1 })
    expect(finalState.currentNodeId).toBe('process')
    expect(finalState.steps).toBe(2)
  })

  it('keeps completed Process statements when a later statement fails after ask()', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'process',
          type: 'process',
          text: 'x <- ask()\ny <- x + 1\nz <- missing + y',
          position: { x: 0, y: 100 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'process' },
        { id: 'e2', source: 'process', target: 'end' },
      ],
    }

    const asking = runExecution(createExecution(program, []))
    const finalState = answerAskExecution(asking, '4')

    expect(asking.status).toBe('asking')
    expect(finalState.status).toBe('error')
    expect(finalState.error).toMatch(/Process node "process", line 3/i)
    expect(finalState.environment).toEqual({ x: 4, y: 5 })
    expect(finalState.currentNodeId).toBe('process')
    expect(finalState.steps).toBe(2)
  })

  it('starts execution at the main Function even when another function appears first', () => {
    const program: Program = {
      version: 1,
      nodes: [
        {
          id: 'helper-function',
          type: 'function',
          text: 'helper',
          position: { x: 320, y: 0 },
        },
        {
          id: 'helper-end',
          type: 'return',
          text: '0',
          position: { x: 320, y: 120 },
        },
        {
          id: 'main-function',
          type: 'function',
          text: 'main',
          position: { x: 0, y: 0 },
        },
        { id: 'main-end', type: 'return', text: '0', position: { x: 0, y: 120 } },
      ],
      edges: [
        { id: 'e1', source: 'helper-function', target: 'helper-end' },
        { id: 'e2', source: 'main-function', target: 'main-end' },
      ],
    }

    expect(createExecution(program, []).currentNodeId).toBe('main-function')
  })

  it('runs assignments, queued input, output, and while loops', () => {
    const finalState = runExecution(createExecution(sumProgram, ['3']))

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.total).toBe(6)
    expect(finalState.output).toEqual(['6'])
  })

  it('uses boolean constants in assignments and logical conditions', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set-flag',
          type: 'assignment',
          text: 'flag <- True',
          position: { x: 0, y: 100 },
        },
        {
          id: 'check',
          type: 'if',
          text: 'flag and not False',
          position: { x: 0, y: 200 },
        },
        {
          id: 'yes',
          type: 'output',
          text: '"yes"',
          position: { x: -100, y: 300 },
        },
        {
          id: 'no',
          type: 'output',
          text: '"no"',
          position: { x: 100, y: 300 },
        },
        { id: 'end', type: 'return', text: 'flag', position: { x: 0, y: 400 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'set-flag' },
        { id: 'e2', source: 'set-flag', target: 'check' },
        { id: 'e3', source: 'check', target: 'yes', label: 'true' },
        { id: 'e4', source: 'check', target: 'no', label: 'false' },
        { id: 'e5', source: 'yes', target: 'end' },
        { id: 'e6', source: 'no', target: 'end' },
      ],
    }

    const finalState = runExecution(createExecution(program, []))

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.flag).toBe(true)
    expect(finalState.output).toEqual(['yes'])
    expect(finalState.returnValue).toBe(true)
  })

  it('waits at an Input node when the queue is empty', () => {
    let state = createExecution(sumProgram, [])
    state = stepExecution(state)
    state = stepExecution(state)

    expect(state.status).toBe('waiting')
    expect(state.currentNodeId).toBe('input')
    expect(state.output).toEqual([])
  })

  it('replaces a waiting scope input queue without restarting execution', () => {
    let state = runExecution(createExecution(sumProgram, []))

    expect(state.status).toBe('waiting')
    expect(state.steps).toBe(2)

    state = replaceExecutionInputQueue(state, [
      '4',
      'True',
      '"hello"',
      '[missing]',
      '{"key": missing}',
    ])

    expect(state.status).toBe('waiting')
    expect(state.currentNodeId).toBe('input')
    expect(state.steps).toBe(2)
    expect(state.inputQueue).toEqual([
      4,
      true,
      'hello',
      '[missing]',
      '{"key": missing}',
    ])

    state = stepExecution(state)
    expect(state.status).toBe('running')
    expect(state.currentNodeId).toBe('init')
    expect(state.steps).toBe(3)
    expect(state.environment.n).toBe(4)
    expect(state.inputQueue).toEqual([
      true,
      'hello',
      '[missing]',
      '{"key": missing}',
    ])
  })

  it('chooses false branches for If nodes', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set',
          type: 'assignment',
          text: 'x <- 12',
          position: { x: 0, y: 100 },
        },
        { id: 'if', type: 'if', text: 'x < 10', position: { x: 0, y: 200 } },
        {
          id: 'small',
          type: 'output',
          text: '"small"',
          position: { x: -100, y: 300 },
        },
        {
          id: 'large',
          type: 'output',
          text: '"large"',
          position: { x: 100, y: 300 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 400 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'set' },
        { id: 'e2', source: 'set', target: 'if' },
        { id: 'e3', source: 'if', target: 'small', label: 'true' },
        { id: 'e4', source: 'if', target: 'large', label: 'false' },
        { id: 'e5', source: 'small', target: 'end' },
        { id: 'e6', source: 'large', target: 'end' },
      ],
    }

    expect(runExecution(createExecution(program, [])).output).toEqual(['large'])
  })

  it('parses queued list input and supports indexed output', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'input', type: 'input', text: 'L', position: { x: 0, y: 100 } },
        { id: 'show', type: 'output', text: 'L[2]', position: { x: 0, y: 200 } },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 300 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'input' },
        { id: 'e2', source: 'input', target: 'show' },
        { id: 'e3', source: 'show', target: 'end' },
      ],
    }

    const finalState = runExecution(createExecution(program, ['[1, 2, 3]']))

    expect(finalState.environment.L).toEqual([1, 2, 3])
    expect(finalState.output).toEqual(['3'])
  })

  it('parses queued dictionary input and supports indexed output', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'input', type: 'input', text: 'D', position: { x: 0, y: 100 } },
        {
          id: 'show',
          type: 'output',
          text: 'D["x"] + D[True]',
          position: { x: 0, y: 200 },
        },
        { id: 'end', type: 'return', text: 'D', position: { x: 0, y: 300 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'input' },
        { id: 'e2', source: 'input', target: 'show' },
        { id: 'e3', source: 'show', target: 'end' },
      ],
    }

    const finalState = runExecution(
      createExecution(program, ['{"x": 5, True: 7}']),
    )

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.D).toEqual(
      dictionary([
        { key: 'x', value: 5 },
        { key: true, value: 7 },
      ]),
    )
    expect(finalState.output).toEqual(['12'])
  })

  it('uses list indexing in While conditions', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set-list',
          type: 'assignment',
          text: 'L <- [1, 2, 3]',
          position: { x: 0, y: 100 },
        },
        {
          id: 'loop',
          type: 'while',
          text: 'L[2] = 3',
          position: { x: 0, y: 200 },
        },
        {
          id: 'show',
          type: 'output',
          text: 'L[2]',
          position: { x: -100, y: 300 },
        },
        {
          id: 'change',
          type: 'assignment',
          text: 'L <- [1, 2, 0]',
          position: { x: -100, y: 400 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 500 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'set-list' },
        { id: 'e2', source: 'set-list', target: 'loop' },
        { id: 'e3', source: 'loop', target: 'show', label: 'true' },
        { id: 'e4', source: 'show', target: 'change' },
        { id: 'e5', source: 'change', target: 'loop' },
        { id: 'e6', source: 'loop', target: 'end', label: 'false' },
      ],
    }

    const finalState = runExecution(createExecution(program, []))

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.L).toEqual([1, 2, 0])
    expect(finalState.output).toEqual(['3'])
  })

  it('uses and, or, and not in While conditions', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'init',
          type: 'assignment',
          text: 'x <- 0',
          position: { x: 0, y: 100 },
        },
        {
          id: 'loop',
          type: 'while',
          text: 'not x = 3 and (x < 2 or x = 2)',
          position: { x: 0, y: 200 },
        },
        {
          id: 'inc',
          type: 'assignment',
          text: 'x <- x + 1',
          position: { x: -100, y: 300 },
        },
        {
          id: 'output',
          type: 'output',
          text: 'x',
          position: { x: 0, y: 400 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 500 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'init' },
        { id: 'e2', source: 'init', target: 'loop' },
        { id: 'e3', source: 'loop', target: 'inc', label: 'true' },
        { id: 'e4', source: 'inc', target: 'loop' },
        { id: 'e5', source: 'loop', target: 'output', label: 'false' },
        { id: 'e6', source: 'output', target: 'end' },
      ],
    }

    const finalState = runExecution(createExecution(program, []))

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.x).toBe(3)
    expect(finalState.output).toEqual(['3'])
  })

  it('updates list elements through indexed assignment targets', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'input', type: 'input', text: 'L', position: { x: 0, y: 100 } },
        {
          id: 'init',
          type: 'assignment',
          text: 'total <- 0',
          position: { x: 0, y: 200 },
        },
        {
          id: 'loop',
          type: 'while',
          text: 'L[2] > 0',
          position: { x: 0, y: 300 },
        },
        {
          id: 'add',
          type: 'assignment',
          text: 'total <- total + L[2]',
          position: { x: -160, y: 400 },
        },
        {
          id: 'dec',
          type: 'assignment',
          text: 'L[2] <- L[2] - 1',
          position: { x: -160, y: 500 },
        },
        {
          id: 'output',
          type: 'output',
          text: 'total',
          position: { x: 0, y: 600 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 700 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'input' },
        { id: 'e2', source: 'input', target: 'init' },
        { id: 'e3', source: 'init', target: 'loop' },
        { id: 'e4', source: 'loop', target: 'add', label: 'true' },
        { id: 'e5', source: 'add', target: 'dec' },
        { id: 'e6', source: 'dec', target: 'loop' },
        { id: 'e7', source: 'loop', target: 'output', label: 'false' },
        { id: 'e8', source: 'output', target: 'end' },
      ],
    }

    const finalState = runExecution(createExecution(program, ['[1,2,3]']))

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.L).toEqual([1, 2, 0])
    expect(finalState.environment.total).toBe(6)
    expect(finalState.output).toEqual(['6'])
  })

  it('creates and overwrites dictionary keys through indexed assignment targets', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set-dictionary',
          type: 'assignment',
          text: 'D <- {"count": 1}',
          position: { x: 0, y: 100 },
        },
        {
          id: 'overwrite',
          type: 'assignment',
          text: 'D["count"] <- D["count"] + 1',
          position: { x: 0, y: 200 },
        },
        {
          id: 'create',
          type: 'assignment',
          text: 'D[True] <- "yes"',
          position: { x: 0, y: 300 },
        },
        {
          id: 'output',
          type: 'output',
          text: 'D["count"] + ":" + D[True]',
          position: { x: 0, y: 400 },
        },
        { id: 'end', type: 'return', text: 'D', position: { x: 0, y: 500 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'set-dictionary' },
        { id: 'e2', source: 'set-dictionary', target: 'overwrite' },
        { id: 'e3', source: 'overwrite', target: 'create' },
        { id: 'e4', source: 'create', target: 'output' },
        { id: 'e5', source: 'output', target: 'end' },
      ],
    }

    const finalState = runExecution(createExecution(program, []))

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.D).toEqual(
      dictionary([
        { key: 'count', value: 2 },
        { key: true, value: 'yes' },
      ]),
    )
    expect(finalState.output).toEqual(['2:yes'])
    expect(finalState.returnValue).toEqual(finalState.environment.D)
  })

  it('iterates over list elements with For nodes', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'init',
          type: 'assignment',
          text: 'total <- 0',
          position: { x: 0, y: 100 },
        },
        {
          id: 'for',
          type: 'for',
          text: 'item in [1, 2, 3]',
          position: { x: 0, y: 200 },
        },
        {
          id: 'add',
          type: 'assignment',
          text: 'total <- total + item',
          position: { x: -100, y: 300 },
        },
        {
          id: 'output',
          type: 'output',
          text: 'total',
          position: { x: 0, y: 400 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 500 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'init' },
        { id: 'e2', source: 'init', target: 'for' },
        { id: 'e3', source: 'for', target: 'add', label: 'true' },
        { id: 'e4', source: 'add', target: 'for' },
        { id: 'e5', source: 'for', target: 'output', label: 'false' },
        { id: 'e6', source: 'output', target: 'end' },
      ],
    }

    const finalState = runExecution(createExecution(program, []))

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.item).toBe(3)
    expect(finalState.environment.total).toBe(6)
    expect(finalState.output).toEqual(['6'])
  })

  it('iterates over dictionary keys with For nodes in insertion order', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set-dictionary',
          type: 'assignment',
          text: 'D <- {"b": 2, "a": 3, 1: 4}',
          position: { x: 0, y: 100 },
        },
        {
          id: 'init-result',
          type: 'assignment',
          text: 'result <- ""',
          position: { x: 0, y: 200 },
        },
        {
          id: 'for',
          type: 'for',
          text: 'key in D',
          position: { x: 0, y: 300 },
        },
        {
          id: 'append',
          type: 'assignment',
          text: 'result <- result + key + ":" + D[key] + ";"',
          position: { x: -120, y: 400 },
        },
        {
          id: 'output',
          type: 'output',
          text: 'result',
          position: { x: 0, y: 500 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 600 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'set-dictionary' },
        { id: 'e2', source: 'set-dictionary', target: 'init-result' },
        { id: 'e3', source: 'init-result', target: 'for' },
        { id: 'e4', source: 'for', target: 'append', label: 'true' },
        { id: 'e5', source: 'append', target: 'for' },
        { id: 'e6', source: 'for', target: 'output', label: 'false' },
        { id: 'e7', source: 'output', target: 'end' },
      ],
    }

    const finalState = runExecution(createExecution(program, []))

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.key).toBe(1)
    expect(finalState.environment.result).toBe('b:2;a:3;1:4;')
    expect(finalState.output).toEqual(['b:2;a:3;1:4;'])
  })

  it('iterates over string characters with For nodes', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'init',
          type: 'assignment',
          text: 'result <- ""',
          position: { x: 0, y: 100 },
        },
        {
          id: 'for',
          type: 'for',
          text: 'ch in "cat"',
          position: { x: 0, y: 200 },
        },
        {
          id: 'append',
          type: 'assignment',
          text: 'result <- result + ch',
          position: { x: -100, y: 300 },
        },
        {
          id: 'output',
          type: 'output',
          text: 'result',
          position: { x: 0, y: 400 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 500 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'init' },
        { id: 'e2', source: 'init', target: 'for' },
        { id: 'e3', source: 'for', target: 'append', label: 'true' },
        { id: 'e4', source: 'append', target: 'for' },
        { id: 'e5', source: 'for', target: 'output', label: 'false' },
        { id: 'e6', source: 'output', target: 'end' },
      ],
    }

    const finalState = runExecution(createExecution(program, []))

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.ch).toBe('t')
    expect(finalState.environment.result).toBe('cat')
    expect(finalState.output).toEqual(['cat'])
  })

  it('calls custom functions from assignment expressions with a local input queue', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'init',
          type: 'assignment',
          text: `total <- helper([1, 2, 3], 'hello', 7)`,
          position: { x: 0, y: 100 },
        },
        {
          id: 'output',
          type: 'output',
          text: 'total',
          position: { x: 0, y: 200 },
        },
        { id: 'main-end', type: 'return', text: 'total', position: { x: 0, y: 300 } },
        {
          id: 'helper',
          type: 'function',
          text: 'helper',
          position: { x: 320, y: 0 },
        },
        { id: 'input-list', type: 'input', text: 'L', position: { x: 320, y: 100 } },
        {
          id: 'input-word',
          type: 'input',
          text: 'word',
          position: { x: 320, y: 200 },
        },
        { id: 'input-n', type: 'input', text: 'n', position: { x: 320, y: 300 } },
        {
          id: 'add',
          type: 'assignment',
          text: 'result <- L[0] + L[2] + n',
          position: { x: 320, y: 400 },
        },
        {
          id: 'helper-end',
          type: 'return',
          text: 'result',
          position: { x: 320, y: 500 },
        },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'init' },
        { id: 'e2', source: 'init', target: 'output' },
        { id: 'e3', source: 'output', target: 'main-end' },
        { id: 'e4', source: 'helper', target: 'input-list' },
        { id: 'e5', source: 'input-list', target: 'input-word' },
        { id: 'e6', source: 'input-word', target: 'input-n' },
        { id: 'e7', source: 'input-n', target: 'add' },
        { id: 'e8', source: 'add', target: 'helper-end' },
      ],
    }

    const finalState = runExecution(createExecution(program, []))

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.total).toBe(11)
    expect(finalState.output).toEqual(['11'])
    expect(finalState.returnValue).toBe(11)
    expect(finalState.currentNodeId).toBe('main-end')
  })

  it('calls helper functions from imported FlowLab programs', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set-total',
          type: 'assignment',
          text: 'total <- helper(5)',
          position: { x: 0, y: 100 },
        },
        {
          id: 'show-total',
          type: 'output',
          text: 'total',
          position: { x: 0, y: 200 },
        },
        { id: 'end', type: 'return', text: 'total', position: { x: 0, y: 300 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'set-total' },
        { id: 'e2', source: 'set-total', target: 'show-total' },
        { id: 'e3', source: 'show-total', target: 'end' },
      ],
    }

    const finalState = runExecution(
      createExecution(program, [], {
        importedPrograms: [importedHelperProgram],
      }),
    )

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.total).toBe(6)
    expect(finalState.output).toEqual(['6'])
    expect(finalState.currentNodeId).toBe('end')
  })

  it('uses current canvas functions before imported functions with the same name', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set-total',
          type: 'assignment',
          text: 'total <- helper(5)',
          position: { x: 0, y: 100 },
        },
        { id: 'end', type: 'return', text: 'total', position: { x: 0, y: 200 } },
        {
          id: 'local-helper',
          type: 'function',
          text: 'helper',
          position: { x: 320, y: 0 },
        },
        {
          id: 'local-helper-return',
          type: 'return',
          text: '100',
          position: { x: 320, y: 100 },
        },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'set-total' },
        { id: 'e2', source: 'set-total', target: 'end' },
        { id: 'e3', source: 'local-helper', target: 'local-helper-return' },
      ],
    }

    const finalState = runExecution(
      createExecution(program, [], {
        importedPrograms: [importedHelperProgram],
      }),
    )

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.total).toBe(100)
  })

  it('steps through custom function flowcharts before completing the caller node', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'init',
          type: 'assignment',
          text: `total <- helper([1, 2, 3], 'hello', 7)`,
          position: { x: 0, y: 100 },
        },
        {
          id: 'output',
          type: 'output',
          text: 'total',
          position: { x: 0, y: 200 },
        },
        { id: 'main-end', type: 'return', text: 'total', position: { x: 0, y: 300 } },
        {
          id: 'helper',
          type: 'function',
          text: 'helper',
          position: { x: 320, y: 0 },
        },
        { id: 'input-list', type: 'input', text: 'L', position: { x: 320, y: 100 } },
        {
          id: 'input-word',
          type: 'input',
          text: 'word',
          position: { x: 320, y: 200 },
        },
        { id: 'input-n', type: 'input', text: 'n', position: { x: 320, y: 300 } },
        {
          id: 'add',
          type: 'assignment',
          text: 'result <- L[0] + L[2] + n',
          position: { x: 320, y: 400 },
        },
        {
          id: 'helper-end',
          type: 'return',
          text: 'result',
          position: { x: 320, y: 500 },
        },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'init' },
        { id: 'e2', source: 'init', target: 'output' },
        { id: 'e3', source: 'output', target: 'main-end' },
        { id: 'e4', source: 'helper', target: 'input-list' },
        { id: 'e5', source: 'input-list', target: 'input-word' },
        { id: 'e6', source: 'input-word', target: 'input-n' },
        { id: 'e7', source: 'input-n', target: 'add' },
        { id: 'e8', source: 'add', target: 'helper-end' },
      ],
    }

    let state = createExecution(program, [])
    state = stepExecution(state)
    expect(state.currentNodeId).toBe('init')

    state = stepExecution(state)
    expect(state.currentNodeId).toBe('helper')
    expect(state.inputQueue).toEqual([[1, 2, 3], 'hello', 7])
    expect(state.environment.total).toBeUndefined()
    expect(state.callStack).toHaveLength(1)

    state = stepExecution(state)
    expect(state.currentNodeId).toBe('input-list')
    expect(state.inputQueue).toEqual([[1, 2, 3], 'hello', 7])

    state = stepExecution(state)
    expect(state.currentNodeId).toBe('input-word')
    expect(state.inputQueue).toEqual(['hello', 7])
    expect(state.environment.L).toEqual([1, 2, 3])

    state = stepExecution(state)
    state = stepExecution(state)
    state = stepExecution(state)
    expect(state.currentNodeId).toBe('helper-end')
    expect(state.environment.result).toBe(11)

    state = stepExecution(state)
    expect(state.currentNodeId).toBe('output')
    expect(state.environment.total).toBe(11)
    expect(state.inputQueue).toEqual([])
    expect(state.callStack).toHaveLength(0)
  })

  it('runs math functions only when the math library is imported', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'calculate',
          type: 'assignment',
          text: 'value <- sin(0) + cos(0) + log10(100)',
          position: { x: 0, y: 100 },
        },
        { id: 'end', type: 'return', text: 'value', position: { x: 0, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'calculate' },
        { id: 'e2', source: 'calculate', target: 'end' },
      ],
    }

    const unavailable = createExecution(program, [])
    const finalState = runExecution(
      createExecution(program, [], { nativeLibraries: ['math'] }),
    )

    expect(unavailable.status).toBe('error')
    expect(unavailable.error).toMatch(/missing Function "sin"/)
    expect(finalState.status).toBe('halted')
    expect(finalState.environment.value).toBe(3)
    expect(finalState.returnValue).toBe(3)
  })

  it('runs turtle Call blocks and records the final drawing instantly', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'forward',
          type: 'call',
          text: 'forward(100)',
          position: { x: 0, y: 100 },
        },
        {
          id: 'left',
          type: 'call',
          text: 'left(90)',
          position: { x: 0, y: 200 },
        },
        {
          id: 'up',
          type: 'call',
          text: 'forward(50)',
          position: { x: 0, y: 300 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 400 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'forward' },
        { id: 'e2', source: 'forward', target: 'left' },
        { id: 'e3', source: 'left', target: 'up' },
        { id: 'e4', source: 'up', target: 'end' },
      ],
    }

    const finalState = runExecution(
      createExecution(program, [], { nativeLibraries: ['turtle'] }),
    )

    expect(finalState.status).toBe('halted')
    expect(finalState.turtle?.segments).toEqual([
      { x1: 0, y1: 0, x2: 100, y2: 0, color: '#101828' },
      { x1: 100, y1: 0, x2: 100, y2: 50, color: '#101828' },
    ])
    expect(finalState.turtle?.x).toBeCloseTo(100)
    expect(finalState.turtle?.y).toBeCloseTo(50)
  })

  it('steps turtle Call blocks one drawing update at a time', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'forward',
          type: 'call',
          text: 'forward(25)',
          position: { x: 0, y: 100 },
        },
        {
          id: 'right',
          type: 'call',
          text: 'right(90)',
          position: { x: 0, y: 200 },
        },
        {
          id: 'down',
          type: 'call',
          text: 'forward(10)',
          position: { x: 0, y: 300 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 400 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'forward' },
        { id: 'e2', source: 'forward', target: 'right' },
        { id: 'e3', source: 'right', target: 'down' },
        { id: 'e4', source: 'down', target: 'end' },
      ],
    }

    let state = createExecution(program, [], { nativeLibraries: ['turtle'] })
    state = stepExecution(state)
    expect(state.turtle?.segments).toEqual([])

    state = stepExecution(state)
    expect(state.currentNodeId).toBe('right')
    expect(state.turtle?.segments).toEqual([
      { x1: 0, y1: 0, x2: 25, y2: 0, color: '#101828' },
    ])

    state = stepExecution(state)
    state = stepExecution(state)
    expect(state.turtle?.segments).toEqual([
      { x1: 0, y1: 0, x2: 25, y2: 0, color: '#101828' },
      { x1: 25, y1: 0, x2: 25, y2: -10, color: '#101828' },
    ])
  })

  it('does not duplicate turtle expression side effects after ask suspension', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set',
          type: 'assignment',
          text: 'x <- forward(10) + ask()',
          position: { x: 0, y: 100 },
        },
        { id: 'end', type: 'return', text: 'x', position: { x: 0, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'set' },
        { id: 'e2', source: 'set', target: 'end' },
      ],
    }

    let state = runExecution(
      createExecution(program, [], { nativeLibraries: ['turtle'] }),
    )

    expect(state.status).toBe('asking')
    expect(state.turtle?.segments).toEqual([
      { x1: 0, y1: 0, x2: 10, y2: 0, color: '#101828' },
    ])

    state = runExecution(answerAskExecution(state, '5'))

    expect(state.status).toBe('halted')
    expect(state.environment.x).toBe(5)
    expect(state.turtle?.segments).toEqual([
      { x1: 0, y1: 0, x2: 10, y2: 0, color: '#101828' },
    ])
  })

  it('loads URL text through the text native library and resumes execution', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'load',
          type: 'assignment',
          text: 'page <- text_from_url("https://example.edu/page.txt")',
          position: { x: 0, y: 100 },
        },
        {
          id: 'output',
          type: 'output',
          text: 'page',
          position: { x: 0, y: 200 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 300 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'load' },
        { id: 'e2', source: 'load', target: 'output' },
        { id: 'e3', source: 'output', target: 'end' },
      ],
    }

    let state = runExecution(
      createExecution(program, [], { nativeLibraries: ['text'] }),
    )

    expect(state.status).toBe('loading')
    expect(state.textRequest?.url).toBe('https://example.edu/page.txt')

    state = runExecution(completeTextLoadExecution(state, 'Once upon a time'))

    expect(state.status).toBe('halted')
    expect(state.environment.page).toBe('Once upon a time')
    expect(state.output).toEqual(['Once upon a time'])
  })

  it('splits text into words through the text native library', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'split',
          type: 'assignment',
          text: 'words <- split_words("  alpha\\nbeta\\t gamma  ")',
          position: { x: 0, y: 100 },
        },
        { id: 'end', type: 'return', text: 'words', position: { x: 0, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'split' },
        { id: 'e2', source: 'split', target: 'end' },
      ],
    }

    const state = runExecution(
      createExecution(program, [], { nativeLibraries: ['text'] }),
    )

    expect(state.status).toBe('halted')
    expect(state.environment.words).toEqual(['alpha', 'beta', 'gamma'])
    expect(state.returnValue).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('converts characters and Unicode code points through the text library', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'convert',
          type: 'process',
          text: 'letter <- chr(65)\nface <- chr(128578)\ncode <- ord(face)',
          position: { x: 0, y: 100 },
        },
        { id: 'end', type: 'return', text: 'code', position: { x: 0, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'convert' },
        { id: 'e2', source: 'convert', target: 'end' },
      ],
    }

    const unavailable = createExecution(program, [])
    const state = runExecution(
      createExecution(program, [], { nativeLibraries: ['text'] }),
    )

    expect(unavailable.status).toBe('error')
    expect(unavailable.error).toMatch(/missing Function "chr"/)
    expect(state.status).toBe('halted')
    expect(state.environment).toMatchObject({
      letter: 'A',
      face: '🙂',
      code: 128578,
    })
    expect(state.returnValue).toBe(128578)
  })

  it('runs image creation, pixel, display, and save functions together', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'images',
          type: 'process',
          text:
            'photo <- image_from_pixels([[[255, 0, 0], [0, 255, 0]], [[0, 0, 255], [255, 255, 255, 128]]])\nalias <- photo\nset_pixel(photo, 1, 1, [9, 8, 7])\nsize <- imsize(photo)\npixel <- get_pixel(alias, 1, 1)\ncopy <- image_to_pixels(photo)\nimshow(photo)\nimsave(photo, "edited")',
          position: { x: 0, y: 100 },
        },
        { id: 'output', type: 'output', text: 'photo', position: { x: 0, y: 200 } },
        { id: 'end', type: 'return', text: 'size', position: { x: 0, y: 300 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'images' },
        { id: 'e2', source: 'images', target: 'output' },
        { id: 'e3', source: 'output', target: 'end' },
      ],
    }

    const state = runExecution(
      createExecution(program, [], { nativeLibraries: ['image'] }),
    )

    expect(state.status).toBe('halted')
    expect(state.environment.photo).toBe(state.environment.alias)
    expect(state.environment.size).toEqual([2, 2])
    expect(state.environment.pixel).toEqual([9, 8, 7, 255])
    expect(state.environment.copy).toEqual([
      [
        [255, 0, 0, 255],
        [0, 255, 0, 255],
      ],
      [
        [0, 0, 255, 255],
        [9, 8, 7, 255],
      ],
    ])
    expect(state.output).toEqual(['Image #1 (2 × 2)'])
    expect(state.returnValue).toEqual([2, 2])
    expect(displayedImageData(state.image!)!.id).toBe(1)
    expect(state.image?.saveRequests[0].fileName).toBe('edited.png')
    expect(Array.from(state.image?.saveRequests[0].image.pixels ?? [])).toEqual([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      9, 8, 7, 255,
    ])
  })

  it('loads URL images through imread and resumes execution', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'load',
          type: 'assignment',
          text: 'photo <- imread("https://example.edu/photo.png")',
          position: { x: 0, y: 100 },
        },
        { id: 'show', type: 'call', text: 'imshow(photo)', position: { x: 0, y: 200 } },
        { id: 'end', type: 'return', text: 'imsize(photo)', position: { x: 0, y: 300 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'load' },
        { id: 'e2', source: 'load', target: 'show' },
        { id: 'e3', source: 'show', target: 'end' },
      ],
    }

    let state = runExecution(
      createExecution(program, [], { nativeLibraries: ['image'] }),
    )

    expect(state.status).toBe('loading')
    expect(state.imageRequest?.url).toBe('https://example.edu/photo.png')

    state = runExecution(
      completeImageLoadExecution(state, {
        width: 2,
        height: 1,
        pixels: new Uint8ClampedArray([
          1, 2, 3, 255,
          4, 5, 6, 128,
        ]),
      }),
    )

    expect(state.status).toBe('halted')
    expect(state.returnValue).toEqual([2, 1])
    expect(displayedImageData(state.image!)!.pixels).toEqual(
      new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]),
    )
    const image = state.environment.photo
    expect(image).toMatchObject({ kind: 'image', width: 2, height: 1 })
    expect(requireImageData(state.image!, image as RuntimeImage).id).toBe(1)
  })

  it('reports browser image load failures at the active block', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'load',
          type: 'assignment',
          text: 'photo <- imread("https://example.edu/missing.png")',
          position: { x: 0, y: 100 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'load' },
        { id: 'e2', source: 'load', target: 'end' },
      ],
    }
    const loading = runExecution(
      createExecution(program, [], { nativeLibraries: ['image'] }),
    )
    const failed = failImageLoadExecution(loading, 'Image load failed')

    expect(failed.status).toBe('error')
    expect(failed.error).toMatch(/Image load failed/)
    expect(failed.currentNodeId).toBe('load')
  })

  it('uses 1000000 as the default max step guard', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 100 } },
      ],
      edges: [{ id: 'e1', source: 'main', target: 'end' }],
    }

    const state = createExecution(program, [])

    expect(state.maxSteps).toBe(1000000)
  })

  it('stops runaway programs with a max-step guard', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'loop', type: 'while', text: '1 = 1', position: { x: 0, y: 100 } },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'loop' },
        { id: 'e2', source: 'loop', target: 'loop', label: 'true' },
        { id: 'e3', source: 'loop', target: 'end', label: 'false' },
      ],
    }

    const finalState = runExecution(createExecution(program, [], { maxSteps: 4 }))

    expect(finalState.status).toBe('error')
    expect(finalState.error).toMatch(/Maximum step count/)
  })

  it('constructs objects, dispatches methods, preserves aliases, and formats output', () => {
    const state = runExecution(createExecution(pointProgram, []))

    expect(state.status).toBe('halted')
    expect(state.environment.p).toEqual({ kind: 'object', id: 1, className: 'Point' })
    expect(state.environment.same).toBe(state.environment.p)
    expect(state.objectHeap[1]).toEqual({
      id: 1,
      className: 'Point',
      fields: { x: 7, y: 2 },
    })
    expect(state.output).toEqual(['Point #1 {x: 7, y: 2}', '7', '2'])
    expect(state.returnValue).toEqual(state.environment.p)
    expect(state.nextObjectId).toBe(2)
  })

  it('uses an attached __repr__ Method for automatic and explicit object output', () => {
    const automatic = runExecution(createExecution(reprProgram, []))
    const explicitProgram: Program = {
      ...reprProgram,
      nodes: reprProgram.nodes.map((node) =>
        node.id === 'show' ? { ...node, text: 'b.__repr__()' } : node,
      ),
    }
    const explicit = runExecution(createExecution(explicitProgram, []))

    expect(automatic.status).toBe('halted')
    expect(automatic.output).toEqual(['Box(7)'])
    expect(explicit.status).toBe('halted')
    expect(explicit.output).toEqual(['Box(7)'])
  })

  it('treats legacy repr as an ordinary Method and keeps structural object output', () => {
    const legacyProgram: Program = {
      ...reprProgram,
      nodes: reprProgram.nodes.map((node) => {
        if (node.id === 'repr') {
          return { ...node, text: 'repr' }
        }

        if (node.id === 'show') {
          return { ...node, text: '[b, b.repr()]' }
        }

        return node
      }),
    }

    const state = runExecution(createExecution(legacyProgram, []))

    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['[Box #1 {value: 7}, "Box(7)"]'])
  })

  it('formats nested objects with raw __repr__ text and memoizes once per object per Output', () => {
    const program: Program = {
      version: 1,
      nodes: [
        {
          id: 'card',
          type: 'class',
          text: 'Card(label, calls)',
          position: { x: 500, y: 0 },
        },
        {
          id: 'repr',
          type: 'method',
          text: '__repr__',
          position: { x: 500, y: 120 },
        },
        {
          id: 'count',
          type: 'assignment',
          text: 'calls <- calls + 1',
          position: { x: 500, y: 240 },
        },
        {
          id: 'repr-end',
          type: 'return',
          text: '"Card(" + label + ", " + calls + ")"',
          position: { x: 500, y: 360 },
        },
        {
          id: 'wrapper',
          type: 'class',
          text: 'Wrapper(value)',
          position: { x: 800, y: 0 },
        },
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'make-card',
          type: 'assignment',
          text: 'card <- Card("A", 0)',
          position: { x: 0, y: 120 },
        },
        {
          id: 'make-wrapper',
          type: 'assignment',
          text: 'wrapper <- Wrapper(card)',
          position: { x: 0, y: 240 },
        },
        {
          id: 'show-nested',
          type: 'output',
          text: '[card, {"again": card}, wrapper]',
          position: { x: 0, y: 360 },
        },
        {
          id: 'show-again',
          type: 'output',
          text: 'card',
          position: { x: 0, y: 480 },
        },
        { id: 'end', type: 'return', text: 'card', position: { x: 0, y: 600 } },
      ],
      edges: [
        { id: 'card-repr', source: 'card', target: 'repr' },
        { id: 'repr-1', source: 'repr', target: 'count' },
        { id: 'repr-2', source: 'count', target: 'repr-end' },
        { id: 'main-1', source: 'main', target: 'make-card' },
        { id: 'main-2', source: 'make-card', target: 'make-wrapper' },
        { id: 'main-3', source: 'make-wrapper', target: 'show-nested' },
        { id: 'main-4', source: 'show-nested', target: 'show-again' },
        { id: 'main-5', source: 'show-again', target: 'end' },
      ],
    }

    const state = runExecution(createExecution(program, []))

    expect(state.status).toBe('halted')
    expect(state.output).toEqual([
      '[Card(A, 1), {"again": Card(A, 1)}, Wrapper #2 {value: Card(A, 1)}]',
      'Card(A, 2)',
    ])
    expect(state.objectHeap[1]?.fields.calls).toBe(2)
  })

  it('requires __repr__ Methods to return strings', () => {
    for (const expression of ['value', 'self']) {
      const program: Program = {
        ...reprProgram,
        nodes: reprProgram.nodes.map((node) =>
          node.id === 'repr-end' ? { ...node, text: expression } : node,
        ),
      }

      const state = runExecution(createExecution(program, []))
      const explicitProgram: Program = {
        ...program,
        nodes: program.nodes.map((node) =>
          node.id === 'show' ? { ...node, text: 'b.__repr__()' } : node,
        ),
      }
      const explicitState = runExecution(createExecution(explicitProgram, []))

      expect(state.status).toBe('error')
      expect(state.error).toMatch(/Method "Box\.__repr__".*return a string/i)
      expect(explicitState.status).toBe('error')
      expect(explicitState.error).toMatch(
        /Method "Box\.__repr__".*return a string/i,
      )
    }
  })

  it('resumes ask-based __repr__ Methods with either output or a contained type error', () => {
    const program: Program = {
      ...reprProgram,
      nodes: reprProgram.nodes.map((node) =>
        node.id === 'repr-end' ? { ...node, text: 'ask()' } : node,
      ),
    }

    let invalid = runExecution(createExecution(program, []))
    expect(invalid.status).toBe('asking')

    invalid = answerAskExecution(invalid, '5')

    expect(invalid.status).toBe('error')
    expect(invalid.error).toMatch(/Method "Box\.__repr__".*return a string/i)

    let valid = runExecution(createExecution(program, []))
    valid = runExecution(answerAskExecution(valid, 'Box from ask'))

    expect(valid.status).toBe('halted')
    expect(valid.output).toEqual(['Box from ask'])
  })

  it('resumes text-loaded __repr__ Methods with either output or a contained type error', () => {
    const urlExpression = 'text_from_url("https://example.edu/repr.txt")'
    const programFor = (returnExpression: string): Program => ({
      ...reprProgram,
      nodes: reprProgram.nodes.map((node) =>
        node.id === 'repr-end' ? { ...node, text: returnExpression } : node,
      ),
    })

    let invalid = runExecution(
      createExecution(programFor(`${urlExpression} = "match"`), [], {
        nativeLibraries: ['text'],
      }),
    )
    expect(invalid.status).toBe('loading')

    invalid = completeTextLoadExecution(invalid, 'match')

    expect(invalid.status).toBe('error')
    expect(invalid.error).toMatch(/Method "Box\.__repr__".*return a string/i)

    let valid = runExecution(
      createExecution(programFor(urlExpression), [], {
        nativeLibraries: ['text'],
      }),
    )
    valid = runExecution(completeTextLoadExecution(valid, 'Box from URL'))

    expect(valid.status).toBe('halted')
    expect(valid.output).toEqual(['Box from URL'])
  })

  it('rejects arguments passed explicitly to __repr__', () => {
    const program: Program = {
      ...reprProgram,
      nodes: reprProgram.nodes.map((node) =>
        node.id === 'show' ? { ...node, text: 'b.__repr__(1)' } : node,
      ),
    }

    const state = runExecution(createExecution(program, []))

    expect(state.status).toBe('error')
    expect(state.error).toMatch(
      /Method "Box\.__repr__".*exactly 0 arguments?.*received 1/i,
    )
  })

  it('reports recursive __repr__ calls clearly', () => {
    const program: Program = {
      ...reprProgram,
      nodes: reprProgram.nodes.map((node) =>
        node.id === 'repr-end' ? { ...node, text: 'self.__repr__()' } : node,
      ),
    }

    const state = runExecution(createExecution(program, []))

    expect(state.status).toBe('error')
    expect(state.error).toMatch(/recurs.*__repr__|__repr__.*recurs/i)
  })

  it('uses imported __repr__ Methods without leaking one from a shadowed Class', () => {
    const importedConsumer: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'make',
          type: 'assignment',
          text: 'b <- Box(7)',
          position: { x: 0, y: 120 },
        },
        { id: 'show', type: 'output', text: 'b', position: { x: 0, y: 240 } },
        { id: 'end', type: 'return', text: 'b', position: { x: 0, y: 360 } },
      ],
      edges: [
        { id: 'main-1', source: 'main', target: 'make' },
        { id: 'main-2', source: 'make', target: 'show' },
        { id: 'main-3', source: 'show', target: 'end' },
      ],
    }
    const localWinner: Program = {
      ...importedConsumer,
      nodes: [
        {
          id: 'local-box',
          type: 'class',
          text: 'Box(value)',
          position: { x: 400, y: 0 },
        },
        ...importedConsumer.nodes,
      ],
    }

    const imported = runExecution(
      createExecution(importedConsumer, [], { importedPrograms: [reprProgram] }),
    )
    const shadowed = runExecution(
      createExecution(localWinner, [], { importedPrograms: [reprProgram] }),
    )

    expect(imported.status).toBe('halted')
    expect(imported.output).toEqual(['Box(7)'])
    expect(shadowed.status).toBe('halted')
    expect(shadowed.output).toEqual(['Box #1 {value: 7}'])
  })

  it('dispatches imported arithmetic and comparison dunders, including explicit calls', () => {
    const importedProgram = objectOperatorProgram(
      [
        {
          name: '__add__',
          input: 'other',
          returnExpression: 'value + other.value',
        },
        {
          name: '__eq__',
          input: 'other',
          returnExpression: 'value = other.value',
        },
      ],
      '0',
    )
    const consumer: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'make-left',
          type: 'assignment',
          text: 'left <- Box(8, 0)',
          position: { x: 0, y: 100 },
        },
        {
          id: 'make-right',
          type: 'assignment',
          text: 'right <- Box(2, 0)',
          position: { x: 0, y: 200 },
        },
        {
          id: 'end',
          type: 'return',
          text: '[left + right, left.__add__(right), left == right, left.__eq__(right), left != right]',
          position: { x: 0, y: 300 },
        },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'make-left' },
        { id: 'e2', source: 'make-left', target: 'make-right' },
        { id: 'e3', source: 'make-right', target: 'end' },
      ],
    }

    const state = runExecution(
      createExecution(consumer, [], { importedPrograms: [importedProgram] }),
    )

    expect(state.status).toBe('halted')
    expect(state.returnValue).toEqual([10, 10, false, false, true])
  })

  it('does not leak imported operator dunders onto a shadowing local Class', () => {
    const importedProgram = objectOperatorProgram(
      [
        {
          name: '__add__',
          input: 'other',
          returnExpression: '99',
        },
        {
          name: '__eq__',
          input: 'other',
          returnExpression: 'True',
        },
      ],
      '0',
    )
    const localConsumer = (expression: string): Program => ({
      version: 1,
      nodes: [
        {
          id: 'local-box',
          type: 'class',
          text: 'Box(value, calls)',
          position: { x: 400, y: 0 },
        },
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'make-left',
          type: 'assignment',
          text: 'left <- Box(8, 0)',
          position: { x: 0, y: 100 },
        },
        {
          id: 'make-right',
          type: 'assignment',
          text: 'right <- Box(2, 0)',
          position: { x: 0, y: 200 },
        },
        {
          id: 'end',
          type: 'return',
          text: expression,
          position: { x: 0, y: 300 },
        },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'make-left' },
        { id: 'e2', source: 'make-left', target: 'make-right' },
        { id: 'e3', source: 'make-right', target: 'end' },
      ],
    })

    const identityInitial = createExecution(
      localConsumer('[left == right, left != right]'),
      [],
      { importedPrograms: [importedProgram] },
    )
    const identity = runExecution(identityInitial)
    const arithmetic = runExecution(
      createExecution(localConsumer('left + right'), [], {
        importedPrograms: [importedProgram],
      }),
    )

    expect(
      identityInitial.importedMethods.some(
        (method) => method.name === 'Box.__add__' || method.name === 'Box.__eq__',
      ),
    ).toBe(false)
    expect(identity.status).toBe('halted')
    expect(identity.returnValue).toEqual([false, true])
    expect(arithmetic.status).toBe('error')
    expect(arithmetic.error).toMatch(/Box.*does not define Method "__add__"/i)
  })

  it('dispatches every arithmetic dunder and permits any RuntimeValue result', () => {
    const cases = [
      {
        method: '__add__',
        input: 'other',
        expression: 'left + right',
        returnExpression: '"added"',
        expected: 'added',
      },
      {
        method: '__sub__',
        input: 'other',
        expression: 'left - right',
        returnExpression: '[value, other.value]',
        expected: [8, 2],
      },
      {
        method: '__mul__',
        input: 'other',
        expression: 'left * right',
        returnExpression: '{"kind": "multiplied"}',
        expected: dictionary([{ key: 'kind', value: 'multiplied' }]),
      },
      {
        method: '__truediv__',
        input: 'other',
        expression: 'left / right',
        returnExpression: 'other',
        expected: { kind: 'object', className: 'Box', id: 2 },
      },
      {
        method: '__floordiv__',
        input: 'other',
        expression: 'left // right',
        returnExpression: '"floor divided"',
        expected: 'floor divided',
      },
      {
        method: '__mod__',
        input: 'other',
        expression: 'left % right',
        returnExpression: '[value, other.value]',
        expected: [8, 2],
      },
      {
        method: '__neg__',
        expression: '-left',
        returnExpression: 'False',
        expected: false,
      },
    ]

    for (const testCase of cases) {
      const state = runExecution(
        createExecution(
          objectOperatorProgram(
            [
              {
                name: testCase.method,
                input: testCase.input,
                returnExpression: testCase.returnExpression,
              },
            ],
            testCase.expression,
          ),
          [],
        ),
      )

      expect(state.status, testCase.method).toBe('halted')
      expect(state.returnValue, testCase.method).toEqual(testCase.expected)
    }
  })

  it('dispatches dunders on objects constructed inline in the same expression', () => {
    const state = runExecution(
      createExecution(
        objectOperatorProgram(
          [
            {
              name: '__add__',
              input: 'other',
              returnExpression: 'value + other.value',
            },
            {
              name: '__neg__',
              returnExpression: '-value',
            },
            {
              name: '__eq__',
              input: 'other',
              returnExpression: 'value = other.value',
            },
          ],
          '[Box(8, 0) + Box(2, 0), -Box(8, 0), Box(3, 0) == Box(3, 0)]',
        ),
        [],
      ),
    )

    expect(state.status).toBe('halted')
    expect(state.returnValue).toEqual([10, -8, true])
  })

  it('lets division dunders handle a zero right operand themselves', () => {
    const cases = [
      { method: '__truediv__', expression: 'left / 0' },
      { method: '__floordiv__', expression: 'left // 0' },
      { method: '__mod__', expression: 'left % 0' },
    ]

    for (const testCase of cases) {
      const state = runExecution(
        createExecution(
          objectOperatorProgram(
            [
              {
                name: testCase.method,
                input: 'divisor',
                returnExpression: '"handled " + divisor',
              },
            ],
            testCase.expression,
          ),
          [],
        ),
      )

      expect(state.status, testCase.method).toBe('halted')
      expect(state.returnValue, testCase.method).toBe('handled 0')
    }
  })

  it('dispatches both equality spellings and every comparison dunder', () => {
    const cases = [
      { method: '__eq__', operator: '=' },
      { method: '__eq__', operator: '==' },
      { method: '__ne__', operator: '!=' },
      { method: '__lt__', operator: '<' },
      { method: '__le__', operator: '<=' },
      { method: '__gt__', operator: '>' },
      { method: '__ge__', operator: '>=' },
    ]

    for (const testCase of cases) {
      const state = runExecution(
        createExecution(
          objectOperatorProgram(
            [
              {
                name: testCase.method,
                input: 'other',
                returnExpression: 'True',
              },
            ],
            `left ${testCase.operator} right`,
          ),
          [],
        ),
      )

      expect(state.status, testCase.method).toBe('halted')
      expect(state.returnValue, testCase.method).toBe(true)
    }
  })

  it('falls back from != to negated __eq__ but prefers an explicit __ne__', () => {
    const fallback = runExecution(
      createExecution(
        objectOperatorProgram(
          [
            {
              name: '__eq__',
              input: 'other',
              returnExpression: 'value = other.value',
            },
          ],
          '[left != right, left != left]',
        ),
        [],
      ),
    )
    const explicit = runExecution(
      createExecution(
        objectOperatorProgram(
          [
            {
              name: '__eq__',
              input: 'other',
              returnExpression: 'True',
            },
            {
              name: '__ne__',
              input: 'other',
              returnExpression: 'True',
            },
          ],
          'left != right',
        ),
        [],
      ),
    )

    expect(fallback.status).toBe('halted')
    expect(fallback.returnValue).toEqual([true, false])
    expect(explicit.status).toBe('halted')
    expect(explicit.returnValue).toBe(true)
  })

  it('uses object identity when equality dunders are absent', () => {
    const state = runExecution(
      createExecution(
        objectOperatorProgram(
          [],
          '[left = left, left == right, left != right]',
        ),
        [],
      ),
    )

    expect(state.status).toBe('halted')
    expect(state.returnValue).toEqual([true, false, true])
  })

  it('uses dunder equality only for direct operands, not objects nested in containers', () => {
    const state = runExecution(
      createExecution(
        objectOperatorProgram(
          [
            {
              name: '__eq__',
              input: 'other',
              statements: ['calls <- calls + 1'],
              returnExpression: 'True',
            },
          ],
          '[left == right, [left] == [right], {"item": left} == {"item": right}, [left] == [left], {"item": left} == {"item": left}]',
        ),
        [],
      ),
    )

    expect(state.status).toBe('halted')
    expect(state.returnValue).toEqual([true, false, false, true, true])
    expect(state.objectHeap[1]?.fields.calls).toBe(1)
  })

  it('requires every comparison dunder to return a Boolean', () => {
    const cases = [
      { method: '__eq__', operator: '==' },
      { method: '__ne__', operator: '!=' },
      { method: '__lt__', operator: '<' },
      { method: '__le__', operator: '<=' },
      { method: '__gt__', operator: '>' },
      { method: '__ge__', operator: '>=' },
    ]

    for (const testCase of cases) {
      const state = runExecution(
        createExecution(
          objectOperatorProgram(
            [
              {
                name: testCase.method,
                input: 'other',
                returnExpression: '1',
              },
            ],
            `left ${testCase.operator} right`,
          ),
          [],
        ),
      )

      expect(state.status, testCase.method).toBe('error')
      expect(state.error, testCase.method).toMatch(
        new RegExp(`Method "Box\\.${testCase.method}".*return a Boolean`, 'i'),
      )
    }

    const explicit = runExecution(
      createExecution(
        objectOperatorProgram(
          [
            {
              name: '__eq__',
              input: 'other',
              returnExpression: '1',
            },
          ],
          'left.__eq__(right)',
        ),
        [],
      ),
    )
    expect(explicit.status).toBe('error')
    expect(explicit.error).toMatch(/Method "Box\.__eq__".*return a Boolean/i)
  })

  it('validates ask-resumed comparison dunder returns', () => {
    const program = objectOperatorProgram(
      [{ name: '__eq__', input: 'other', returnExpression: 'ask()' }],
      'left == right',
    )

    let valid = runExecution(createExecution(program, []))
    expect(valid.status).toBe('asking')
    valid = runExecution(answerAskExecution(valid, 'True'))
    expect(valid.status).toBe('halted')
    expect(valid.returnValue).toBe(true)

    for (const answer of ['5', 'not a Boolean']) {
      let invalid = runExecution(createExecution(program, []))
      expect(invalid.status).toBe('asking')
      invalid = answerAskExecution(invalid, answer)
      expect(invalid.status, answer).toBe('error')
      expect(invalid.error, answer).toMatch(
        /Method "Box\.__eq__".*return a Boolean/i,
      )
    }
  })

  it('validates text-resumed comparison dunder returns', () => {
    const urlExpression = 'text_from_url("https://example.edu/compare.txt")'
    const programFor = (returnExpression: string): Program =>
      objectOperatorProgram(
        [{ name: '__lt__', input: 'other', returnExpression }],
        'left < right',
      )

    let valid = runExecution(
      createExecution(programFor(`${urlExpression} = "match"`), [], {
        nativeLibraries: ['text'],
      }),
    )
    expect(valid.status).toBe('loading')
    valid = runExecution(completeTextLoadExecution(valid, 'match'))
    expect(valid.status).toBe('halted')
    expect(valid.returnValue).toBe(true)

    let invalid = runExecution(
      createExecution(programFor(urlExpression), [], {
        nativeLibraries: ['text'],
      }),
    )
    expect(invalid.status).toBe('loading')
    invalid = completeTextLoadExecution(invalid, 'plain text')
    expect(invalid.status).toBe('error')
    expect(invalid.error).toMatch(
      /Method "Box\.__lt__".*return a Boolean/i,
    )
  })

  it('rejects wrong explicit argument counts for every operator dunder', () => {
    const binaryDunders = [
      '__add__',
      '__sub__',
      '__mul__',
      '__truediv__',
      '__floordiv__',
      '__mod__',
      '__eq__',
      '__ne__',
      '__lt__',
      '__le__',
      '__gt__',
      '__ge__',
    ]

    for (const methodName of binaryDunders) {
      const state = runExecution(
        createExecution(
          objectOperatorProgram(
            [
              {
                name: methodName,
                input: 'other',
                returnExpression: 'True',
              },
            ],
            `left.${methodName}()`,
          ),
          [],
        ),
      )

      expect(state.status, methodName).toBe('error')
      expect(state.error, methodName).toMatch(
        new RegExp(
          `Method "Box\\.${methodName}".*exactly 1 argument.*received 0`,
          'i',
        ),
      )
    }

    const unary = runExecution(
      createExecution(
        objectOperatorProgram(
          [{ name: '__neg__', returnExpression: '0' }],
          'left.__neg__(right)',
        ),
        [],
      ),
    )
    expect(unary.status).toBe('error')
    expect(unary.error).toMatch(
      /Method "Box\.__neg__".*exactly 0 arguments?.*received 1/i,
    )
  })

  it('errors clearly when object arithmetic or ordering lacks its dunder', () => {
    const cases = [
      { expression: 'left + right', method: '__add__', operator: '\\+' },
      { expression: 'left - right', method: '__sub__', operator: '-' },
      { expression: 'left * right', method: '__mul__', operator: '\\*' },
      { expression: 'left / right', method: '__truediv__', operator: '/' },
      { expression: 'left // right', method: '__floordiv__', operator: '//' },
      { expression: 'left % right', method: '__mod__', operator: '%' },
      { expression: '-left', method: '__neg__', operator: '-' },
      { expression: 'left < right', method: '__lt__', operator: '<' },
      { expression: 'left <= right', method: '__le__', operator: '<=' },
      { expression: 'left > right', method: '__gt__', operator: '>' },
      { expression: 'left >= right', method: '__ge__', operator: '>=' },
    ]

    for (const testCase of cases) {
      const state = runExecution(
        createExecution(objectOperatorProgram([], testCase.expression), []),
      )

      expect(state.status, testCase.expression).toBe('error')
      expect(state.error, testCase.expression).toMatch(
        new RegExp(
          `Class "Box".*Method "${testCase.method}".*operator "${testCase.operator}"`,
          'i',
        ),
      )
    }
  })

  it('does not reflect arithmetic or ordering dunders from a right object', () => {
    const cases = [
      { expression: '1 + right', method: '__add__' },
      { expression: '1 - right', method: '__sub__' },
      { expression: '1 * right', method: '__mul__' },
      { expression: '1 / right', method: '__truediv__' },
      { expression: '1 // right', method: '__floordiv__' },
      { expression: '1 % right', method: '__mod__' },
      { expression: '1 < right', method: '__lt__' },
      { expression: '1 <= right', method: '__le__' },
      { expression: '1 > right', method: '__gt__' },
      { expression: '1 >= right', method: '__ge__' },
    ]

    for (const testCase of cases) {
      const state = runExecution(
        createExecution(
          objectOperatorProgram(
            [
              {
                name: testCase.method,
                input: 'other',
                returnExpression: '99',
              },
            ],
            testCase.expression,
          ),
          [],
        ),
      )

      expect(state.status, testCase.expression).toBe('error')
      expect(state.error, testCase.expression).toMatch(
        /object on the right.*reflected.*not supported/i,
      )
    }
  })

  it('memoizes completed operator sites so replayed dunders run once each', () => {
    const state = runExecution(
      createExecution(
        objectOperatorProgram(
          [
            {
              name: '__add__',
              input: 'other',
              statements: ['calls <- calls + 1'],
              returnExpression: 'value + other.value',
            },
            {
              name: '__neg__',
              statements: ['calls <- calls + 1'],
              returnExpression: '-value',
            },
            {
              name: '__lt__',
              input: 'other',
              statements: ['calls <- calls + 1'],
              returnExpression: 'value < other.value',
            },
          ],
          '[left + right, -left, left < right]',
        ),
        [],
      ),
    )

    expect(state.status).toBe('halted')
    expect(state.returnValue).toEqual([10, -8, false])
    expect(state.objectHeap[1]?.fields.calls).toBe(3)
  })

  it('steps into an automatic arithmetic dunder and returns to its caller', () => {
    const program = objectOperatorProgram(
      [
        {
          name: '__add__',
          input: 'other',
          statements: ['calls <- calls + 1'],
          returnExpression: 'value + other.value',
        },
      ],
      'left + right',
    )
    let state = createExecution(program, [])

    state = stepExecution(state)
    state = stepExecution(state)
    state = stepExecution(state)
    expect(state.currentNodeId).toBe('operator-main-return')

    state = stepExecution(state)
    expect(state.currentNodeId).toBe('operator-method-0')
    expect(state.functionName).toBe('Box.__add__')
    expect(state.callStack).toHaveLength(1)
    expect(state.inputQueue).toEqual([
      { kind: 'object', className: 'Box', id: 2 },
    ])

    state = stepExecution(state)
    expect(state.currentNodeId).toBe('operator-input-0')
    state = stepExecution(state)
    expect(state.currentNodeId).toBe('operator-statement-0-0')
    expect(state.environment.other).toEqual({
      kind: 'object',
      className: 'Box',
      id: 2,
    })
    expect(state.inputQueue).toEqual([])

    state = stepExecution(state)
    expect(state.currentNodeId).toBe('operator-return-0')
    state = stepExecution(state)

    expect(state.status).toBe('halted')
    expect(state.currentNodeId).toBe('operator-main-return')
    expect(state.functionName).toBe('main')
    expect(state.callStack).toHaveLength(0)
    expect(state.returnValue).toBe(10)
    expect(state.objectHeap[1]?.fields.calls).toBe(1)
  })

  it('steps through automatic __repr__ using representation resume state', () => {
    let state = createExecution(reprProgram, [])

    state = stepExecution(state)
    state = stepExecution(state)
    state = stepExecution(state)

    expect(state.currentNodeId).toBe('repr')
    expect(state.functionName).toBe('Box.__repr__')
    expect(state.callStack).toHaveLength(1)
    expect(state.output).toEqual([])

    state = stepExecution(state)
    expect(state.currentNodeId).toBe('repr-end')
    state = stepExecution(state)

    expect(state.status).toBe('running')
    expect(state.currentNodeId).toBe('end')
    expect(state.functionName).toBe('main')
    expect(state.callStack).toHaveLength(0)
    expect(state.output).toEqual(['Box(7)'])

    state = stepExecution(state)
    expect(state.status).toBe('halted')
  })

  it('contains comparison return-type failures while stepping', () => {
    let state = createExecution(
      objectOperatorProgram(
        [{ name: '__lt__', input: 'other', returnExpression: '1' }],
        'left < right',
      ),
      [],
    )

    for (let step = 0; step < 10 && state.status !== 'error'; step += 1) {
      state = stepExecution(state)
    }

    expect(state.status).toBe('error')
    expect(state.error).toMatch(/Method "Box\.__lt__".*return a Boolean/i)
  })

  it('reports direct arithmetic dunder recursion clearly', () => {
    const state = runExecution(
      createExecution(
        objectOperatorProgram(
          [
            {
              name: '__add__',
              input: 'other',
              returnExpression: 'self + other',
            },
          ],
          'left + right',
        ),
        [],
      ),
    )

    expect(state.status).toBe('error')
    expect(state.error).toMatch(/Box\.__add__.*recurs/i)
  })

  it('reports direct comparison dunder recursion clearly', () => {
    const state = runExecution(
      createExecution(
        objectOperatorProgram(
          [
            {
              name: '__eq__',
              input: 'other',
              returnExpression: 'self == other',
            },
          ],
          'left == right',
        ),
        [],
      ),
    )

    expect(state.status).toBe('error')
    expect(state.error).toMatch(/Box\.__eq__.*recurs/i)
  })

  it('allows one comparison dunder to compose other comparison dunders', () => {
    const state = runExecution(
      createExecution(
        objectOperatorProgram(
          [
            {
              name: '__le__',
              input: 'other',
              returnExpression: 'self < other or self == other',
            },
            {
              name: '__lt__',
              input: 'other',
              statements: ['calls <- calls + 1'],
              returnExpression: 'value < other.value',
            },
            {
              name: '__eq__',
              input: 'other',
              statements: ['calls <- calls + 1'],
              returnExpression: 'value = other.value',
            },
          ],
          'left <= right',
        ),
        [],
      ),
    )

    expect(state.status).toBe('halted')
    expect(state.returnValue).toBe(false)
    expect(state.objectHeap[1]?.fields.calls).toBe(2)
  })

  it('dispatches a bare Method name through its attached Class and can return a new object', () => {
    const program: Program = {
      version: 1,
      nodes: [
        {
          id: 'date',
          type: 'class',
          text: 'Date(day, month, year)',
          position: { x: 400, y: 0 },
        },
        { id: 'next-day', type: 'method', text: 'next_day', position: { x: 400, y: 120 } },
        {
          id: 'next-day-end',
          type: 'return',
          text: 'Date(day + 1, month, year)',
          position: { x: 400, y: 240 },
        },
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'make-today',
          type: 'assignment',
          text: 'today <- Date(21, 7, 2026)',
          position: { x: 0, y: 120 },
        },
        {
          id: 'make-tomorrow',
          type: 'assignment',
          text: 'tomorrow <- today.next_day()',
          position: { x: 0, y: 240 },
        },
        {
          id: 'show-days',
          type: 'output',
          text: '[today.day, tomorrow.day, tomorrow.month, tomorrow.year]',
          position: { x: 0, y: 360 },
        },
        { id: 'end', type: 'return', text: 'tomorrow', position: { x: 0, y: 480 } },
      ],
      edges: [
        { id: 'date-next-day', source: 'date', target: 'next-day' },
        { id: 'next-day-flow', source: 'next-day', target: 'next-day-end' },
        { id: 'main-1', source: 'main', target: 'make-today' },
        { id: 'main-2', source: 'make-today', target: 'make-tomorrow' },
        { id: 'main-3', source: 'make-tomorrow', target: 'show-days' },
        { id: 'main-4', source: 'show-days', target: 'end' },
      ],
    }

    const state = runExecution(createExecution(program, []))

    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['[21, 22, 7, 2026]'])
    expect(state.environment.today).toEqual({
      kind: 'object',
      id: 1,
      className: 'Date',
    })
    expect(state.environment.tomorrow).toEqual({
      kind: 'object',
      id: 2,
      className: 'Date',
    })
  })

  it('compares objects by identity', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'box', type: 'class', text: 'Box(value)', position: { x: 400, y: 0 } },
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'make-a', type: 'assignment', text: 'a <- Box(1)', position: { x: 0, y: 100 } },
        { id: 'alias', type: 'assignment', text: 'b <- a', position: { x: 0, y: 200 } },
        { id: 'make-c', type: 'assignment', text: 'c <- Box(1)', position: { x: 0, y: 300 } },
        { id: 'same', type: 'output', text: 'a = b', position: { x: 0, y: 400 } },
        { id: 'different', type: 'output', text: 'a = c', position: { x: 0, y: 500 } },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 600 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'make-a' },
        { id: 'e2', source: 'make-a', target: 'alias' },
        { id: 'e3', source: 'alias', target: 'make-c' },
        { id: 'e4', source: 'make-c', target: 'same' },
        { id: 'e5', source: 'same', target: 'different' },
        { id: 'e6', source: 'different', target: 'end' },
      ],
    }

    const state = runExecution(createExecution(program, []))
    expect(state.output).toEqual(['True', 'False'])
    expect(Object.keys(state.objectHeap)).toEqual(['1', '2'])
  })

  it('reports constructor arity and missing fields clearly', () => {
    const badArity: Program = {
      ...pointProgram,
      nodes: pointProgram.nodes.map((node) =>
        node.id === 'make' ? { ...node, text: 'p <- Point(2)' } : node,
      ),
    }
    const missingField: Program = {
      ...pointProgram,
      nodes: pointProgram.nodes.map((node) =>
        node.id === 'show-x' ? { ...node, text: 'p.z' } : node,
      ),
    }

    expect(runExecution(createExecution(badArity, [])).error).toMatch(
      /Point.*exactly 2 constructor arguments.*received 1/i,
    )
    expect(runExecution(createExecution(missingField, [])).error).toMatch(
      /Point.*no field "z"/i,
    )
  })

  it('reports a missing method dynamically', () => {
    const program: Program = {
      ...pointProgram,
      nodes: pointProgram.nodes.map((node) =>
        node.id === 'call-move' ? { ...node, text: 'p.missing()' } : node,
      ),
    }

    expect(runExecution(createExecution(program, [])).error).toMatch(
      /Method "Point\.missing" does not exist/i,
    )
  })

  it('preserves member reads that occur before a mutating nested Method call', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'counter', type: 'class', text: 'Counter(value)', position: { x: 400, y: 0 } },
        { id: 'choose', type: 'method', text: 'choose', position: { x: 650, y: 0 } },
        { id: 'first', type: 'input', text: 'first', position: { x: 650, y: 100 } },
        { id: 'ignored', type: 'input', text: 'ignored', position: { x: 650, y: 200 } },
        { id: 'choose-end', type: 'return', text: 'first', position: { x: 650, y: 300 } },
        { id: 'bump', type: 'method', text: 'bump', position: { x: 900, y: 0 } },
        {
          id: 'increment',
          type: 'assignment',
          text: 'value <- value + 1',
          position: { x: 900, y: 100 },
        },
        { id: 'bump-end', type: 'return', text: 'value', position: { x: 900, y: 200 } },
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'make',
          type: 'assignment',
          text: 'p <- Counter(1)',
          position: { x: 0, y: 100 },
        },
        {
          id: 'show',
          type: 'output',
          text: 'p.choose(p.value, p.bump())',
          position: { x: 0, y: 200 },
        },
        { id: 'end', type: 'return', text: 'p', position: { x: 0, y: 300 } },
      ],
      edges: [
        { id: 'counter-choose', source: 'counter', target: 'choose' },
        { id: 'counter-bump', source: 'counter', target: 'bump' },
        { id: 'choose-1', source: 'choose', target: 'first' },
        { id: 'choose-2', source: 'first', target: 'ignored' },
        { id: 'choose-3', source: 'ignored', target: 'choose-end' },
        { id: 'bump-1', source: 'bump', target: 'increment' },
        { id: 'bump-2', source: 'increment', target: 'bump-end' },
        { id: 'main-1', source: 'main', target: 'make' },
        { id: 'main-2', source: 'make', target: 'show' },
        { id: 'main-3', source: 'show', target: 'end' },
      ],
    }

    const state = runExecution(createExecution(program, []))

    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['1'])
    expect(state.objectHeap[1]?.fields.value).toBe(2)
  })

  it('preserves implicit field evaluation order around nested Method calls', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'counter', type: 'class', text: 'Counter(value)', position: { x: 500, y: 0 } },
        { id: 'bump', type: 'method', text: 'bump', position: { x: 500, y: 120 } },
        { id: 'increment', type: 'assignment', text: 'value <- value + 1', position: { x: 500, y: 240 } },
        { id: 'bump-end', type: 'return', text: 'value', position: { x: 500, y: 360 } },
        { id: 'before', type: 'method', text: 'before', position: { x: 750, y: 120 } },
        { id: 'before-end', type: 'return', text: 'value + self.bump()', position: { x: 750, y: 240 } },
        { id: 'after', type: 'method', text: 'after', position: { x: 1000, y: 120 } },
        { id: 'after-end', type: 'return', text: 'self.bump() + value', position: { x: 1000, y: 240 } },
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'make-before', type: 'assignment', text: 'a <- Counter(1)', position: { x: 0, y: 120 } },
        { id: 'call-before', type: 'assignment', text: 'before_result <- a.before()', position: { x: 0, y: 240 } },
        { id: 'make-after', type: 'assignment', text: 'b <- Counter(1)', position: { x: 0, y: 360 } },
        { id: 'call-after', type: 'assignment', text: 'after_result <- b.after()', position: { x: 0, y: 480 } },
        {
          id: 'show',
          type: 'output',
          text: '[before_result, a.value, after_result, b.value]',
          position: { x: 0, y: 600 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 720 } },
      ],
      edges: [
        { id: 'counter-bump', source: 'counter', target: 'bump' },
        { id: 'counter-before', source: 'counter', target: 'before' },
        { id: 'counter-after', source: 'counter', target: 'after' },
        { id: 'bump-1', source: 'bump', target: 'increment' },
        { id: 'bump-2', source: 'increment', target: 'bump-end' },
        { id: 'before-1', source: 'before', target: 'before-end' },
        { id: 'after-1', source: 'after', target: 'after-end' },
        { id: 'main-1', source: 'main', target: 'make-before' },
        { id: 'main-2', source: 'make-before', target: 'call-before' },
        { id: 'main-3', source: 'call-before', target: 'make-after' },
        { id: 'main-4', source: 'make-after', target: 'call-after' },
        { id: 'main-5', source: 'call-after', target: 'show' },
        { id: 'main-6', source: 'show', target: 'end' },
      ],
    }

    const state = runExecution(createExecution(program, []))

    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['[3, 2, 4, 2]'])
  })

  it('lets Method locals shadow fields while self disambiguates the receiver', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'box', type: 'class', text: 'Box(value)', position: { x: 400, y: 0 } },
        { id: 'set', type: 'method', text: 'set', position: { x: 400, y: 120 } },
        { id: 'new-value', type: 'input', text: 'value', position: { x: 400, y: 240 } },
        { id: 'set-value', type: 'assignment', text: 'self.value <- value', position: { x: 400, y: 360 } },
        { id: 'set-end', type: 'return', text: 'value', position: { x: 400, y: 480 } },
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'make', type: 'assignment', text: 'b <- Box(1)', position: { x: 0, y: 120 } },
        { id: 'call', type: 'assignment', text: 'result <- b.set(7)', position: { x: 0, y: 240 } },
        { id: 'show', type: 'output', text: '[result, b.value]', position: { x: 0, y: 360 } },
        { id: 'end', type: 'return', text: 'b', position: { x: 0, y: 480 } },
      ],
      edges: [
        { id: 'box-set', source: 'box', target: 'set' },
        { id: 'set-1', source: 'set', target: 'new-value' },
        { id: 'set-2', source: 'new-value', target: 'set-value' },
        { id: 'set-3', source: 'set-value', target: 'set-end' },
        { id: 'main-1', source: 'main', target: 'make' },
        { id: 'main-2', source: 'make', target: 'call' },
        { id: 'main-3', source: 'call', target: 'show' },
        { id: 'main-4', source: 'show', target: 'end' },
      ],
    }

    const state = runExecution(createExecution(program, []))

    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['[7, 7]'])
  })

  it('updates indexed collections stored in implicit receiver fields', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'bag', type: 'class', text: 'Bag(items, counts)', position: { x: 450, y: 0 } },
        { id: 'update', type: 'method', text: 'update', position: { x: 450, y: 120 } },
        { id: 'set-item', type: 'assignment', text: 'items[0] <- 9', position: { x: 450, y: 240 } },
        {
          id: 'set-count',
          type: 'assignment',
          text: 'counts["x"] <- counts["x"] + 1',
          position: { x: 450, y: 360 },
        },
        { id: 'update-end', type: 'return', text: 'self', position: { x: 450, y: 480 } },
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'make',
          type: 'assignment',
          text: 'b <- Bag([1, 2], {"x": 3})',
          position: { x: 0, y: 120 },
        },
        { id: 'call', type: 'call', text: 'b.update()', position: { x: 0, y: 240 } },
        {
          id: 'show',
          type: 'output',
          text: '[b.items[0], b.counts["x"]]',
          position: { x: 0, y: 360 },
        },
        { id: 'end', type: 'return', text: 'b', position: { x: 0, y: 480 } },
      ],
      edges: [
        { id: 'bag-update', source: 'bag', target: 'update' },
        { id: 'update-1', source: 'update', target: 'set-item' },
        { id: 'update-2', source: 'set-item', target: 'set-count' },
        { id: 'update-3', source: 'set-count', target: 'update-end' },
        { id: 'main-1', source: 'main', target: 'make' },
        { id: 'main-2', source: 'make', target: 'call' },
        { id: 'main-3', source: 'call', target: 'show' },
        { id: 'main-4', source: 'show', target: 'end' },
      ],
    }

    const state = runExecution(createExecution(program, []))

    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['[9, 4]'])
  })

  it('uses an implicit object field as a member-assignment target', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'box', type: 'class', text: 'Box(value)', position: { x: 400, y: 0 } },
        { id: 'wrapper', type: 'class', text: 'Wrapper(child)', position: { x: 650, y: 0 } },
        { id: 'replace', type: 'method', text: 'replace', position: { x: 650, y: 120 } },
        { id: 'set-child', type: 'assignment', text: 'child.value <- 8', position: { x: 650, y: 240 } },
        { id: 'replace-end', type: 'return', text: 'child', position: { x: 650, y: 360 } },
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'make-box', type: 'assignment', text: 'b <- Box(1)', position: { x: 0, y: 120 } },
        { id: 'make-wrapper', type: 'assignment', text: 'w <- Wrapper(b)', position: { x: 0, y: 240 } },
        { id: 'call', type: 'call', text: 'w.replace()', position: { x: 0, y: 360 } },
        { id: 'show', type: 'output', text: 'b.value', position: { x: 0, y: 480 } },
        { id: 'end', type: 'return', text: 'w', position: { x: 0, y: 600 } },
      ],
      edges: [
        { id: 'wrapper-replace', source: 'wrapper', target: 'replace' },
        { id: 'replace-1', source: 'replace', target: 'set-child' },
        { id: 'replace-2', source: 'set-child', target: 'replace-end' },
        { id: 'main-1', source: 'main', target: 'make-box' },
        { id: 'main-2', source: 'make-box', target: 'make-wrapper' },
        { id: 'main-3', source: 'make-wrapper', target: 'call' },
        { id: 'main-4', source: 'call', target: 'show' },
        { id: 'main-5', source: 'show', target: 'end' },
      ],
    }

    const state = runExecution(createExecution(program, []))

    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['8'])
  })

  it('keeps short-circuit Method call sites distinct while replaying', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'gate', type: 'class', text: 'Gate(flag, hits)', position: { x: 400, y: 0 } },
        { id: 'a', type: 'method', text: 'a', position: { x: 650, y: 0 } },
        {
          id: 'clear-flag',
          type: 'assignment',
          text: 'flag <- False',
          position: { x: 650, y: 100 },
        },
        { id: 'a-end', type: 'return', text: 'False', position: { x: 650, y: 200 } },
        { id: 'b', type: 'method', text: 'b', position: { x: 900, y: 0 } },
        {
          id: 'count-hit',
          type: 'assignment',
          text: 'hits <- hits + 1',
          position: { x: 900, y: 100 },
        },
        { id: 'b-end', type: 'return', text: 'True', position: { x: 900, y: 200 } },
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'make',
          type: 'assignment',
          text: 'p <- Gate(True, 0)',
          position: { x: 0, y: 100 },
        },
        {
          id: 'show-result',
          type: 'output',
          text: 'p.flag and p.a() or p.b()',
          position: { x: 0, y: 200 },
        },
        { id: 'show-hits', type: 'output', text: 'p.hits', position: { x: 0, y: 300 } },
        { id: 'end', type: 'return', text: 'p', position: { x: 0, y: 400 } },
      ],
      edges: [
        { id: 'gate-a', source: 'gate', target: 'a' },
        { id: 'gate-b', source: 'gate', target: 'b' },
        { id: 'a-1', source: 'a', target: 'clear-flag' },
        { id: 'a-2', source: 'clear-flag', target: 'a-end' },
        { id: 'b-1', source: 'b', target: 'count-hit' },
        { id: 'b-2', source: 'count-hit', target: 'b-end' },
        { id: 'main-1', source: 'main', target: 'make' },
        { id: 'main-2', source: 'make', target: 'show-result' },
        { id: 'main-3', source: 'show-result', target: 'show-hits' },
        { id: 'main-4', source: 'show-hits', target: 'end' },
      ],
    }

    const state = runExecution(createExecution(program, []))

    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['True', '1'])
    expect(state.objectHeap[1]?.fields).toEqual({ flag: false, hits: 1 })
  })

  it('preserves one rand value while replaying around nested calls', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set-value',
          type: 'assignment',
          text: 'value <- keep_first(rand(), helper())',
          position: { x: 0, y: 100 },
        },
        { id: 'show', type: 'output', text: 'value', position: { x: 0, y: 200 } },
        { id: 'main-end', type: 'return', text: 'value', position: { x: 0, y: 300 } },
        { id: 'helper', type: 'function', text: 'helper', position: { x: 350, y: 0 } },
        { id: 'helper-end', type: 'return', text: '0', position: { x: 350, y: 100 } },
        {
          id: 'keep-first',
          type: 'function',
          text: 'keep_first',
          position: { x: 650, y: 0 },
        },
        { id: 'first-input', type: 'input', text: 'first', position: { x: 650, y: 100 } },
        { id: 'second-input', type: 'input', text: 'second', position: { x: 650, y: 200 } },
        { id: 'keep-end', type: 'return', text: 'first', position: { x: 650, y: 300 } },
      ],
      edges: [
        { id: 'main-1', source: 'main', target: 'set-value' },
        { id: 'main-2', source: 'set-value', target: 'show' },
        { id: 'main-3', source: 'show', target: 'main-end' },
        { id: 'helper-1', source: 'helper', target: 'helper-end' },
        { id: 'keep-1', source: 'keep-first', target: 'first-input' },
        { id: 'keep-2', source: 'first-input', target: 'second-input' },
        { id: 'keep-3', source: 'second-input', target: 'keep-end' },
      ],
    }
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25)

    const state = runExecution(createExecution(program, []))
    const randomCalls = random.mock.calls.length
    random.mockRestore()

    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['0.25'])
    expect(randomCalls).toBe(1)
  })

  it('does not attach Methods from an imported Class that lost precedence', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'box', type: 'class', text: 'Box(value)', position: { x: 400, y: 0 } },
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'make', type: 'assignment', text: 'b <- Box(1)', position: { x: 0, y: 100 } },
        {
          id: 'call',
          type: 'assignment',
          text: 'result <- try_get(b)',
          position: { x: 0, y: 200 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 300 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'make' },
        { id: 'e2', source: 'make', target: 'call' },
        { id: 'e3', source: 'call', target: 'end' },
      ],
    }
    const importedProgram: Program = {
      version: 1,
      nodes: [
        { id: 'import-box', type: 'class', text: 'Box(value, other)', position: { x: 400, y: 0 } },
        { id: 'import-method', type: 'method', text: 'getOther', position: { x: 650, y: 0 } },
        { id: 'import-method-end', type: 'return', text: 'other', position: { x: 650, y: 100 } },
        { id: 'import-main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'import-main-end', type: 'return', text: '0', position: { x: 0, y: 100 } },
        {
          id: 'try-get',
          type: 'function',
          text: 'try_get',
          position: { x: 900, y: 0 },
        },
        { id: 'box-input', type: 'input', text: 'box', position: { x: 900, y: 100 } },
        {
          id: 'try-get-end',
          type: 'return',
          text: 'box.getOther()',
          position: { x: 900, y: 200 },
        },
      ],
      edges: [
        { id: 'box-method', source: 'import-box', target: 'import-method' },
        { id: 'm1', source: 'import-method', target: 'import-method-end' },
        { id: 'e1', source: 'import-main', target: 'import-main-end' },
        { id: 'f1', source: 'try-get', target: 'box-input' },
        { id: 'f2', source: 'box-input', target: 'try-get-end' },
      ],
    }

    const initialState = createExecution(program, [], {
      importedPrograms: [importedProgram],
    })
    const finalState = runExecution(initialState)

    expect(initialState.importedMethods).toEqual([])
    expect(finalState.error).toMatch(/Method "Box\.getOther" does not exist/i)
  })

  it('constructs imported Classes and dispatches their winning Methods', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'make', type: 'assignment', text: 'b <- Box(7)', position: { x: 0, y: 100 } },
        { id: 'show', type: 'output', text: 'b.get()', position: { x: 0, y: 200 } },
        { id: 'end', type: 'return', text: 'b', position: { x: 0, y: 300 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'make' },
        { id: 'e2', source: 'make', target: 'show' },
        { id: 'e3', source: 'show', target: 'end' },
      ],
    }
    const importedProgram: Program = {
      version: 1,
      nodes: [
        { id: 'box', type: 'class', text: 'Box(value)', position: { x: 400, y: 0 } },
        { id: 'get', type: 'method', text: 'get', position: { x: 650, y: 0 } },
        { id: 'get-end', type: 'return', text: 'value', position: { x: 650, y: 100 } },
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'main-end', type: 'return', text: '0', position: { x: 0, y: 100 } },
      ],
      edges: [
        { id: 'box-get', source: 'box', target: 'get' },
        { id: 'm1', source: 'get', target: 'get-end' },
        { id: 'e1', source: 'main', target: 'main-end' },
      ],
    }

    const finalState = runExecution(
      createExecution(program, [], { importedPrograms: [importedProgram] }),
    )

    expect(finalState.status).toBe('halted')
    expect(finalState.output).toEqual(['7'])
    expect(finalState.objectHeap[1]?.fields).toEqual({ value: 7 })
  })
})
