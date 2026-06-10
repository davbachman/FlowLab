import {
  getDictionaryValue,
  isDictionaryKey,
  isRuntimeDictionary,
  setDictionaryValue,
  stringifyValue,
  toBoolean,
  valuesEqual,
} from './runtimeValues'
import type { DictionaryKey, Environment, RuntimeDictionary, RuntimeValue } from './types'

export { stringifyValue, toBoolean } from './runtimeValues'

type TokenType =
  | 'number'
  | 'string'
  | 'identifier'
  | 'operator'
  | 'leftParen'
  | 'rightParen'
  | 'leftBracket'
  | 'rightBracket'
  | 'leftBrace'
  | 'rightBrace'
  | 'colon'
  | 'comma'
  | 'eof'

interface Token {
  type: TokenType
  value: string
}

type Expression =
  | { kind: 'literal'; value: RuntimeValue }
  | { kind: 'variable'; name: string }
  | { kind: 'list'; items: Expression[] }
  | {
      kind: 'dictionary'
      entries: Array<{ key: DictionaryKey; value: Expression }>
    }
  | { kind: 'index'; target: Expression; index: Expression }
  | { kind: 'call'; name: string; arguments: Expression[] }
  | { kind: 'unary'; operator: '-' | 'not'; right: Expression }
  | { kind: 'binary'; operator: string; left: Expression; right: Expression }

const COMPARISON_OPERATORS = new Set(['<', '<=', '>', '>=', '=', '==', '!='])
const WORD_OPERATORS = new Set(['and', 'or', 'not'])
const BUILT_IN_FUNCTIONS = new Set(['sqrt', 'rand', 'ask'])

export interface ExpressionEvaluationContext {
  callFunction?: (name: string, args: RuntimeValue[]) => RuntimeValue
}

export function parseExpression(source: string): Expression {
  const parser = new Parser(tokenize(source))
  return parser.parse()
}

export function parseCallExpression(source: string): {
  name: string
  arguments: RuntimeValue[]
} {
  const expression = parseExpression(source)

  if (expression.kind !== 'call') {
    throw new Error('Call must contain a function call')
  }

  return {
    name: expression.name,
    arguments: [],
  }
}

export function evaluateExpression(
  source: string,
  environment: Environment,
  context: ExpressionEvaluationContext = {},
): RuntimeValue {
  return evaluate(parseExpression(source), environment, context)
}

export function findExpressionCallNames(source: string): string[] {
  const names = new Set<string>()
  collectCallNames(parseExpression(source), names)
  return [...names]
}

export function isBuiltInFunctionName(name: string): boolean {
  return BUILT_IN_FUNCTIONS.has(name)
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    if (char === '(') {
      tokens.push({ type: 'leftParen', value: char })
      index += 1
      continue
    }

    if (char === ')') {
      tokens.push({ type: 'rightParen', value: char })
      index += 1
      continue
    }

    if (char === '[') {
      tokens.push({ type: 'leftBracket', value: char })
      index += 1
      continue
    }

    if (char === ']') {
      tokens.push({ type: 'rightBracket', value: char })
      index += 1
      continue
    }

    if (char === '{') {
      tokens.push({ type: 'leftBrace', value: char })
      index += 1
      continue
    }

    if (char === '}') {
      tokens.push({ type: 'rightBrace', value: char })
      index += 1
      continue
    }

    if (char === ':') {
      tokens.push({ type: 'colon', value: char })
      index += 1
      continue
    }

    if (char === ',') {
      tokens.push({ type: 'comma', value: char })
      index += 1
      continue
    }

    if (char === '"' || char === "'") {
      const result = readString(source, index)
      tokens.push({ type: 'string', value: result.value })
      index = result.nextIndex
      continue
    }

    if (isNumberStart(source, index)) {
      const result = readNumber(source, index)
      tokens.push({ type: 'number', value: result.value })
      index = result.nextIndex
      continue
    }

    if (/[A-Za-z_]/.test(char)) {
      const result = readIdentifier(source, index)
      tokens.push({
        type: WORD_OPERATORS.has(result.value) ? 'operator' : 'identifier',
        value: result.value,
      })
      index = result.nextIndex
      continue
    }

    const twoChar = source.slice(index, index + 2)
    if (['<=', '>=', '==', '!='].includes(twoChar)) {
      tokens.push({ type: 'operator', value: twoChar })
      index += 2
      continue
    }

    if (['+', '-', '*', '/', '<', '>', '='].includes(char)) {
      tokens.push({ type: 'operator', value: char })
      index += 1
      continue
    }

    throw new Error(`Unexpected character "${char}"`)
  }

  tokens.push({ type: 'eof', value: '' })
  return tokens
}

