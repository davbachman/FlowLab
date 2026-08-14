import { describe, expect, it } from 'vitest'
import {
  bankAccountProgram,
  dictionaryInventoryProgram,
  listStatisticsProgram,
  numberGuessProgram,
  processBasicsProgram,
  turtlePolygonProgram,
} from './additionalSamplePrograms'
import { FLOWLAB_EXAMPLES } from './examples'
import {
  answerAskExecution,
  createExecution,
  runExecution,
} from './interpreter'
import { stringifyValue } from './runtimeValues'
import { TURTLE_COMMAND_NAMES, TURTLE_LIBRARY_NAME } from './turtle'
import { validateProgram } from './validation'

describe('additional sample programs', () => {
  it('keeps every Examples menu program valid', () => {
    for (const example of FLOWLAB_EXAMPLES) {
      const result = validateProgram(example.program, {
        externalFunctionNames: new Set(
          example.requiredImports.includes(TURTLE_LIBRARY_NAME)
            ? TURTLE_COMMAND_NAMES
            : [],
        ),
      })

      expect(result.errors, example.label).toEqual([])
    }
  })

  it('runs Process Basics and calculates an area', () => {
    const state = runExecution(createExecution(processBasicsProgram, []))

    expect(state.status).toBe('halted')
    expect(state.environment).toMatchObject({
      width: 8,
      height: 5,
      area: 40,
      label: 'Area: 40',
    })
    expect(state.output).toEqual(['Area: 40'])
  })

  it('runs Number Guess through its exact-match branch', () => {
    const asking = runExecution(createExecution(numberGuessProgram, []))
    const target = asking.environment.target

    expect(asking.status).toBe('asking')
    expect(typeof target).toBe('number')

    const state = runExecution(
      answerAskExecution(asking, String(target)),
    )

    expect(state.status).toBe('halted')
    expect(state.output).toEqual([
      'Guess a number between 0 and 1',
      `Correct! The number was ${target}`,
    ])
  })

  it('runs List Statistics and produces all four statistics', () => {
    const state = runExecution(createExecution(listStatisticsProgram, []))

    expect(state.status).toBe('halted')
    expect(stringifyValue(state.environment.stats)).toBe(
      '{"count": 5, "sum": 22, "largest": 8, "average": 4.4}',
    )
    expect(state.output).toEqual([
      '{"count": 5, "sum": 22, "largest": 8, "average": 4.4}',
    ])
  })

  it('runs Dictionary Inventory and iterates updated stock', () => {
    const state = runExecution(
      createExecution(dictionaryInventoryProgram, []),
    )

    expect(state.status).toBe('halted')
    expect(stringifyValue(state.environment.inventory)).toBe(
      '{"apples": 5, "oranges": 4, "bread": 1}',
    )
    expect(state.output).toEqual([
      'apples: 5',
      'oranges: 4',
      'bread: 1',
      'Apple stock after delivery: 5',
    ])
  })

  it('runs the Bank Account Class methods and representation', () => {
    const state = runExecution(createExecution(bankAccountProgram, []))
    const account = state.environment.account

    expect(state.status).toBe('halted')
    expect(account).toMatchObject({ kind: 'object', className: 'Account' })
    expect(
      typeof account === 'object' &&
        !Array.isArray(account) &&
        'id' in account
        ? state.objectHeap[account.id]?.fields
        : undefined,
    ).toEqual({ owner: 'Ada', balance: 85 })
    expect(state.output).toEqual(['Ada: $85'])
  })

  it('runs Turtle Polygon and draws five sides', () => {
    const state = runExecution(
      createExecution(turtlePolygonProgram, [], {
        nativeLibraries: [TURTLE_LIBRARY_NAME],
      }),
    )

    expect(state.status).toBe('halted')
    expect(state.turtle?.segments).toHaveLength(5)
    expect(state.turtle?.x).toBeCloseTo(0)
    expect(state.turtle?.y).toBeCloseTo(0)
  })
})
