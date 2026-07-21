import { parseClassDeclaration, parseMethodDeclaration } from './statements'
import type { Program, ProgramEdge, ProgramNode } from './types'

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
