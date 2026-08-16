import type { RuntimeValue } from './types'

export const MATH_LIBRARY_NAME = 'math'

export const MATH_FUNCTION_NAMES = [
  'exp',
  'log',
  'log10',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
] as const

export type MathFunctionName = (typeof MATH_FUNCTION_NAMES)[number]

const MATH_FUNCTIONS = new Set<string>(MATH_FUNCTION_NAMES)

export function isMathFunctionName(name: string): name is MathFunctionName {
  return MATH_FUNCTIONS.has(name)
}

export function runMathFunction(
  name: MathFunctionName,
  args: RuntimeValue[],
): number {
  if (name === 'exp') {
    return requireFiniteResult(name, Math.exp(requireSingleNumber(name, args)))
  }

  if (name === 'log' || name === 'log10') {
    const number = requireSingleNumber(name, args)
    if (number <= 0) {
      throw new Error(`${name} requires a positive number`)
    }

    return name === 'log' ? Math.log(number) : Math.log10(number)
  }

  if (name === 'sin' || name === 'cos' || name === 'tan' || name === 'atan') {
    return Math[name](requireSingleNumber(name, args))
  }

  if (name === 'asin' || name === 'acos') {
    const number = requireSingleNumber(name, args)
    if (number < -1 || number > 1) {
      throw new Error(`${name} requires a number from -1 through 1`)
    }

    return Math[name](number)
  }

  if (args.length !== 2) {
    throw new Error('atan2 requires exactly two arguments')
  }

  return Math.atan2(
    requireNumber(args[0], name),
    requireNumber(args[1], name),
  )
}

function requireSingleNumber(name: string, args: RuntimeValue[]): number {
  if (args.length !== 1) {
    throw new Error(`${name} requires exactly one argument`)
  }

  return requireNumber(args[0], name)
}

function requireNumber(value: RuntimeValue, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} requires numbers`)
  }

  return value
}

function requireFiniteResult(name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} result is outside the supported Number range`)
  }

  return value
}
