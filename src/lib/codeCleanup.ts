import { layoutProgram } from './flowLayout'
import { consolidateProcessBlocks } from './processConsolidation'
import type { Program } from './types'

export interface CodeCleanupResult {
  program: Program
  changed: boolean
  mergedNodeCount: number
  absorbedNodeIds: ReadonlyMap<string, string>
  backEdgeIds: ReadonlySet<string>
}

/**
 * Performs the complete cleanup transaction without mutating the source Program.
 * Consolidation intentionally runs first so layout measures the final blocks.
 */
export function cleanUpProgram(program: Program): CodeCleanupResult {
  const consolidation = consolidateProcessBlocks(program)
  // DOM heights are intentionally not inputs to the saved layout: Program does
  // not serialize height, so those measurements cannot remain stable across a
  // save/reopen cycle, a headless cleanup, or a font-loading race. The layout's
  // renderer-calibrated estimator and serialized adaptive widths are portable.
  const layout = layoutProgram(consolidation.program)

  return {
    program: layout.program,
    changed: !programDataEqual(program, layout.program),
    mergedNodeCount: consolidation.mergedNodeCount,
    absorbedNodeIds: consolidation.absorbedNodeIds,
    backEdgeIds: layout.backEdgeIds,
  }
}

export function programDataEqual(left: Program, right: Program): boolean {
  if (
    left.version !== right.version ||
    left.imports !== right.imports ||
    left.inputQueue !== right.inputQueue ||
    left.nodes.length !== right.nodes.length ||
    left.edges.length !== right.edges.length
  ) {
    return false
  }

  const nodesMatch = left.nodes.every((node, index) => {
    const candidate = right.nodes[index]
    return (
      candidate !== undefined &&
      node.id === candidate.id &&
      node.type === candidate.type &&
      node.text === candidate.text &&
      node.comment === candidate.comment &&
      node.width === candidate.width &&
      node.position.x === candidate.position.x &&
      node.position.y === candidate.position.y
    )
  })
  if (!nodesMatch) {
    return false
  }

  return left.edges.every((edge, index) => {
    const candidate = right.edges[index]
    return (
      candidate !== undefined &&
      edge.id === candidate.id &&
      edge.source === candidate.source &&
      edge.target === candidate.target &&
      edge.label === candidate.label
    )
  })
}
