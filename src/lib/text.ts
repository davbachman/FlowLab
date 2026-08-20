export const TEXT_LIBRARY_NAME = 'text'

export const TEXT_FUNCTION_NAMES = [
  'text_from_url',
  'split_words',
  'chr',
  'ord',
] as const

export type TextFunctionName = (typeof TEXT_FUNCTION_NAMES)[number]

const TEXT_FUNCTION_SET = new Set<string>(TEXT_FUNCTION_NAMES)

export function isTextFunctionName(name: string): name is TextFunctionName {
  return TEXT_FUNCTION_SET.has(name)
}

export function runTextFunction(
  name: TextFunctionName,
  args: unknown[],
): string[] | string | number {
  if (name === 'split_words') {
    return splitWords(args)
  }

  if (name === 'chr') {
    return characterFromCode(args)
  }

  if (name === 'ord') {
    return characterCode(args)
  }

  throw new Error('text_from_url must be loaded asynchronously')
}

export function validateTextFromUrlArguments(args: unknown[]): string {
  if (args.length !== 1 || typeof args[0] !== 'string') {
    throw new Error('text_from_url requires exactly one string URL')
  }

  return args[0]
}

export function splitWords(args: unknown[]): string[] {
  if (args.length !== 1 || typeof args[0] !== 'string') {
    throw new Error('split_words requires exactly one string')
  }

  const text = args[0].trim()
  return text ? text.split(/\s+/) : []
}

export function characterFromCode(args: unknown[]): string {
  if (
    args.length !== 1 ||
    typeof args[0] !== 'number' ||
    !Number.isInteger(args[0]) ||
    args[0] < 0 ||
    args[0] > 0x10ffff
  ) {
    throw new Error('chr requires exactly one integer from 0 through 1114111')
  }

  return String.fromCodePoint(args[0])
}

export function characterCode(args: unknown[]): number {
  if (args.length !== 1 || typeof args[0] !== 'string') {
    throw new Error('ord requires exactly one string character')
  }

  const characters = [...args[0]]
  if (characters.length !== 1) {
    throw new Error('ord requires exactly one string character')
  }

  const code = characters[0].codePointAt(0)
  if (code === undefined) {
    throw new Error('ord requires exactly one string character')
  }

  return code
}
