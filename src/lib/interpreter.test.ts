import { describe, expect, it, vi } from 'vitest'
import {
  answerAskExecution,
  completeTextLoadExecution,
  createExecution,
  runExecution,
  stepExecution,
} from './interpreter'
import type { Program, RuntimeDictionary } from './types'

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
    { id: 'move', type: 'method', text: 'Point.move', position: { x: 750, y: 0 } },
    { id: 'dx', type: 'input', text: 'dx', position: { x: 750, y: 100 } },
    { id: 'dy', type: 'input', text: 'dy', position: { x: 750, y: 200 } },
    {
      id: 'set-x',
      type: 'assignment',
      text: 'self.x <- self.x + dx',
      position: { x: 750, y: 300 },
    },
    {
      id: 'set-y',
      type: 'assignment',
      text: 'self.y <- self.y + dy',
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

describe('interpreter', () => {
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
        { id: 'choose', type: 'method', text: 'Counter.choose', position: { x: 650, y: 0 } },
        { id: 'first', type: 'input', text: 'first', position: { x: 650, y: 100 } },
        { id: 'ignored', type: 'input', text: 'ignored', position: { x: 650, y: 200 } },
        { id: 'choose-end', type: 'return', text: 'first', position: { x: 650, y: 300 } },
        { id: 'bump', type: 'method', text: 'Counter.bump', position: { x: 900, y: 0 } },
        {
          id: 'increment',
          type: 'assignment',
          text: 'self.value <- self.value + 1',
          position: { x: 900, y: 100 },
        },
        { id: 'bump-end', type: 'return', text: 'self.value', position: { x: 900, y: 200 } },
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

  it('keeps short-circuit Method call sites distinct while replaying', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'gate', type: 'class', text: 'Gate(flag, hits)', position: { x: 400, y: 0 } },
        { id: 'a', type: 'method', text: 'Gate.a', position: { x: 650, y: 0 } },
        {
          id: 'clear-flag',
          type: 'assignment',
          text: 'self.flag <- False',
          position: { x: 650, y: 100 },
        },
        { id: 'a-end', type: 'return', text: 'False', position: { x: 650, y: 200 } },
        { id: 'b', type: 'method', text: 'Gate.b', position: { x: 900, y: 0 } },
        {
          id: 'count-hit',
          type: 'assignment',
          text: 'self.hits <- self.hits + 1',
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
        { id: 'import-method', type: 'method', text: 'Box.getOther', position: { x: 650, y: 0 } },
        { id: 'import-method-end', type: 'return', text: 'self.other', position: { x: 650, y: 100 } },
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
        { id: 'get', type: 'method', text: 'Box.get', position: { x: 650, y: 0 } },
        { id: 'get-end', type: 'return', text: 'self.value', position: { x: 650, y: 100 } },
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'main-end', type: 'return', text: '0', position: { x: 0, y: 100 } },
      ],
      edges: [
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
