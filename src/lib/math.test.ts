import { describe, expect, it } from 'vitest'
import { isMathFunctionName, runMathFunction } from './math'

describe('math library', () => {
  it('recognizes and evaluates every exported function', () => {
    expect(isMathFunctionName('sin')).toBe(true)
    expect(isMathFunctionName('sqrt')).toBe(false)
    expect(runMathFunction('exp', [1])).toBeCloseTo(Math.E)
    expect(runMathFunction('log', [Math.E])).toBeCloseTo(1)
    expect(runMathFunction('log10', [1000])).toBe(3)
    expect(runMathFunction('sin', [0])).toBe(0)
    expect(runMathFunction('cos', [0])).toBe(1)
    expect(runMathFunction('tan', [0])).toBe(0)
    expect(runMathFunction('asin', [1])).toBeCloseTo(Math.PI / 2)
    expect(runMathFunction('acos', [1])).toBe(0)
    expect(runMathFunction('atan', [1])).toBeCloseTo(Math.PI / 4)
    expect(runMathFunction('atan2', [1, 0])).toBeCloseTo(Math.PI / 2)
  })

  it('reports invalid arguments and out-of-range results clearly', () => {
    expect(() => runMathFunction('sin', ['zero'])).toThrow(/requires numbers/)
    expect(() => runMathFunction('atan2', [1])).toThrow(
      /atan2 requires exactly two arguments/,
    )
    expect(() => runMathFunction('asin', [2])).toThrow(
      /asin requires a number from -1 through 1/,
    )
    expect(() => runMathFunction('acos', [-2])).toThrow(
      /acos requires a number from -1 through 1/,
    )
    expect(() => runMathFunction('log', [0])).toThrow(
      /log requires a positive number/,
    )
    expect(() => runMathFunction('log10', [-1])).toThrow(
      /log10 requires a positive number/,
    )
    expect(() => runMathFunction('exp', [1000])).toThrow(
      /exp result is outside the supported Number range/,
    )
  })
})
