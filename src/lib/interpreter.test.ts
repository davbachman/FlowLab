import { describe, expect, it } from 'vitest'
import {
  createExecution,
  runExecution,
  stepExecution,
} from './interpreter'
import type { Program } from './types'

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
          text: 'result <- len(L) + len(word) + n',
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
    expect(finalState.environment.total).toBe(15)
    expect(finalState.output).toEqual(['15'])
    expect(finalState.returnValue).toBe(15)
    expect(finalState.currentNodeId).toBe('main-end')
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
          text: 'result <- len(L) + len(word) + n',
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
    expect(state.environment.result).toBe(15)

    state = stepExecution(state)
    expect(state.currentNodeId).toBe('output')
    expect(state.environment.total).toBe(15)
    expect(state.inputQueue).toEqual([])
    expect(state.callStack).toHaveLength(0)
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
})
