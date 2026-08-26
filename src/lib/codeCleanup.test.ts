import { describe, expect, it } from 'vitest'
import { cleanUpProgram } from './codeCleanup'
import {
  createExecution,
  runExecution,
  type ExecutionState,
} from './interpreter'
import type {
  FlowNodeType,
  Program,
  ProgramEdge,
  ProgramNode,
} from './types'
import { validateProgram } from './validation'

function node(
  id: string,
  type: FlowNodeType,
  text: string,
  position: ProgramNode['position'] = { x: 0, y: 0 },
): ProgramNode {
  return { id, type, text, position }
}

function edge(
  id: string,
  source: string,
  target: string,
  label?: ProgramEdge['label'],
): ProgramEdge {
  return label === undefined
    ? { id, source, target }
    : { id, source, target, label }
}

function linearProcessProgram(): Program {
  return {
    version: 1,
    imports: '',
    inputQueue: 'unused saved input',
    nodes: [
      node('main', 'function', 'main', { x: 900, y: 700 }),
      {
        ...node('initialize', 'process', 'x <- 2', { x: -400, y: 20 }),
        comment: 'Keep this setup comment.',
        width: 360,
      },
      {
        ...node('calculate', 'process', 'y <- x * 3', { x: 1200, y: -80 }),
        comment: 'Keep this calculation comment.',
      },
      node('show', 'output', 'y', { x: 40, y: 10 }),
      node('return', 'return', 'y', { x: -300, y: 900 }),
    ],
    edges: [
      edge('entry', 'main', 'initialize'),
      edge('combine', 'initialize', 'calculate'),
      edge('show-result', 'calculate', 'show'),
      edge('finish', 'show', 'return'),
    ],
  }
}

function conditionalProgram(): Program {
  return {
    version: 1,
    nodes: [
      node('main', 'function', 'main'),
      node('seed', 'process', 'x <- 3'),
      node('default-label', 'process', 'label <- "unset"'),
      node('decision', 'if', 'x > 1'),
      node('true-label', 'process', 'label <- "large"'),
      node('true-score', 'process', 'score <- x * 2'),
      node('false-label', 'process', 'label <- "small"'),
      node('false-score', 'process', 'score <- x - 1'),
      node('show', 'output', 'label + ": " + score'),
      node('return', 'return', 'score'),
    ],
    edges: [
      edge('entry', 'main', 'seed'),
      edge('seed-default', 'seed', 'default-label'),
      edge('to-decision', 'default-label', 'decision'),
      edge('true', 'decision', 'true-label', 'true'),
      edge('true-next', 'true-label', 'true-score'),
      edge('true-join', 'true-score', 'show'),
      edge('false', 'decision', 'false-label', 'false'),
      edge('false-next', 'false-label', 'false-score'),
      edge('false-join', 'false-score', 'show'),
      edge('finish', 'show', 'return'),
    ],
  }
}

function nestedLoopProgram(): Program {
  return {
    version: 1,
    nodes: [
      node('main', 'function', 'main'),
      node('initialize-i', 'process', 'i <- 0'),
      node('initialize-total', 'process', 'total <- 0'),
      node('outer-loop', 'while', 'i < 3'),
      node('advance-outer', 'process', 'i <- i + 1'),
      node('initialize-j', 'process', 'j <- 0'),
      node('inner-loop', 'while', 'j < 2'),
      node('accumulate', 'process', 'total <- total + i'),
      node('advance-inner', 'process', 'j <- j + 1'),
      node('show', 'output', 'total'),
      node('return', 'return', 'total'),
    ],
    edges: [
      edge('entry', 'main', 'initialize-i'),
      edge('initialize', 'initialize-i', 'initialize-total'),
      edge('to-outer', 'initialize-total', 'outer-loop'),
      edge('outer-body', 'outer-loop', 'advance-outer', 'true'),
      edge('outer-body-next', 'advance-outer', 'initialize-j'),
      edge('to-inner', 'initialize-j', 'inner-loop'),
      edge('inner-body', 'inner-loop', 'accumulate', 'true'),
      edge('inner-body-next', 'accumulate', 'advance-inner'),
      edge('inner-back', 'advance-inner', 'inner-loop'),
      // A False edge may itself be a genuine back edge in a nested loop.
      edge('outer-back', 'inner-loop', 'outer-loop', 'false'),
      edge('outer-exit', 'outer-loop', 'show', 'false'),
      edge('finish', 'show', 'return'),
    ],
  }
}

function functionsAndMethodsProgram(): Program {
  return {
    version: 1,
    nodes: [
      node('counter-class', 'class', 'Counter(value)'),
      node('add-method', 'method', 'add'),
      node('delta-input', 'input', 'delta'),
      node('method-add', 'process', 'value <- value + delta'),
      node('method-bump', 'process', 'value <- value + 1'),
      node('method-return', 'return', 'value'),
      node('double-function', 'function', 'double'),
      node('number-input', 'input', 'number'),
      node('double-value', 'process', 'doubled <- number * 2'),
      node('double-copy', 'process', 'result <- doubled'),
      node('double-return', 'return', 'result'),
      node('main', 'function', 'main'),
      node('make-counter', 'process', 'counter <- Counter(2)'),
      node('call-method', 'process', 'answer <- counter.add(double(3))'),
      node('show', 'output', 'answer'),
      node('return', 'return', 'answer'),
    ],
    edges: [
      edge('class-method', 'counter-class', 'add-method'),
      edge('method-input', 'add-method', 'delta-input'),
      edge('method-first', 'delta-input', 'method-add'),
      edge('method-combine', 'method-add', 'method-bump'),
      edge('method-finish', 'method-bump', 'method-return'),
      edge('helper-input', 'double-function', 'number-input'),
      edge('helper-first', 'number-input', 'double-value'),
      edge('helper-combine', 'double-value', 'double-copy'),
      edge('helper-finish', 'double-copy', 'double-return'),
      edge('entry', 'main', 'make-counter'),
      edge('main-combine', 'make-counter', 'call-method'),
      edge('main-show', 'call-method', 'show'),
      edge('main-return', 'show', 'return'),
    ],
  }
}

