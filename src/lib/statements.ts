export const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export type AssignmentTarget =
  | { kind: 'variable'; variable: string }
  | { kind: 'index'; variable: string; indexExpression: string }

export type AssignmentStatement =
  | {
      target: Extract<AssignmentTarget, { kind: 'variable' }>
      expression: string
    }
  | {
      target: Extract<AssignmentTarget, { kind: 'index' }>
      expression: string
    }

export type IndexedAssignmentStatement = Extract<
  AssignmentStatement,
  { target: { kind: 'index' } }
>

export interface ForStatement {
  variable: string
  iterableExpression: string
}

export function isVariableName(value: string): boolean {
  return VARIABLE_NAME_PATTERN.test(value.trim())
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

  const indexTarget = targetText.match(
    /^([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(.+?)\s*\]$/,
  )

  if (!indexTarget) {
    throw new Error(
      'Assignment must use the form: name <- expression or name[index] <- expression',
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
