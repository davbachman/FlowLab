export const TEXT_LIBRARY_NAME = 'text'

export const TEXT_FUNCTION_NAMES = ['text_from_url'] as const

export type TextFunctionName = (typeof TEXT_FUNCTION_NAMES)[number]

const TEXT_FUNCTION_SET = new Set<string>(TEXT_FUNCTION_NAMES)

export function isTextFunctionName(name: string): name is TextFunctionName {
  return TEXT_FUNCTION_SET.has(name)
}

export function validateTextFromUrlArguments(args: unknown[]): string {
  if (args.length !== 1 || typeof args[0] !== 'string') {
    throw new Error('text_from_url requires exactly one string URL')
  }

  return args[0]
}
