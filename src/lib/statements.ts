export const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const RESERVED_LANGUAGE_NAMES = new Set(['and', 'or', 'not', 'True', 'False'])

export type AssignmentTarget =
  | { kind: 'variable'; variable: string }
  | { kind: 'index'; variable: string; indexExpression: string }
  | { kind: 'member'; variable: string; member: string }

export type AssignmentStatement =
  | {
      target: Extract<AssignmentTarget, { kind: 'variable' }>
      expression: string
    }
  | {
      target: Extract<AssignmentTarget, { kind: 'index' }>
      expression: string
    }
  | {
      target: Extract<AssignmentTarget, { kind: 'member' }>
      expression: string
    }

export type IndexedAssignmentStatement = Extract<
  AssignmentStatement,
  { target: { kind: 'index' } }
>

export type MemberAssignmentStatement = Extract<
  AssignmentStatement,
  { target: { kind: 'member' } }
>

export interface ClassDeclaration {
  name: string
  fields: string[]
}

export interface MethodDeclaration {
  methodName: string
}

export interface ForStatement {
  variable: string
  iterableExpression: string
}

export interface ProcessStatementSource {
  kind: 'assignment' | 'call'
  text: string
  lineNumber: number
}

export function isVariableName(value: string): boolean {
  const name = value.trim()
  return VARIABLE_NAME_PATTERN.test(name) && !RESERVED_LANGUAGE_NAMES.has(name)
}

export function parseClassDeclaration(text: string): ClassDeclaration {
  const match = text.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/)

  if (!match) {
    throw new Error('Class must use the form: ClassName(field, ...)')
  }

  if (!isVariableName(match[1])) {
    throw new Error(`Class name "${match[1]}" must be a valid, non-reserved name`)
  }

  const fieldsText = match[2].trim()
  if (fieldsText === '') {
    return { name: match[1], fields: [] }
  }

  const fields = fieldsText.split(',').map((field) => field.trim())

  for (const field of fields) {
    if (!isVariableName(field)) {
      throw new Error(`Class field "${field}" must be a valid name`)
    }
  }

  const duplicate = fields.find(
    (field, index) => fields.indexOf(field) !== index,
  )
  if (duplicate !== undefined) {
    throw new Error(`Class has duplicate field "${duplicate}"`)
  }

  return { name: match[1], fields }
}

export function parseMethodDeclaration(text: string): MethodDeclaration {
  const methodName = text.trim()

  if (!isVariableName(methodName)) {
    throw new Error('Method name must be a valid, non-reserved name')
  }

  return { methodName }
}

export function parseAssignment(text: string): AssignmentStatement {
  const match = text.match(/^\s*(.+?)\s*<-\s*(.+?)\s*$/)

  if (!match) {
    throw new Error('Assignment must use the form: name <- expression')
  }

  const targetText = match[1].trim()

  if (isVariableName(targetText)) {
    return {
      target: { kind: 'variable', variable: targetText },
      expression: match[2],
    }
  }

  const memberTarget = targetText.match(
    /^([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)$/,
  )

  if (memberTarget) {
    return {
      target: {
        kind: 'member',
        variable: memberTarget[1],
        member: memberTarget[2],
      },
      expression: match[2],
    }
  }

  const indexTarget = targetText.match(
    /^([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(.+?)\s*\]$/,
  )

  if (!indexTarget) {
    throw new Error(
      'Assignment target must be a variable, a single object member (object.field), or an indexed value (name[index])',
    )
  }

  return {
    target: {
      kind: 'index',
      variable: indexTarget[1],
      indexExpression: indexTarget[2],
    },
    expression: match[2],
  }
}

export function parseForLoop(text: string): ForStatement {
  const match = text.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+?)\s*$/)

  if (!match) {
    throw new Error('For must use the form: item in stringOrList')
  }

  return {
    variable: match[1],
    iterableExpression: match[2],
  }
}

export function splitProcessStatements(text: string): ProcessStatementSource[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const statement = line.trim()

    if (!statement) {
      return []
    }

    return [
      {
        kind: hasAssignmentArrow(statement) ? 'assignment' : 'call',
        text: statement,
        lineNumber: index + 1,
      },
    ]
  })
}

function hasAssignmentArrow(statement: string): boolean {
  let quote: '"' | "'" | null = null

  for (let index = 0; index < statement.length - 1; index += 1) {
    const character = statement[index]

    if (quote) {
      if (character === '\\') {
        index += 1
      } else if (character === quote) {
        quote = null
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
    } else if (character === '<' && statement[index + 1] === '-') {
      return true
    }
  }

  return false
}
