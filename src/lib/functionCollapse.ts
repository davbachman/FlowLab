import type { Program } from './types'

/** Follow control-flow wires, stopping at other function/class declarations. */
export function collapsedFunctionBodies(
  program: Program,
  collapsedIds: ReadonlySet<string>,
): Map<string, Set<string>> {
  const nodes = new Map(program.nodes.map((node) => [node.id, node]))
  const outgoing = new Map<string, string[]>()
  for (const edge of program.edges) {
    const targets = outgoing.get(edge.source) ?? []
    targets.push(edge.target)
    outgoing.set(edge.source, targets)
  }
  const bodies = new Map<string, Set<string>>()
  for (const id of collapsedIds) {
    if (nodes.get(id)?.type !== 'function') continue
    const body = new Set<string>()
    const pending = [...(outgoing.get(id) ?? [])]
    while (pending.length) {
      const next = pending.pop()!
      const node = nodes.get(next)
      if (!node || body.has(next) || ['function', 'method', 'class'].includes(node.type)) continue
      body.add(next)
      pending.push(...(outgoing.get(next) ?? []))
    }
    bodies.set(id, body)
  }
  return bodies
}
