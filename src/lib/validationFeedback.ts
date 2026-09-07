import { attachedMethodDefinition } from './classMethods'
import { parseClassDeclaration } from './statements'
import { NODE_TYPE_LABELS, type Program, type ProgramNode } from './types'

export interface ValidationFeedback {
  id: string
  message: string
  originalMessage: string
  nodeId?: string
  edgeId?: string
  field?: 'text' | 'imports' | 'connections'
  lineNumber?: number
}

export function validationFeedbackForProgram(
  program: Program,
  errors: string[],
): ValidationFeedback[] {
  return errors.map((error, index) => {
    const node = nodeForError(program, error)
    const edge = program.edges.find((candidate) => error.includes(`Edge "${candidate.id}"`))
    const lineNumberText = error.match(/\bline\s+(\d+)/i)?.[1]
    const feedback: ValidationFeedback = {
      id: `validation-${index}`,
      message: error,
      originalMessage: error,
      ...(node ? { nodeId: node.id } : {}),
      ...(edge ? { edgeId: edge.id, nodeId: edge.source } : {}),
      ...(lineNumberText ? { lineNumber: Number(lineNumberText) } : {}),
    }

    if (/^Imports?\b/i.test(error)) {
      feedback.field = 'imports'
      return feedback
    }

    if (node) {
      const invalidText = error.includes(' has invalid text: ')
      const connectionError = /\bedges?\b|\breachable\b|\bconnect\b|\bincoming\b/i.test(error)
      feedback.field = invalidText || !connectionError ? 'text' : 'connections'
      const label = NODE_TYPE_LABELS[node.type]
      if (invalidText) {
        const detail = error.split(' has invalid text: ')[1]
        feedback.message = `${label}: ${friendlyTextError(node, detail, feedback.lineNumber)}`
      } else {
        feedback.message = error.replace(`${label} node "${node.id}"`, `${label} block`)
          .replace(`Node "${node.id}"`, `${label} block`)
          .replace('must have exactly 1 outgoing edge.', 'needs an outgoing connection.')
          .replace('must have exactly two outgoing edges labeled true and false.', 'needs both a True and a False connection.')
          .replace('must have one true edge and one false edge.', 'needs one True connection and one False connection.')
          .replace('is not reachable from any Function or Method.', 'needs a connection from a Function or Method path.')
      }
    }
    if (edge) {
      feedback.field = 'connections'
      feedback.message = error.replace(`Edge "${edge.id}"`, 'This connection')
    }
    return feedback
  })
}

function nodeForError(program: Program, error: string): ProgramNode | undefined {
  const directNode = program.nodes.find((node) =>
    error.includes(`node "${node.id}"`) || error.includes(`Node "${node.id}"`),
  )
  if (directNode) return directNode

  const functionName = error.match(/(?:Function (?:name )?|Function and Class cannot both use the name )"([^"]+)"/)?.[1]
  if (functionName) {
    return program.nodes.find((node) => node.type === 'function' && node.text.trim() === functionName)
  }

  const className = error.match(/Class (?:name )?"([^"]+)"/)?.[1]
  if (className) {
    return program.nodes.find((node) => {
      if (node.type !== 'class') return false
      try {
        return parseClassDeclaration(node.text).name === className
      } catch {
        return false
      }
    })
  }

  const methodName = error.match(/Method (?:name )?"([^"]+)"/)?.[1]
  if (methodName) {
    return program.nodes.find((node) =>
      node.type === 'method' && attachedMethodDefinition(program, node)?.qualifiedName === methodName,
    )
  }

  if (error === 'Return nodes cannot have outgoing edges.') {
    return program.nodes.find((node) =>
      node.type === 'return' && program.edges.some((edge) => edge.source === node.id),
    )
  }

  if (error === 'Program must have exactly one main Function.') {
    return program.nodes.find((node) => node.type === 'function' && node.text.trim() === 'main')
  }
  return undefined
}

function friendlyTextError(node: ProgramNode, detail: string, lineNumber?: number): string {
  const source = lineNumber
    ? node.text.split('\n')[lineNumber - 1] ?? node.text
    : node.text
  const linePrefix = lineNumber ? `Line ${lineNumber}: ` : ''

  if (detail.includes('Expected expression')) {
    const trailingOperator = source.trim().match(/(==|!=|<=|>=|<-|\*\*|\/\/|[+\-*/%<>=]|\b(?:and|or|not))\s*$/)?.[1]
    if (trailingOperator) return `${linePrefix}Add an expression after "${trailingOperator}".`
    if (source.trim().endsWith(',')) return `${linePrefix}Add an expression after the comma.`
    if (source.trim().endsWith('(')) return `${linePrefix}Complete the expression inside the parentheses.`
    return `${linePrefix}Add a value, variable, or expression.`
  }
  if (detail.includes('Unterminated string literal')) {
    return `${linePrefix}Close the quoted text with a matching quotation mark.`
  }
  if (detail.includes('text cannot be empty')) {
    return `Enter ${node.type === 'if' || node.type === 'while' ? 'a condition' : 'an expression'} in this block.`
  }
  if (detail.includes('Input must be a variable name')) {
    return 'Enter a variable name, such as answer, to receive the input.'
  }
  if (detail.includes('Function name must be a valid name')) {
    return 'Enter a function name using letters, digits, and underscores, starting with a letter or underscore.'
  }
  return detail.endsWith('.') ? detail : `${detail}.`
}
