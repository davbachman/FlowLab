import type { FlowNodeType, Program } from './types'

export function isCollapsibleNodeType(type: FlowNodeType): boolean {
  return type === 'function' || type === 'method'
}

/** Bodies exclude their root, so moving a collapsed root moves its contents once. */
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
  // An unattached Method has no Class tile from which to expand it.
  const attachedMethods = new Set(program.edges
    .filter(edge => nodes.get(edge.source)?.type === 'class' && nodes.get(edge.target)?.type === 'method')
    .map(edge => edge.target))
  const bodies = new Map<string, Set<string>>()
  for (const id of collapsedIds) {
    const root = nodes.get(id)
    if (!root || !isCollapsibleNodeType(root.type)) continue
    if (root.type === 'method' && !attachedMethods.has(id)) continue
    const body = new Set<string>()
    const pending = [...(outgoing.get(id) ?? [])]
    while (pending.length) {
      const next = pending.pop()!
      const node = nodes.get(next)
      if (!node || next === id || body.has(next) || node.type === 'function' || node.type === 'class') continue
      if (node.type === 'method') continue
      body.add(next)
      pending.push(...(outgoing.get(next) ?? []))
    }
    bodies.set(id, body)
  }
  return bodies
}

export function collapsedBlockNodeIds(program: Program, bodies = collapsedBlockBodies(program)): Set<string> {
  const hidden = new Set([...bodies.values()].flatMap(body => [...body]))
  for (const node of program.nodes) {
    if (node.type === 'method' && bodies.has(node.id)) hidden.add(node.id)
  }
  return hidden
}