function runtimeErrorProgram(): Program {
  return {
    version: 1,
    nodes: [
      node('main', 'function', 'main'),
      node('before-error', 'process', 'x <- 1'),
      node('error-site', 'process', 'y <- missing_value + x'),
      node('return', 'return', 'y'),
    ],
    edges: [
      edge('entry', 'main', 'before-error'),
      edge('combine', 'before-error', 'error-site'),
      edge('finish', 'error-site', 'return'),
    ],
  }
}

function usefulError(error: string | undefined): string | undefined {
  return error
    ?.replace(/^Process node "[^"]+", line \d+:\s*/i, '')
    .replace(/^\w+ node "[^"]+":\s*/i, '')
}

function errorCategory(error: string | undefined): string | undefined {
  const useful = usefulError(error)?.toLowerCase()
  if (!useful) {
    return undefined
  }
  if (useful.includes('is not defined')) {
    return 'undefined-variable'
  }
  if (useful.includes('maximum step count')) {
    return 'step-limit'
  }
  if (useful.includes('invalid')) {
    return 'validation'
  }
  return useful.split(':', 1)[0]
}

function observableState(state: ExecutionState) {
  return {
    status: state.status,
    output: state.output,
    returnValue: state.returnValue,
    environment: state.environment,
    objectHeap: state.objectHeap,
    inputQueue: state.inputQueue,
    errorCategory: errorCategory(state.error),
    usefulError: usefulError(state.error),
  }
}

function expectBehaviorPreserved(
  program: Program,
  expectedMergedNodeCount: number,
  inputQueue: string[] = [],
) {
  const validationBefore = validateProgram(program)
  const before = runExecution(createExecution(program, inputQueue))
  const cleanup = cleanUpProgram(program)
  const validationAfter = validateProgram(cleanup.program)
  const after = runExecution(createExecution(cleanup.program, inputQueue))

  expect(validationBefore.errors).toEqual([])
  expect(validationAfter).toEqual(validationBefore)
  expect(cleanup.mergedNodeCount).toBe(expectedMergedNodeCount)
  expect(observableState(after)).toEqual(observableState(before))

  return cleanup
}

describe('cleanUpProgram behavior preservation', () => {
  it.each([
    {
      name: 'a linear Process chain',
      program: linearProcessProgram(),
      mergedNodeCount: 1,
    },
    {
      name: 'both arms of a conditional',
      program: conditionalProgram(),
      mergedNodeCount: 3,
    },
    {
      name: 'simple and nested loop-back control flow',
      program: nestedLoopProgram(),
      mergedNodeCount: 3,
    },
    {
      name: 'Functions, a Class, and a Method',
      program: functionsAndMethodsProgram(),
      mergedNodeCount: 3,
    },
  ])('preserves validation and execution for $name', ({
    program,
    mergedNodeCount,
  }) => {
    expectBehaviorPreserved(program, mergedNodeCount)
  })

  it('preserves a runtime error after its node is absorbed', () => {
    const program = runtimeErrorProgram()
    const before = runExecution(createExecution(program, []))
    const cleanup = cleanUpProgram(program)
    const after = runExecution(createExecution(cleanup.program, []))

    expect(validateProgram(program).errors).toEqual([])
    expect(validateProgram(cleanup.program).errors).toEqual([])
    expect(cleanup.absorbedNodeIds.get('error-site')).toBe('before-error')
    expect(cleanup.mergedNodeCount).toBe(1)
    expect(before.status).toBe('error')
    expect(after.status).toBe('error')
    expect(before.error).toMatch(/Process node "error-site", line 1/i)
    expect(after.error).toMatch(/Process node "before-error", line 2/i)
    expect(observableState(after)).toEqual(observableState(before))
  })

  it('survives JSON save/reopen and is byte-stable on repeated cleanup', () => {
    const original = conditionalProgram()
    const first = expectBehaviorPreserved(original, 3)
    const saved = JSON.stringify(first.program)
    const reopened = JSON.parse(saved) as Program

    expect(reopened).toEqual(first.program)
    expect(validateProgram(reopened).errors).toEqual([])
    expect(observableState(runExecution(createExecution(reopened, [])))).toEqual(
      observableState(runExecution(createExecution(first.program, []))),
    )

    const second = cleanUpProgram(reopened)
    expect(second.changed).toBe(false)
    expect(second.mergedNodeCount).toBe(0)
    expect(second.program).toEqual(first.program)
    expect(JSON.stringify(second.program)).toBe(saved)
  })

  it('is stable across save/reopen where ephemeral DOM measurements are unavailable', () => {
    const input: Program = {
      version: 1,
      nodes: [
        node('main', 'function', 'main', { x: 900, y: 700 }),
        node('return', 'return', '0', { x: -100, y: -200 }),
      ],
      edges: [edge('entry', 'main', 'return')],
    }
    const first = cleanUpProgram(input)
    const reopened = JSON.parse(JSON.stringify(first.program)) as Program
    const second = cleanUpProgram(reopened)

    expect(
      first.program.nodes.find(({ id }) => id === 'return')?.position.y,
    ).toBe(250)
    expect(second.changed).toBe(false)
    expect(second.program).toEqual(first.program)
  })
})