function readString(
  source: string,
  startIndex: number,
): { value: string; nextIndex: number } {
  const quote = source[startIndex]
  let value = ''
  let index = startIndex + 1

  while (index < source.length) {
    const char = source[index]

    if (char === quote) {
      return { value, nextIndex: index + 1 }
    }

    if (char === '\\') {
      const escaped = source[index + 1]
      if (escaped === undefined) {
        throw new Error('Unterminated string literal')
      }

      const escapes: Record<string, string> = {
        n: '\n',
        t: '\t',
        '"': '"',
        "'": "'",
        '\\': '\\',
      }
      value += escapes[escaped] ?? escaped
      index += 2
      continue
    }

    value += char
    index += 1
  }

  throw new Error('Unterminated string literal')
}

function isNumberStart(source: string, index: number): boolean {
  return (
    /\d/.test(source[index]) ||
    (source[index] === '.' && /\d/.test(source[index + 1] ?? ''))
  )
}

function readNumber(
  source: string,
  startIndex: number,
): { value: string; nextIndex: number } {
  let index = startIndex
  let hasDot = false

  while (index < source.length) {
    const char = source[index]
    if (char === '.') {
      if (hasDot) {
        break
      }
      hasDot = true
      index += 1
      continue
    }

    if (!/\d/.test(char)) {
      break
    }

    index += 1
  }

  return { value: source.slice(startIndex, index), nextIndex: index }
}

function readIdentifier(
  source: string,
  startIndex: number,
): { value: string; nextIndex: number } {
  let index = startIndex

  while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) {
    index += 1
  }

  return { value: source.slice(startIndex, index), nextIndex: index }
}

