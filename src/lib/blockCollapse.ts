import type { FlowNodeType, Program } from './types'

export function isCollapsibleNodeType(type: FlowNodeType): boolean {
  return type === 'function' || type === 'method' || type === 'class'
}

/** Class bodies include init Inputs and attached Methods, regardless of their own collapse state. */
export function collapsedBlockBodies(
  program: Program,
  collapsedIds: ReadonlySet<string> = new Set(program.nodes.filter(node => isCollapsibleNodeType(node.type) && node.collapsed).map(node => node.id)),
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
    const root = nodes.get(id)
    if (!root || !isCollapsibleNodeType(root.type)) continue
    const body = new Set<string>()
    const attachedMethods = new Set(root.type === 'class'
      ? (outgoing.get(id) ?? []).filter(target => nodes.get(target)?.type === 'method')
      : [])
    const pending = [...(outgoing.get(id) ?? [])]
    while (pending.length) {
      const next = pending.pop()!
      const node = nodes.get(next)
      if (!node || next === id || body.has(next) || node.type === 'function' || node.type === 'class') continue
      if (node.type === 'method' && !attachedMethods.has(next)) continue
      body.add(next)
      pending.push(...(outgoing.get(next) ?? []))
    }
    bodies.set(id, body)
  }
  return bodies
}
