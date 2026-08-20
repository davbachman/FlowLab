import { parseClassDeclaration, parseMethodDeclaration } from './statements'
import type { Program, ProgramEdge, ProgramNode } from './types'

export const OBJECT_REPR_METHOD_NAME = '__repr__'

export const OBJECT_BINARY_DUNDER_METHODS: Readonly<Record<string, string>> = {
  '+': '__add__',
  '-': '__sub__',
  '*': '__mul__',
  '/': '__truediv__',
  '//': '__floordiv__',
  '%': '__mod__',
  '=': '__eq__',
  '==': '__eq__',
  '!=': '__ne__',
  '<': '__lt__',
  '<=': '__le__',
  '>': '__gt__',
  '>=': '__ge__',
}

export const OBJECT_UNARY_DUNDER_METHODS: Readonly<Record<string, string>> = {
  '-': '__neg__',
}

export const OBJECT_COMPARISON_DUNDER_METHOD_NAMES: ReadonlySet<string> = new Set([
  '__eq__',
  '__ne__',
  '__lt__',
  '__le__',
  '__gt__',
  '__ge__',
])

export function objectDunderMethodForOperator(
  operator: string,
  argumentCount: number,
): string | undefined {
  return argumentCount === 0
    ? OBJECT_UNARY_DUNDER_METHODS[operator]
    : argumentCount === 1
      ? OBJECT_BINARY_DUNDER_METHODS[operator]
      : undefined
}

export function objectDunderInputCount(methodName: string): 0 | 1 | undefined {
  if (
    methodName === OBJECT_REPR_METHOD_NAME ||
    methodName === OBJECT_UNARY_DUNDER_METHODS['-']
  ) {
    return 0
  }

  return Object.values(OBJECT_BINARY_DUNDER_METHODS).includes(methodName)
    ? 1
    : undefined
}

export interface AttachedMethodDefinition {
  className: string
  methodName: string
  qualifiedName: string
  classNode: ProgramNode
  methodNode: ProgramNode
  attachmentEdge: ProgramEdge
}
/**
 * Resolves a Method's owning Class from its single Class -> Method edge.
 * Invalid or incomplete graph shapes return undefined and are diagnosed by
 * program validation.
 */
export function attachedMethodDefinition(
  program: Program,
  methodNode: ProgramNode,
): AttachedMethodDefinition | undefined {
  if (methodNode.type !== 'method') {
    return undefined
  }

  const incoming = program.edges.filter((edge) => edge.target === methodNode.id)
  if (incoming.length !== 1) {
    return undefined
  }

  const attachmentEdge = incoming[0]
  const classNode = program.nodes.find(
    (node) => node.id === attachmentEdge.source && node.type === 'class',
  )
  if (!classNode) {
    return undefined
  }

  try {
    const className = parseClassDeclaration(classNode.text).name
    const methodName = parseMethodDeclaration(methodNode.text).methodName
    return {
      className,
      methodName,
      qualifiedName: `${className}.${methodName}`,
      classNode,
      methodNode,
      attachmentEdge,
    }
  } catch {
    return undefined
  }
}