class Parser {
  private position = 0
  private readonly tokens: Token[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  parse(): Expression {
    const expression = this.or()
    if (this.peek().type !== 'eof') {
      throw new Error(`Unexpected token "${this.peek().value}"`)
    }
    return expression
  }

  private or(): Expression {
    let expression = this.and()

    while (this.peek().type === 'operator' && this.peek().value === 'or') {
      const operator = this.advance().value
      const right = this.and()
      expression = { kind: 'binary', operator, left: expression, right }
    }

    return expression
  }

  private and(): Expression {
    let expression = this.not()

    while (this.peek().type === 'operator' && this.peek().value === 'and') {
      const operator = this.advance().value
      const right = this.not()
      expression = { kind: 'binary', operator, left: expression, right }
    }

    return expression
  }

  private not(): Expression {
    if (this.peek().type === 'operator' && this.peek().value === 'not') {
      this.advance()
      return { kind: 'unary', operator: 'not', right: this.not() }
    }

    return this.comparison()
  }

  private comparison(): Expression {
    let expression = this.additive()

    while (
      this.peek().type === 'operator' &&
      COMPARISON_OPERATORS.has(this.peek().value)
    ) {
      const operator = this.advance().value
      const right = this.additive()
      expression = { kind: 'binary', operator, left: expression, right }
    }

    return expression
  }

  private additive(): Expression {
    let expression = this.multiplicative()

    while (
      this.peek().type === 'operator' &&
      ['+', '-'].includes(this.peek().value)
    ) {
      const operator = this.advance().value
      const right = this.multiplicative()
      expression = { kind: 'binary', operator, left: expression, right }
    }

    return expression
  }

  private multiplicative(): Expression {
    let expression = this.unary()

    while (
      this.peek().type === 'operator' &&
      ['*', '/'].includes(this.peek().value)
    ) {
      const operator = this.advance().value
      const right = this.unary()
      expression = { kind: 'binary', operator, left: expression, right }
    }

    return expression
  }

  private unary(): Expression {
    if (this.peek().type === 'operator' && this.peek().value === '-') {
      this.advance()
      return { kind: 'unary', operator: '-', right: this.unary() }
    }

    return this.postfix()
  }

  private postfix(): Expression {
    let expression = this.primary()

    while (this.peek().type === 'leftBracket') {
      this.advance()
      const index = this.or()
      this.consume('rightBracket', 'Expected "]"')
      expression = { kind: 'index', target: expression, index }
    }

    return expression
  }

  private primary(): Expression {
    const token = this.advance()

    if (token.type === 'number') {
      return { kind: 'literal', value: Number(token.value) }
    }

    if (token.type === 'string') {
      return { kind: 'literal', value: token.value }
    }

    if (token.type === 'identifier') {
      if (token.value === 'True') {
        return { kind: 'literal', value: true }
      }

      if (token.value === 'False') {
        return { kind: 'literal', value: false }
      }

      if (this.peek().type === 'leftParen') {
        return this.call(token.value)
      }

      return { kind: 'variable', name: token.value }
    }

    if (token.type === 'leftParen') {
      const expression = this.or()
      this.consume('rightParen', 'Expected ")"')
      return expression
    }

    if (token.type === 'leftBracket') {
      return { kind: 'list', items: this.listItems() }
    }

    if (token.type === 'leftBrace') {
      return { kind: 'dictionary', entries: this.dictionaryEntries() }
    }

    throw new Error(
      token.type === 'eof'
        ? 'Expected expression'
        : `Unexpected token "${token.value}"`,
    )
  }

  private call(name: string): Expression {
    this.consume('leftParen', 'Expected "("')
    const args: Expression[] = []

    if (this.peek().type !== 'rightParen') {
      while (true) {
        args.push(this.or())

        if (this.peek().type !== 'comma') {
          break
        }

        this.advance()
      }
    }

    this.consume('rightParen', 'Expected ")"')
    return { kind: 'call', name, arguments: args }
  }

  private listItems(): Expression[] {
    const items: Expression[] = []

    if (this.peek().type === 'rightBracket') {
      this.advance()
      return items
    }

    while (true) {
      items.push(this.or())

      if (this.peek().type !== 'comma') {
        break
      }

      this.advance()
    }

    this.consume('rightBracket', 'Expected "]"')
    return items
  }

  private dictionaryEntries(): Array<{ key: DictionaryKey; value: Expression }> {
    const entries: Array<{ key: DictionaryKey; value: Expression }> = []

    if (this.peek().type === 'rightBrace') {
      this.advance()
      return entries
    }

    while (true) {
      const key = this.dictionaryKey()
      this.consume('colon', 'Expected ":"')
      const value = this.or()
      entries.push({ key, value })

      if (this.peek().type !== 'comma') {
        break
      }

      this.advance()
    }

    this.consume('rightBrace', 'Expected "}"')
    return entries
  }

  private dictionaryKey(): DictionaryKey {
    const token = this.advance()

    if (token.type === 'string') {
      return token.value
    }

    if (token.type === 'number') {
      return Number(token.value)
    }

    if (token.type === 'operator' && token.value === '-') {
      const number = this.consume('number', 'Expected dictionary key')
      return -Number(number.value)
    }

    if (token.type === 'identifier') {
      if (token.value === 'True') {
        return true
      }

      if (token.value === 'False') {
        return false
      }
    }

    throw new Error('Dictionary keys must be strings, numbers, or booleans')
  }

  private consume(type: TokenType, message: string): Token {
    if (this.peek().type === type) {
      return this.advance()
    }

    throw new Error(message)
  }

  private advance(): Token {
    const token = this.tokens[this.position]
    this.position += 1
    return token
  }

  private peek(): Token {
    return this.tokens[this.position]
  }
}

function collectCallNames(expression: Expression, names: Set<string>): void {
  switch (expression.kind) {
    case 'literal':
    case 'variable':
      return
    case 'list':
      for (const item of expression.items) {
        collectCallNames(item, names)
      }
      return
    case 'dictionary':
      for (const entry of expression.entries) {
        collectCallNames(entry.value, names)
      }
      return
    case 'index':
      collectCallNames(expression.target, names)
      collectCallNames(expression.index, names)
      return
    case 'call':
      names.add(expression.name)
      for (const argument of expression.arguments) {
        collectCallNames(argument, names)
      }
      return
    case 'unary':
      collectCallNames(expression.right, names)
      return
    case 'binary':
      collectCallNames(expression.left, names)
      collectCallNames(expression.right, names)
  }
}

function evaluate(
  expression: Expression,
  environment: Environment,
  context: ExpressionEvaluationContext,
): RuntimeValue {
  switch (expression.kind) {
    case 'literal':
      return expression.value
    case 'variable':
      if (!Object.prototype.hasOwnProperty.call(environment, expression.name)) {
        throw new Error(`Undefined variable "${expression.name}"`)
      }
      return environment[expression.name]
    case 'list':
      return expression.items.map((item) => evaluate(item, environment, context))
    case 'dictionary':
      return expression.entries.reduce<RuntimeDictionary>(
        (dictionary, entry) =>
          setDictionaryValue(
            dictionary,
            entry.key,
            evaluate(entry.value, environment, context),
          ),
        { kind: 'dictionary', entries: [] },
      )
    case 'index':
      return evaluateIndex(expression, environment, context)
    case 'call':
      return evaluateCall(expression, environment, context)
    case 'unary':
      if (expression.operator === 'not') {
        return !toBoolean(evaluate(expression.right, environment, context))
      }
      return -requireNumber(evaluate(expression.right, environment, context), '-')
    case 'binary':
      return evaluateBinary(expression, environment, context)
  }
}

function evaluateCall(
  expression: Extract<Expression, { kind: 'call' }>,
  environment: Environment,
  context: ExpressionEvaluationContext,
): RuntimeValue {
  const args = expression.arguments.map((argument) =>
    evaluate(argument, environment, context),
  )

  if (expression.name === 'sqrt') {
    const argument = requireSingleArgument(expression.name, args)
    const number = requireNumber(argument, 'sqrt')
    if (number < 0) {
      throw new Error('sqrt requires a nonnegative number')
    }

    return Math.sqrt(number)
  }

  if (expression.name === 'rand') {
    if (args.length !== 0) {
      throw new Error('rand requires no arguments')
    }

    return Math.random()
  }

  if (context.callFunction) {
    return context.callFunction(expression.name, args)
  }

  throw new Error(`Unknown function "${expression.name}"`)
}

function requireSingleArgument(name: string, args: RuntimeValue[]): RuntimeValue {
  if (args.length !== 1) {
    throw new Error(`${name} requires exactly one argument`)
  }

  return args[0]
}

function evaluateIndex(
  expression: Extract<Expression, { kind: 'index' }>,
  environment: Environment,
  context: ExpressionEvaluationContext,
): RuntimeValue {
  const target = evaluate(expression.target, environment, context)
  const indexValue = evaluate(expression.index, environment, context)

  if (typeof target === 'string') {
    const index = requireIndex(indexValue)
    if (index >= target.length) {
      throw new Error(`Index ${index} is out of range`)
    }

    return target[index]
  }

  if (Array.isArray(target)) {
    const index = requireIndex(indexValue)
    if (index >= target.length) {
      throw new Error(`Index ${index} is out of range`)
    }

    return target[index]
  }

  if (isRuntimeDictionary(target)) {
    if (!isDictionaryKey(indexValue)) {
      throw new Error('Dictionary keys must be strings, numbers, or booleans')
    }

    return getDictionaryValue(target, indexValue)
  }

  throw new Error('Indexing requires a list, string, or dictionary')
}

function evaluateBinary(
  expression: Extract<Expression, { kind: 'binary' }>,
  environment: Environment,
  context: ExpressionEvaluationContext,
): RuntimeValue {
  const operator = expression.operator

  if (operator === 'and') {
    return (
      toBoolean(evaluate(expression.left, environment, context)) &&
      toBoolean(evaluate(expression.right, environment, context))
    )
  }

  if (operator === 'or') {
    return (
      toBoolean(evaluate(expression.left, environment, context)) ||
      toBoolean(evaluate(expression.right, environment, context))
    )
  }

  const left = evaluate(expression.left, environment, context)
  const right = evaluate(expression.right, environment, context)

  if (operator === '+') {
    if (typeof left === 'number' && typeof right === 'number') {
      return left + right
    }

    if (Array.isArray(left) && Array.isArray(right)) {
      return [...left, ...right]
    }

    return stringifyValue(left) + stringifyValue(right)
  }

  if (operator === '-') {
    return requireNumber(left, '-') - requireNumber(right, '-')
  }

  if (operator === '*') {
    return requireNumber(left, '*') * requireNumber(right, '*')
  }

  if (operator === '/') {
    const divisor = requireNumber(right, '/')
    if (divisor === 0) {
      throw new Error('Division by zero')
    }
    return requireNumber(left, '/') / divisor
  }

  return compareValues(left, right, operator)
}

function compareValues(
  left: RuntimeValue,
  right: RuntimeValue,
  operator: string,
): boolean {
  if (operator === '=' || operator === '==') {
    return valuesEqual(left, right)
  }

  if (operator === '!=') {
    return !valuesEqual(left, right)
  }

  const leftNumber = requireNumber(left, operator)
  const rightNumber = requireNumber(right, operator)

  switch (operator) {
    case '<':
      return leftNumber < rightNumber
    case '<=':
      return leftNumber <= rightNumber
    case '>':
      return leftNumber > rightNumber
    case '>=':
      return leftNumber >= rightNumber
    default:
      throw new Error(`Unknown operator "${operator}"`)
  }
}

function requireNumber(value: RuntimeValue, operator: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Operator "${operator}" requires numbers`)
  }

  return value
}

function requireIndex(value: RuntimeValue): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('Index must be a number')
  }

  return value
}
