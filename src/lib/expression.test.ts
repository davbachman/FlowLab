import { describe, expect, it } from 'vitest'
import { evaluateExpression } from './expression'

describe('evaluateExpression', () => {
  it('uses arithmetic precedence and parentheses', () => {
    expect(evaluateExpression('2 + 3 * 4', {})).toBe(14)
    expect(evaluateExpression('(2 + 3) * 4', {})).toBe(20)
  })

  it('supports variables, mod, and subtraction', () => {
    expect(evaluateExpression('x mod 4 + y - 1', { x: 14, y: 2 })).toBe(3)
  })

  it('supports exponentiation and numeric functions', () => {
    expect(evaluateExpression('2 + 3**2 * 2', {})).toBe(20)
    expect(evaluateExpression('2**3**2', {})).toBe(512)
    expect(evaluateExpression('sqrt(9) + abs(-4)', {})).toBe(7)
  })

  it('supports string literals and concatenation', () => {
    expect(evaluateExpression('"Hello, " + name', { name: 'Ada' })).toBe(
      'Hello, Ada',
    )
  })

  it('supports list literals and zero-based list indexing', () => {
    expect(evaluateExpression('[1, 2, 3][2]', {})).toBe(3)
    expect(evaluateExpression('L[2] = 3', { L: [1, 2, 3] })).toBe(true)
    expect(evaluateExpression('L[0] + L[2]', { L: [1, 2, 3] })).toBe(4)
  })

  it('uses addition to concatenate lists', () => {
    expect(evaluateExpression('[1, 2] + [3, 4]', {})).toEqual([1, 2, 3, 4])
    expect(evaluateExpression('L + [4]', { L: [1, 2, 3] })).toEqual([
      1,
      2,
      3,
      4,
    ])
  })

  it('supports len for strings and lists', () => {
    expect(evaluateExpression('len(S)', { S: 'cat' })).toBe(3)
    expect(evaluateExpression('len(L + [4])', { L: [1, 2, 3] })).toBe(4)
  })

  it('passes multiple evaluated arguments to custom function calls', () => {
    const result = evaluateExpression(
      `helper([1, 2, 3], 'hello', n + 1)`,
      { n: 6 },
      {
        callFunction: (name, args) => {
          expect(name).toBe('helper')
          expect(args).toEqual([[1, 2, 3], 'hello', 7])
          return 15
        },
      },
    )

    expect(result).toBe(15)
  })

  it('supports zero-based string indexing', () => {
    expect(evaluateExpression('S[1]', { S: 'cat' })).toBe('a')
    expect(evaluateExpression('S[2] = "t"', { S: 'cat' })).toBe(true)
  })

  it('supports numeric comparisons', () => {
    expect(evaluateExpression('x <= 10', { x: 10 })).toBe(true)
    expect(evaluateExpression('x != 10', { x: 10 })).toBe(false)
  })

  it('supports and, or, and not logical operators', () => {
    expect(evaluateExpression('x > 0 and y > 0', { x: 3, y: 4 })).toBe(true)
    expect(evaluateExpression('x > 0 and y > 0', { x: 3, y: 0 })).toBe(false)
    expect(evaluateExpression('x > 0 or y > 0', { x: 0, y: 4 })).toBe(true)
    expect(evaluateExpression('not x < 10', { x: 12 })).toBe(true)
  })

  it('supports True and False boolean constants', () => {
    expect(evaluateExpression('True', {})).toBe(true)
    expect(evaluateExpression('False', {})).toBe(false)
    expect(evaluateExpression('True and not False', {})).toBe(true)
  })

  it('gives and higher precedence than or', () => {
    expect(evaluateExpression('0 or 1 and 0', {})).toBe(false)
    expect(evaluateExpression('(0 or 1) and 0', {})).toBe(false)
    expect(evaluateExpression('1 or 0 and 0', {})).toBe(true)
  })

  it('throws clear runtime errors', () => {
    expect(() => evaluateExpression('missing + 1', {})).toThrow(
      /Undefined variable "missing"/,
    )
    expect(() => evaluateExpression('10 / 0', {})).toThrow(/Division by zero/)
    expect(() => evaluateExpression('L["x"]', { L: [1, 2, 3] })).toThrow(
      /Index must be a number/,
    )
    expect(() => evaluateExpression('L[3]', { L: [1, 2, 3] })).toThrow(
      /Index 3 is out of range/,
    )
    expect(() => evaluateExpression('sqrt(-1)', {})).toThrow(
      /sqrt requires a nonnegative number/,
    )
    expect(() => evaluateExpression('len(5)', {})).toThrow(
      /len requires a string or list/,
    )
  })
})
