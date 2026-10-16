import { parseClassDeclaration, parseInputVariables } from './statements'
import type { Program, ProgramNode } from './types'

/** The optional init connection is an ordered chain of Input blocks. */
export function classInitializationInputs(program: Program, classNode: ProgramNode): ProgramNode[] {
  const nodes = new Map(program.nodes.map((node) => [node.id, node]))
  const roots = program.edges.filter((edge) => edge.source === classNode.id && nodes.get(edge.target)?.type === 'input')
  if (roots.length > 1) throw new Error('Class init must have at most one connection to an Input block.')
  const inputs: ProgramNode[] = []
  const visited = new Set<string>()
  let nextId = roots[0]?.target
  let previousId = classNode.id
  while (nextId) {
    if (visited.has(nextId)) throw new Error('Class init cannot contain a cycle.')
    visited.add(nextId)
    const node = nodes.get(nextId)
    if (!node || node.type !== 'input') throw new Error('Class init must connect only Input blocks; no Return is needed.')
    const incoming = program.edges.filter((edge) => edge.target === node.id)
    if (incoming.length !== 1 || incoming[0].source !== previousId) {
      throw new Error(`Init Input "${node.id}" must belong only to this Class init.`)
    }
    inputs.push(node)
    const outgoing = program.edges.filter((edge) => edge.source === node.id)
    if (outgoing.length > 1 || outgoing.some((edge) => edge.label !== undefined)) {
      throw new Error(`Init Input "${node.id}" may have at most one unlabeled connection to another Input.`)
    }
    previousId = node.id
    nextId = outgoing[0]?.target
  }
  return inputs
}

export function classAttributeNames(program: Program, classNode: ProgramNode): string[] {
  const inputs = classInitializationInputs(program, classNode)
  return inputs.length
    ? inputs.flatMap((node) => parseInputVariables(node.text).map((input) => input.variable))
    : parseClassDeclaration(classNode.text).fields
}
