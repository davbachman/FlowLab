import { parseClassDeclaration } from './statements'
import {
  isBranchNodeType,
  type FlowNodeType,
  type Program,
  type ProgramEdge,
  type ProgramNode,
} from './types'

export interface FlowNodeDimensions {
  width: number
  height: number
}

export interface FlowLayoutOptions {
  measuredDimensions?: ReadonlyMap<string, FlowNodeDimensions>
}

export interface FlowLayoutResult {
  program: Program
  backEdgeIds: ReadonlySet<string>
}

export const VERTICAL_RANK_SPACING = 250
export const BRANCH_CENTER_SEPARATION = 520
export const LOOP_BODY_CENTER_OFFSET = 520
export const COMPONENT_HORIZONTAL_GUTTER = 300
export const COMPONENT_VERTICAL_GUTTER = 300
export const MAX_COMPONENT_ROW_WIDTH = 2200

const NODE_HORIZONTAL_GUTTER = 80
const METHOD_LANE_GUTTER = 160
const CLASS_TO_METHOD_GUTTER = 170
const TALL_NODE_VERTICAL_GUTTER = 96
const MONOSPACE_CHARACTER_WIDTH = 7.8
const COMMENT_CHARACTER_WIDTH = 6.5
const INPUT_AND_NODE_CHROME_WIDTH = 48
const COMMENT_AND_NODE_CHROME_WIDTH = 32

const NODE_WIDTH_RANGE: Record<FlowNodeType, { min: number; max: number }> = {
  function: { min: 194, max: 680 },
  class: { min: 224, max: 960 },
  method: { min: 194, max: 680 },
  return: { min: 194, max: 680 },
  process: { min: 284, max: 760 },
  assignment: { min: 214, max: 680 },
  call: { min: 194, max: 680 },
  input: { min: 194, max: 680 },
  output: { min: 194, max: 680 },
  if: { min: 188, max: 620 },
  while: { min: 188, max: 620 },
  for: { min: 188, max: 620 },
}

interface IndexedNode {
  node: ProgramNode
  index: number
}

interface IndexedEdge {
  edge: ProgramEdge
  index: number
  source: IndexedNode
  target: IndexedNode
}

interface ProgramGraph {
  nodes: IndexedNode[]
  nodesById: Map<string, IndexedNode>
  edges: IndexedEdge[]
  executableEdges: IndexedEdge[]
  executableOutgoing: Map<string, IndexedEdge[]>
  classAttachments: IndexedEdge[]
}

interface PositionedBlock {
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
  anchorIndex: number
  anchorId: string
  kind: 'rooted' | 'invalid'
}

interface RootComponent {
  root: IndexedNode
  memberIds: Set<string>
}

interface ClassComponent {
  classNode: IndexedNode
  methods: RootComponent[]
}

interface LayoutGraph {
  nodes: IndexedNode[]
  baseEdges: IndexedEdge[]
  baseOutgoing: Map<string, IndexedEdge[]>
  constraints: Map<string, Set<string>>
}

interface RankedLayout {
  order: IndexedNode[]
  ranks: Map<string, number>
}

interface CenterCandidate {
  value: number
  priority: number
}

/**
 * Finds DFS ancestor edges using semantic, position-independent control flow.
 * Class-to-Method attachment edges and edges crossing declaration boundaries
 * are deliberately excluded from executable traversal.
 */
export function classifyBackEdges(program: Program): ReadonlySet<string> {
  const graph = buildProgramGraph(program)
  const state = new Map<string, 'visiting' | 'visited'>()
  const backEdgeIds = new Set<string>()
  const roots = graph.nodes
    .filter(
      ({ node }) => node.type === 'function' || node.type === 'method',
    )
    .sort(compareIndexedNodes)
  const loopHeaders = graph.nodes
    .filter(
      ({ node }) => node.type === 'while' || node.type === 'for',
    )
    .sort((left, right) => {
      const leftReturns = loopFalseEdgeReturnsToHeader(left, graph)
      const rightReturns = loopFalseEdgeReturnsToHeader(right, graph)
      return Number(leftReturns) - Number(rightReturns) || compareIndexedNodes(left, right)
    })
  const otherDecisions = graph.nodes
    .filter(({ node }) => node.type === 'if')
    .sort(compareIndexedNodes)
  const remaining = graph.nodes
    .filter(({ node }) => node.type !== 'class')
    .sort(compareIndexedNodes)

  function visit(startNodeId: string): void {
    const stack: Array<{
      nodeId: string
      outgoing: IndexedEdge[]
      nextEdgeIndex: number
    }> = [
      {
        nodeId: startNodeId,
        outgoing: graph.executableOutgoing.get(startNodeId) ?? [],
        nextEdgeIndex: 0,
      },
    ]
    state.set(startNodeId, 'visiting')

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      const edge = frame.outgoing[frame.nextEdgeIndex]
      if (!edge) {
        state.set(frame.nodeId, 'visited')
        stack.pop()
        continue
      }

      frame.nextEdgeIndex += 1
      const targetId = edge.target.node.id
      const targetState = state.get(targetId)
      if (targetState === 'visiting') {
        backEdgeIds.add(edge.edge.id)
      } else if (targetState !== 'visited') {
        state.set(targetId, 'visiting')
        stack.push({
          nodeId: targetId,
          outgoing: graph.executableOutgoing.get(targetId) ?? [],
          nextEdgeIndex: 0,
        })
      }
    }
  }

  for (const { node } of [
    ...roots,
    ...loopHeaders,
    ...otherDecisions,
    ...remaining,
  ]) {
    if (!state.has(node.id)) {
      visit(node.id)
    }
  }

  return backEdgeIds
}

function loopFalseEdgeReturnsToHeader(
  header: IndexedNode,
  graph: ProgramGraph,
): boolean {
  const falseTarget = graph.executableOutgoing
    .get(header.node.id)
    ?.find(({ edge }) => edge.label === 'false')?.target.node.id
  if (!falseTarget) {
    return true
  }

  const visited = new Set<string>()
  const stack = [falseTarget]
  while (stack.length > 0) {
    const nodeId = stack.pop()
    if (!nodeId || visited.has(nodeId)) {
      continue
    }
    if (nodeId === header.node.id) {
      return true
    }
    visited.add(nodeId)
    for (const edge of graph.executableOutgoing.get(nodeId) ?? []) {
      stack.push(edge.target.node.id)
    }
  }

  return false
}

export function minimumFlowNodeWidth(
  nodeType: FlowNodeType,
  attachedMethodCount = 0,
): number {
  if (nodeType === 'class') {
    const methodSlotCount = attachedMethodCount + 1
    const contentWidth = Math.max(200, methodSlotCount * 70 + 20)
    return contentWidth + 24
  }

  return NODE_WIDTH_RANGE[nodeType].min
}

export function adaptiveFlowNodeWidth(
  program: Program,
  node: ProgramNode,
): number {
  const attachedMethodCount =
    node.type === 'class' ? attachedMethodIds(program, node.id).length : 0
  const range = NODE_WIDTH_RANGE[node.type]
  const minimum = minimumFlowNodeWidth(node.type, attachedMethodCount)
  const maximum = node.type === 'class' ? Math.max(range.max, minimum) : range.max
  const codeLineLength = longestLineLength(node.text)
  const commentLineLength = longestLineLength(node.comment ?? '')
  const contentWidth = Math.max(
    codeLineLength * MONOSPACE_CHARACTER_WIDTH + INPUT_AND_NODE_CHROME_WIDTH,
    Math.min(commentLineLength, 72) * COMMENT_CHARACTER_WIDTH +
      COMMENT_AND_NODE_CHROME_WIDTH,
  )
  const requestedWidth = Math.max(node.width ?? 0, contentWidth, minimum)

  return Math.round(clamp(requestedWidth, minimum, maximum))
}

export function estimateProgramNodeDimensions(
  program: Program,
  node: ProgramNode,
  measured?: FlowNodeDimensions,
): FlowNodeDimensions {
  const width = adaptiveFlowNodeWidth(program, node)
  const estimatedHeight = estimatedNodeHeight(node, width)
  const reliableMeasuredHeight =
    measured &&
    Number.isFinite(measured.width) &&
    Number.isFinite(measured.height) &&
    measured.height > 0 &&
    Math.abs(measured.width - width) <= 1
      ? Math.ceil(measured.height)
      : undefined

  return {
    width,
    height: reliableMeasuredHeight ?? estimatedHeight,
  }
}

export function estimateProgramNodeDimensionsById(
  program: Program,
  measuredDimensions?: ReadonlyMap<string, FlowNodeDimensions>,
): ReadonlyMap<string, FlowNodeDimensions> {
  return new Map(
    program.nodes.map((node) => [
      node.id,
      estimateProgramNodeDimensions(
        program,
        node,
        measuredDimensions?.get(node.id),
      ),
    ]),
  )
}

/**
 * Returns a new Program with deterministic widths and top-left positions.
 * Program structure, executable text, comments, edge order, and edge metadata
 * are not changed.
 */
export function layoutProgram(
  program: Program,
  options: FlowLayoutOptions = {},
): FlowLayoutResult {
  const graph = buildProgramGraph(program)
  const backEdgeIds = classifyBackEdges(program)
  const dimensions = estimateProgramNodeDimensionsById(
    program,
    options.measuredDimensions,
  )
  const { primaryBlocks, invalidBlocks } = createComponentBlocks(
    graph,
    dimensions,
    backEdgeIds,
  )
  const reconciledBlocks = reconcileCrossBlockEdges(
    [...primaryBlocks, ...invalidBlocks],
    graph,
    dimensions,
    backEdgeIds,
  )
  const packedPositions = packBlocks(reconciledBlocks)
  const nextNodes = program.nodes.map((node) => {
    const dimensionsForNode = dimensions.get(node.id) ?? {
      width: minimumFlowNodeWidth(node.type),
      height: estimatedNodeHeight(node, minimumFlowNodeWidth(node.type)),
    }
    const position = packedPositions.get(node.id) ?? node.position
    const naturalWidth = minimumFlowNodeWidth(
      node.type,
      node.type === 'class' ? attachedMethodIds(program, node.id).length : 0,
    )
    const shouldSerializeWidth =
      node.width !== undefined || dimensionsForNode.width !== naturalWidth

    return {
      ...node,
      ...(shouldSerializeWidth ? { width: dimensionsForNode.width } : { width: undefined }),
      position: {
        x: roundToHalfPixel(position.x),
        y: roundToHalfPixel(position.y),
      },
    }
  })

  return {
    program: {
      ...program,
      nodes: nextNodes,
      edges: program.edges.map((edge) => ({ ...edge })),
    },
    backEdgeIds,
  }
}

function buildProgramGraph(program: Program): ProgramGraph {
  const nodes = program.nodes.map((node, index) => ({ node, index }))
  const nodesById = new Map<string, IndexedNode>()
  for (const entry of nodes) {
    if (!nodesById.has(entry.node.id)) {
      nodesById.set(entry.node.id, entry)
    }
  }

  const edges = program.edges.flatMap((edge, index) => {
    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)
    return source && target ? [{ edge, index, source, target }] : []
  })
  const classAttachments = edges
    .filter(
      ({ source, target }) =>
        source.node.type === 'class' && target.node.type === 'method',
    )
    .sort(
      (left, right) =>
        left.index - right.index || left.edge.id.localeCompare(right.edge.id),
    )
  const executableEdges = edges
    .filter(isExecutableEdge)
    .sort(compareIndexedEdges)
  const executableOutgoing = groupIndexedEdges(executableEdges, 'source')

  return {
    nodes,
    nodesById,
    edges,
    executableEdges,
    executableOutgoing,
    classAttachments,
  }
}

function isExecutableEdge({ source, target }: IndexedEdge): boolean {
  if (source.node.type === 'class') {
    return false
  }

  return (
    target.node.type !== 'class' &&
    target.node.type !== 'function' &&
    target.node.type !== 'method'
  )
}

function createComponentBlocks(
  graph: ProgramGraph,
  dimensions: ReadonlyMap<string, FlowNodeDimensions>,
  backEdgeIds: ReadonlySet<string>,
): { primaryBlocks: PositionedBlock[]; invalidBlocks: PositionedBlock[] } {
  const scopeRoots = graph.nodes
    .filter(
      ({ node }) => node.type === 'function' || node.type === 'method',
    )
    .sort(compareIndexedNodes)
  const ownersByNodeId = executableOwners(graph, scopeRoots)
  const rootComponents = new Map<string, RootComponent>()
  for (const root of scopeRoots) {
    rootComponents.set(root.node.id, {
      root,
      memberIds: new Set([root.node.id]),
    })
  }

  for (const entry of graph.nodes) {
    if (
      entry.node.type === 'function' ||
      entry.node.type === 'method' ||
      entry.node.type === 'class'
    ) {
      continue
    }

    const owners = ownersByNodeId.get(entry.node.id)
    if (owners?.size === 1) {
      const ownerId = owners.values().next().value as string
      rootComponents.get(ownerId)?.memberIds.add(entry.node.id)
    }
  }

  const claimedMethodIds = new Set<string>()
  const classComponents: ClassComponent[] = graph.nodes
    .filter(({ node }) => node.type === 'class')
    .sort(compareIndexedNodes)
    .map((classNode) => {
      const methodIds = graph.classAttachments
        .filter((edge) => edge.source.node.id === classNode.node.id)
        .map((edge) => edge.target.node.id)
      const methods = methodIds.flatMap((methodId) => {
        if (claimedMethodIds.has(methodId)) {
          return []
        }
        const component = rootComponents.get(methodId)
        if (!component) {
          return []
        }
        claimedMethodIds.add(methodId)
        return [component]
      })
      return { classNode, methods }
    })

  const functionComponents = scopeRoots
    .filter(({ node }) => node.type === 'function')
    .map(({ node }) => rootComponents.get(node.id))
    .filter((component): component is RootComponent => Boolean(component))
  const primaryDescriptors: Array<
    | { kind: 'class'; component: ClassComponent; anchor: IndexedNode }
    | { kind: 'root'; component: RootComponent; anchor: IndexedNode }
  > = [
    ...classComponents.map((component) => ({
      kind: 'class' as const,
      component,
      anchor: component.classNode,
    })),
    ...functionComponents.map((component) => ({
      kind: 'root' as const,
      component,
      anchor: component.root,
    })),
  ].sort((left, right) => compareIndexedNodes(left.anchor, right.anchor))

  const primaryBlocks = primaryDescriptors.map((descriptor) =>
    descriptor.kind === 'class'
      ? layoutClassComponent(
          descriptor.component,
          graph,
          dimensions,
          backEdgeIds,
        )
      : layoutRootComponent(
          descriptor.component,
          graph,
          dimensions,
          backEdgeIds,
          'rooted',
        ),
  )

  const assignedIds = new Set<string>()
  for (const component of classComponents) {
    assignedIds.add(component.classNode.node.id)
    for (const method of component.methods) {
      for (const memberId of method.memberIds) {
        assignedIds.add(memberId)
      }
    }
  }
  for (const component of functionComponents) {
    for (const memberId of component.memberIds) {
      assignedIds.add(memberId)
    }
  }

  const standaloneMethodBlocks = scopeRoots
    .filter(
      ({ node }) =>
        node.type === 'method' && !claimedMethodIds.has(node.id),
    )
    .map(({ node }) => rootComponents.get(node.id))
    .filter((component): component is RootComponent => Boolean(component))
    .map((component) => {
      for (const memberId of component.memberIds) {
        assignedIds.add(memberId)
      }
      return layoutRootComponent(
        component,
        graph,
        dimensions,
        backEdgeIds,
        'invalid',
      )
    })

  const unassignedNodes = graph.nodes.filter(
    ({ node }) => !assignedIds.has(node.id),
  )
  const orphanBlocks = weakNodeComponents(unassignedNodes, graph.edges).map(
    (componentNodes) =>
      layoutNodeSubset(
        new Set(componentNodes.map(({ node }) => node.id)),
        componentNodes[0],
        graph,
        dimensions,
        backEdgeIds,
        'invalid',
      ),
  )

  return {
    primaryBlocks,
    invalidBlocks: [...standaloneMethodBlocks, ...orphanBlocks].sort(
      comparePositionedBlocks,
    ),
  }
}

function executableOwners(
  graph: ProgramGraph,
  roots: IndexedNode[],
): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>()

  for (const root of roots) {
    const visited = new Set<string>()
    const stack = [root.node.id]

    while (stack.length > 0) {
      const nodeId = stack.pop()
      if (!nodeId || visited.has(nodeId)) {
        continue
      }
      visited.add(nodeId)

      if (nodeId !== root.node.id) {
        const nodeOwners = owners.get(nodeId) ?? new Set<string>()
        nodeOwners.add(root.node.id)
        owners.set(nodeId, nodeOwners)
      }

      const outgoing = graph.executableOutgoing.get(nodeId) ?? []
      for (let index = outgoing.length - 1; index >= 0; index -= 1) {
        stack.push(outgoing[index].target.node.id)
      }
    }
  }

  return owners
}

function layoutClassComponent(
  component: ClassComponent,
  graph: ProgramGraph,
  dimensions: ReadonlyMap<string, FlowNodeDimensions>,
  backEdgeIds: ReadonlySet<string>,
): PositionedBlock {
  const classDimensions = requiredDimensions(dimensions, component.classNode.node)
  const methodBlocks = component.methods.map((method) =>
    layoutRootComponent(
      method,
      graph,
      dimensions,
      backEdgeIds,
      'rooted',
    ),
  )
  const lanesWidth = methodBlocks.length
    ? methodBlocks.reduce((sum, block) => sum + block.width, 0) +
      METHOD_LANE_GUTTER * (methodBlocks.length - 1)
    : 0
  const width = Math.max(classDimensions.width, lanesWidth)
  const positions = new Map<string, { x: number; y: number }>()
  positions.set(component.classNode.node.id, {
    x: (width - classDimensions.width) / 2,
    y: 0,
  })

  let laneX = (width - lanesWidth) / 2
  const laneY = classDimensions.height + CLASS_TO_METHOD_GUTTER
  let methodHeight = 0
  for (const block of methodBlocks) {
    for (const [nodeId, position] of block.positions) {
      positions.set(nodeId, {
        x: laneX + position.x,
        y: laneY + position.y,
      })
    }
    laneX += block.width + METHOD_LANE_GUTTER
    methodHeight = Math.max(methodHeight, block.height)
  }

  return {
    positions,
    width,
    height: methodBlocks.length
      ? laneY + methodHeight
      : classDimensions.height,
    anchorIndex: component.classNode.index,
    anchorId: component.classNode.node.id,
    kind: 'rooted',
  }
}

function layoutRootComponent(
  component: RootComponent,
  graph: ProgramGraph,
  dimensions: ReadonlyMap<string, FlowNodeDimensions>,
  backEdgeIds: ReadonlySet<string>,
  kind: PositionedBlock['kind'],
): PositionedBlock {
  return layoutNodeSubset(
    component.memberIds,
    component.root,
    graph,
    dimensions,
    backEdgeIds,
    kind,
  )
}

function layoutNodeSubset(
  memberIds: Set<string>,
  anchor: IndexedNode,
  graph: ProgramGraph,
  dimensions: ReadonlyMap<string, FlowNodeDimensions>,
  backEdgeIds: ReadonlySet<string>,
  kind: PositionedBlock['kind'],
  includeClassAttachments = false,
): PositionedBlock {
  const nodes = graph.nodes
    .filter(({ node }) => memberIds.has(node.id))
    .sort(compareIndexedNodes)
  const executableBaseEdges = graph.executableEdges.filter(
    ({ edge }) =>
      memberIds.has(edge.source) &&
      memberIds.has(edge.target) &&
      !backEdgeIds.has(edge.id),
  )
  const attachmentBaseEdges = includeClassAttachments
    ? graph.classAttachments.filter(
        ({ edge }) =>
          memberIds.has(edge.source) && memberIds.has(edge.target),
      )
    : []
  const baseEdges = [...executableBaseEdges, ...attachmentBaseEdges].sort(
    compareIndexedEdges,
  )
  const baseOutgoing = groupIndexedEdges(baseEdges, 'source')
  const constraints = new Map<string, Set<string>>()
  for (const { edge } of baseEdges) {
    addConstraintUnchecked(constraints, edge.source, edge.target)
  }
  const layoutGraph: LayoutGraph = {
    nodes,
    baseEdges,
    baseOutgoing,
    constraints,
  }

  addLoopExitConstraints(layoutGraph, graph, memberIds, backEdgeIds)
  const ranked = rankLayoutGraph(layoutGraph)
  const centers = assignHorizontalCenters(layoutGraph, ranked, dimensions)
  const positions = assignVerticalPositions(nodes, ranked.ranks, centers, dimensions)
  const bounds = positionBounds(nodes, positions, dimensions)
  const normalized = new Map<string, { x: number; y: number }>()
  for (const [nodeId, position] of positions) {
    normalized.set(nodeId, {
      x: position.x - bounds.minX,
      y: position.y - bounds.minY,
    })
  }

  return {
    positions: normalized,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY),
    anchorIndex: anchor.index,
    anchorId: anchor.node.id,
    kind,
  }
}

/**
 * Ownership is intentionally directional: a malformed predecessor fragment is
 * not owned by the Function it flows into. That can initially place the two
 * fragments in different blocks. Re-layout only cross-connected blocks as one
 * recovery component so every non-back executable edge still participates in
 * rank assignment. Valid independent components have no such cross edges and
 * therefore retain their specialized Function/Class layout and packing order.
 */
function reconcileCrossBlockEdges(
  blocks: PositionedBlock[],
  graph: ProgramGraph,
  dimensions: ReadonlyMap<string, FlowNodeDimensions>,
  backEdgeIds: ReadonlySet<string>,
): PositionedBlock[] {
  const blockIndexByNodeId = new Map<string, number>()
  blocks.forEach((block, blockIndex) => {
    for (const nodeId of block.positions.keys()) {
      blockIndexByNodeId.set(nodeId, blockIndex)
    }
  })

  const neighbors = new Map<number, Set<number>>()
  const connectingEdges = [
    ...graph.executableEdges.filter(
      ({ edge }) => !backEdgeIds.has(edge.id),
    ),
    ...graph.classAttachments,
  ]
  for (const { edge } of connectingEdges) {
    const sourceBlock = blockIndexByNodeId.get(edge.source)
    const targetBlock = blockIndexByNodeId.get(edge.target)
    if (
      sourceBlock === undefined ||
      targetBlock === undefined ||
      sourceBlock === targetBlock
    ) {
      continue
    }
    neighbors.set(sourceBlock, new Set([...(neighbors.get(sourceBlock) ?? []), targetBlock]))
    neighbors.set(targetBlock, new Set([...(neighbors.get(targetBlock) ?? []), sourceBlock]))
  }

  const remaining = new Set(blocks.map((_, index) => index))
  const groups: number[][] = []
  for (let start = 0; start < blocks.length; start += 1) {
    if (!remaining.delete(start)) {
      continue
    }
    const group: number[] = []
    const queue = [start]
    while (queue.length > 0) {
      const blockIndex = queue.shift() as number
      group.push(blockIndex)
      for (const neighbor of [...(neighbors.get(blockIndex) ?? [])].sort(
        (left, right) => left - right,
      )) {
        if (remaining.delete(neighbor)) {
          queue.push(neighbor)
        }
      }
    }
    groups.push(group.sort((left, right) => left - right))
  }

  return groups.map((group) => {
    if (group.length === 1) {
      return blocks[group[0]]
    }
    const groupedBlocks = group.map((blockIndex) => blocks[blockIndex])
    const memberIds = new Set(
      groupedBlocks.flatMap((block) => [...block.positions.keys()]),
    )
    const anchor = graph.nodes
      .filter(({ node }) => memberIds.has(node.id))
      .sort(compareIndexedNodes)[0]
    if (!anchor) {
      return blocks[group[0]]
    }
    return layoutNodeSubset(
      memberIds,
      anchor,
      graph,
      dimensions,
      backEdgeIds,
      groupedBlocks.some(({ kind }) => kind === 'rooted')
        ? 'rooted'
        : 'invalid',
      true,
    )
  })
}

function addLoopExitConstraints(
  layoutGraph: LayoutGraph,
  graph: ProgramGraph,
  memberIds: Set<string>,
  backEdgeIds: ReadonlySet<string>,
): void {
  for (const entry of layoutGraph.nodes) {
    if (entry.node.type !== 'while' && entry.node.type !== 'for') {
      continue
    }

    const outgoing = graph.executableOutgoing.get(entry.node.id) ?? []
    const trueEdge = outgoing.find(({ edge }) => edge.label === 'true')
    const falseEdge = outgoing.find(({ edge }) => edge.label === 'false')
    if (
      !trueEdge ||
      !falseEdge ||
      backEdgeIds.has(falseEdge.edge.id) ||
      !memberIds.has(trueEdge.target.node.id) ||
      !memberIds.has(falseEdge.target.node.id)
    ) {
      continue
    }

    const bodyIds = reachableUntil(
      trueEdge.target.node.id,
      falseEdge.target.node.id,
      layoutGraph.baseOutgoing,
    )
    for (const bodyId of bodyIds) {
      if (
        bodyId !== falseEdge.target.node.id &&
        bodyId !== entry.node.id
      ) {
        addConstraintIfAcyclic(
          layoutGraph.constraints,
          bodyId,
          falseEdge.target.node.id,
        )
      }
    }
  }
}

function rankLayoutGraph(layoutGraph: LayoutGraph): RankedLayout {
  const indegree = new Map(layoutGraph.nodes.map(({ node }) => [node.id, 0]))
  for (const targets of layoutGraph.constraints.values()) {
    for (const target of targets) {
      indegree.set(target, (indegree.get(target) ?? 0) + 1)
    }
  }

  const byId = new Map(layoutGraph.nodes.map((entry) => [entry.node.id, entry]))
  const ready = layoutGraph.nodes
    .filter(({ node }) => (indegree.get(node.id) ?? 0) === 0)
    .sort(compareIndexedNodes)
  const order: IndexedNode[] = []
  const ranks = new Map(layoutGraph.nodes.map(({ node }) => [node.id, 0]))

  while (ready.length > 0) {
    const entry = ready.shift() as IndexedNode
    order.push(entry)
    for (const targetId of sortedConstraintTargets(
      layoutGraph.constraints.get(entry.node.id),
      byId,
    )) {
      ranks.set(
        targetId,
        Math.max(
          ranks.get(targetId) ?? 0,
          (ranks.get(entry.node.id) ?? 0) + 1,
        ),
      )
      const nextIndegree = (indegree.get(targetId) ?? 1) - 1
      indegree.set(targetId, nextIndegree)
      if (nextIndegree === 0) {
        const target = byId.get(targetId)
        if (target) {
          ready.push(target)
          ready.sort(compareIndexedNodes)
        }
      }
    }
  }

  // Defensive fallback for malformed data. The constraints are built acyclic,
  // but duplicate ids or future edge kinds must never make cleanup throw.
  const orderedNodeIds = new Set(order.map(({ node }) => node.id))
  for (const entry of layoutGraph.nodes) {
    if (!orderedNodeIds.has(entry.node.id)) {
      ranks.set(entry.node.id, Math.max(0, ...ranks.values()) + 1)
      order.push(entry)
      orderedNodeIds.add(entry.node.id)
    }
  }

  return { order, ranks }
}

function assignHorizontalCenters(
  layoutGraph: LayoutGraph,
  ranked: RankedLayout,
  dimensions: ReadonlyMap<string, FlowNodeDimensions>,
): Map<string, number> {
  const candidates = new Map<string, CenterCandidate[]>()
  const centers = new Map<string, number>()
  const priorities = new Map<string, number>()
  const joinOwners = conditionalJoinOwners(layoutGraph)

  if (ranked.order[0]) {
    addCenterCandidate(candidates, ranked.order[0].node.id, 0, 100)
  }

  for (const entry of ranked.order) {
    const joins = joinOwners.get(entry.node.id) ?? []
    const outermostJoinOwner = [...joins].sort((left, right) => {
      const rankDifference =
        (ranked.ranks.get(left) ?? 0) - (ranked.ranks.get(right) ?? 0)
      return rankDifference || left.localeCompare(right)
    })[0]
    const decisionCenter = outermostJoinOwner
      ? centers.get(outermostJoinOwner)
      : undefined
    if (decisionCenter !== undefined) {
      addCenterCandidate(candidates, entry.node.id, decisionCenter, 90)
    }

    const nodeCandidates = candidates.get(entry.node.id) ?? []
    const highestPriority = Math.max(0, ...nodeCandidates.map(({ priority }) => priority))
    const preferred = nodeCandidates
      .filter(({ priority }) => priority === highestPriority)
      .map(({ value }) => value)
      .sort((left, right) => left - right)
    const center = preferred.length ? median(preferred) : 0
    centers.set(entry.node.id, center)
    priorities.set(entry.node.id, highestPriority)

    const outgoing = layoutGraph.baseOutgoing.get(entry.node.id) ?? []
    const falseFallthrough =
      entry.node.type === 'if'
        ? isFalseFallthrough(entry.node.id, outgoing, layoutGraph.baseOutgoing)
        : false
    for (const edge of outgoing) {
      let nextCenter = center
      let priority = 45
      if (entry.node.type === 'while' || entry.node.type === 'for') {
        if (edge.edge.label === 'true') {
          nextCenter = center - LOOP_BODY_CENTER_OFFSET
          priority = 75
        } else if (edge.edge.label === 'false') {
          priority = 80
        }
      } else if (entry.node.type === 'if') {
        if (edge.edge.label === 'true') {
          nextCenter = center - BRANCH_CENTER_SEPARATION / 2
          priority = 75
        } else if (edge.edge.label === 'false') {
          nextCenter = falseFallthrough
            ? center
            : center + BRANCH_CENTER_SEPARATION / 2
          priority = falseFallthrough ? 80 : 75
        }
      }
      addCenterCandidate(
        candidates,
        edge.target.node.id,
        nextCenter,
        priority,
      )
    }
  }

  resolveRankCollisions(
    layoutGraph.nodes,
    ranked.ranks,
    centers,
    priorities,
    dimensions,
  )
  return centers
}

function conditionalJoinOwners(
  layoutGraph: LayoutGraph,
): Map<string, string[]> {
  const joins = new Map<string, string[]>()
  for (const entry of layoutGraph.nodes) {
    if (entry.node.type !== 'if') {
      continue
    }
    const outgoing = layoutGraph.baseOutgoing.get(entry.node.id) ?? []
    const trueTarget = outgoing.find(({ edge }) => edge.label === 'true')?.target
      .node.id
    const falseTarget = outgoing.find(({ edge }) => edge.label === 'false')?.target
      .node.id
    if (!trueTarget || !falseTarget) {
      continue
    }
    const join = nearestCommonDescendant(
      trueTarget,
      falseTarget,
      layoutGraph.baseOutgoing,
    )
    if (join) {
      joins.set(join, [...(joins.get(join) ?? []), entry.node.id])
    }
  }
  return joins
}

function isFalseFallthrough(
  decisionId: string,
  outgoing: IndexedEdge[],
  baseOutgoing: Map<string, IndexedEdge[]>,
): boolean {
  const trueTarget = outgoing.find(({ edge }) => edge.label === 'true')?.target.node
    .id
  const falseTarget = outgoing.find(({ edge }) => edge.label === 'false')?.target
    .node.id
  if (!trueTarget || !falseTarget) {
    return false
  }
  const join = nearestCommonDescendant(trueTarget, falseTarget, baseOutgoing)
  return join === falseTarget && falseTarget !== decisionId
}

function resolveRankCollisions(
  nodes: IndexedNode[],
  ranks: Map<string, number>,
  centers: Map<string, number>,
  priorities: Map<string, number>,
  dimensions: ReadonlyMap<string, FlowNodeDimensions>,
): void {
  const nodesByRank = new Map<number, IndexedNode[]>()
  for (const entry of nodes) {
    const rank = ranks.get(entry.node.id) ?? 0
    nodesByRank.set(rank, [...(nodesByRank.get(rank) ?? []), entry])
  }

  for (const rankNodes of nodesByRank.values()) {
    rankNodes.sort((left, right) => {
      const centerDifference =
        (centers.get(left.node.id) ?? 0) - (centers.get(right.node.id) ?? 0)
      return centerDifference || compareIndexedNodes(left, right)
    })
    if (rankNodes.length < 2) {
      continue
    }

    let pivotIndex = 0
    for (let index = 1; index < rankNodes.length; index += 1) {
      const candidate = rankNodes[index]
      const pivot = rankNodes[pivotIndex]
      const candidatePriority = priorities.get(candidate.node.id) ?? 0
      const pivotPriority = priorities.get(pivot.node.id) ?? 0
      const candidateCenter = Math.abs(centers.get(candidate.node.id) ?? 0)
      const pivotCenter = Math.abs(centers.get(pivot.node.id) ?? 0)
      if (
        candidatePriority > pivotPriority ||
        (candidatePriority === pivotPriority && candidateCenter < pivotCenter)
      ) {
        pivotIndex = index
      }
    }

    for (let index = pivotIndex - 1; index >= 0; index -= 1) {
      const current = rankNodes[index]
      const next = rankNodes[index + 1]
      const currentWidth = requiredDimensions(dimensions, current.node).width
      const nextWidth = requiredDimensions(dimensions, next.node).width
      const maximumCenter =
        (centers.get(next.node.id) ?? 0) -
        (currentWidth + nextWidth) / 2 -
        NODE_HORIZONTAL_GUTTER
      centers.set(
        current.node.id,
        Math.min(centers.get(current.node.id) ?? 0, maximumCenter),
      )
    }

    for (let index = pivotIndex + 1; index < rankNodes.length; index += 1) {
      const previous = rankNodes[index - 1]
      const current = rankNodes[index]
      const previousWidth = requiredDimensions(dimensions, previous.node).width
      const currentWidth = requiredDimensions(dimensions, current.node).width
      const minimumCenter =
        (centers.get(previous.node.id) ?? 0) +
        (previousWidth + currentWidth) / 2 +
        NODE_HORIZONTAL_GUTTER
      centers.set(
        current.node.id,
        Math.max(centers.get(current.node.id) ?? 0, minimumCenter),
      )
    }
  }
}

function assignVerticalPositions(
  nodes: IndexedNode[],
  ranks: Map<string, number>,
  centers: Map<string, number>,
  dimensions: ReadonlyMap<string, FlowNodeDimensions>,
): Map<string, { x: number; y: number }> {
  const maximumRank = Math.max(0, ...ranks.values())
  const rankHeights = new Map<number, number>()
  for (const entry of nodes) {
    const rank = ranks.get(entry.node.id) ?? 0
    rankHeights.set(
      rank,
      Math.max(
        rankHeights.get(rank) ?? 0,
        requiredDimensions(dimensions, entry.node).height,
      ),
    )
  }

  const rankTops = new Map<number, number>([[0, 0]])
  for (let rank = 1; rank <= maximumRank; rank += 1) {
    const previousTop = rankTops.get(rank - 1) ?? 0
    const previousHeight = rankHeights.get(rank - 1) ?? 0
    rankTops.set(
      rank,
      previousTop +
        Math.max(
          VERTICAL_RANK_SPACING,
          previousHeight + TALL_NODE_VERTICAL_GUTTER,
        ),
    )
  }

  return new Map(
    nodes.map((entry) => {
      const nodeDimensions = requiredDimensions(dimensions, entry.node)
      return [
        entry.node.id,
        {
          x: (centers.get(entry.node.id) ?? 0) - nodeDimensions.width / 2,
          y: rankTops.get(ranks.get(entry.node.id) ?? 0) ?? 0,
        },
      ]
    }),
  )
}

function packBlocks(blocks: PositionedBlock[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  let rowX = 0
  let rowY = 0
  let rowHeight = 0

  for (const block of blocks) {
    if (rowX > 0 && rowX + block.width > MAX_COMPONENT_ROW_WIDTH) {
      rowX = 0
      rowY += rowHeight + COMPONENT_VERTICAL_GUTTER
      rowHeight = 0
    }
    for (const [nodeId, position] of block.positions) {
      positions.set(nodeId, {
        x: rowX + position.x,
        y: rowY + position.y,
      })
    }
    rowX += block.width + COMPONENT_HORIZONTAL_GUTTER
    rowHeight = Math.max(rowHeight, block.height)
  }

  return positions
}

function weakNodeComponents(
  nodes: IndexedNode[],
  edges: IndexedEdge[],
): IndexedNode[][] {
  const remaining = new Set(nodes.map(({ node }) => node.id))
  const nodesById = new Map(nodes.map((entry) => [entry.node.id, entry]))
  const neighbors = new Map<string, Set<string>>()
  for (const { edge } of edges) {
    if (!remaining.has(edge.source) || !remaining.has(edge.target)) {
      continue
    }
    neighbors.set(edge.source, new Set([...(neighbors.get(edge.source) ?? []), edge.target]))
    neighbors.set(edge.target, new Set([...(neighbors.get(edge.target) ?? []), edge.source]))
  }

  const components: IndexedNode[][] = []
  for (const start of nodes.sort(compareIndexedNodes)) {
    if (!remaining.has(start.node.id)) {
      continue
    }
    const component: IndexedNode[] = []
    const queue = [start.node.id]
    remaining.delete(start.node.id)
    while (queue.length > 0) {
      const nodeId = queue.shift() as string
      const entry = nodesById.get(nodeId)
      if (entry) {
        component.push(entry)
      }
      const nextIds = [...(neighbors.get(nodeId) ?? [])].sort((left, right) =>
        compareIndexedNodes(
          nodesById.get(left) as IndexedNode,
          nodesById.get(right) as IndexedNode,
        ),
      )
      for (const nextId of nextIds) {
        if (remaining.delete(nextId)) {
          queue.push(nextId)
        }
      }
    }
    components.push(component.sort(compareIndexedNodes))
  }
  return components
}

function nearestCommonDescendant(
  first: string,
  second: string,
  outgoing: Map<string, IndexedEdge[]>,
): string | undefined {
  const firstDistances = descendantDistances(first, outgoing)
  const secondDistances = descendantDistances(second, outgoing)
  return [...firstDistances.keys()]
    .filter((nodeId) => secondDistances.has(nodeId))
    .sort((left, right) => {
      const leftFirst = firstDistances.get(left) ?? Number.MAX_SAFE_INTEGER
      const leftSecond = secondDistances.get(left) ?? Number.MAX_SAFE_INTEGER
      const rightFirst = firstDistances.get(right) ?? Number.MAX_SAFE_INTEGER
      const rightSecond = secondDistances.get(right) ?? Number.MAX_SAFE_INTEGER
      return (
        Math.max(leftFirst, leftSecond) - Math.max(rightFirst, rightSecond) ||
        leftFirst + leftSecond - rightFirst - rightSecond ||
        left.localeCompare(right)
      )
    })[0]
}

function descendantDistances(
  start: string,
  outgoing: Map<string, IndexedEdge[]>,
): Map<string, number> {
  const distances = new Map<string, number>([[start, 0]])
  const queue = [start]
  while (queue.length > 0) {
    const nodeId = queue.shift() as string
    const distance = distances.get(nodeId) ?? 0
    for (const edge of outgoing.get(nodeId) ?? []) {
      if (!distances.has(edge.target.node.id)) {
        distances.set(edge.target.node.id, distance + 1)
        queue.push(edge.target.node.id)
      }
    }
  }
  return distances
}

function reachableUntil(
  start: string,
  stop: string,
  outgoing: Map<string, IndexedEdge[]>,
): Set<string> {
  const reachable = new Set<string>()
  const stack = [start]
  while (stack.length > 0) {
    const nodeId = stack.pop()
    if (!nodeId || nodeId === stop || reachable.has(nodeId)) {
      continue
    }
    reachable.add(nodeId)
    const next = outgoing.get(nodeId) ?? []
    for (let index = next.length - 1; index >= 0; index -= 1) {
      stack.push(next[index].target.node.id)
    }
  }
  return reachable
}

function addConstraintIfAcyclic(
  constraints: Map<string, Set<string>>,
  source: string,
  target: string,
): void {
  if (source === target || constraintPathExists(constraints, target, source)) {
    return
  }
  addConstraintUnchecked(constraints, source, target)
}

function addConstraintUnchecked(
  constraints: Map<string, Set<string>>,
  source: string,
  target: string,
): void {
  const targets = constraints.get(source) ?? new Set<string>()
  targets.add(target)
  constraints.set(source, targets)
}

function constraintPathExists(
  constraints: Map<string, Set<string>>,
  start: string,
  target: string,
): boolean {
  const visited = new Set<string>()
  const stack = [start]
  while (stack.length > 0) {
    const nodeId = stack.pop()
    if (!nodeId || visited.has(nodeId)) {
      continue
    }
    if (nodeId === target) {
      return true
    }
    visited.add(nodeId)
    stack.push(...(constraints.get(nodeId) ?? []))
  }
  return false
}

function sortedConstraintTargets(
  targets: Set<string> | undefined,
  nodesById: Map<string, IndexedNode>,
): string[] {
  return [...(targets ?? [])].sort((left, right) => {
    const leftNode = nodesById.get(left)
    const rightNode = nodesById.get(right)
    if (!leftNode || !rightNode) {
      return left.localeCompare(right)
    }
    return compareIndexedNodes(leftNode, rightNode)
  })
}

function groupIndexedEdges(
  edges: IndexedEdge[],
  key: 'source' | 'target',
): Map<string, IndexedEdge[]> {
  const groups = new Map<string, IndexedEdge[]>()
  for (const edge of edges) {
    const nodeId = edge[key].node.id
    groups.set(nodeId, [...(groups.get(nodeId) ?? []), edge])
  }
  for (const group of groups.values()) {
    group.sort(compareIndexedEdges)
  }
  return groups
}

function compareIndexedEdges(left: IndexedEdge, right: IndexedEdge): number {
  return (
    branchOrder(left.edge.label) - branchOrder(right.edge.label) ||
    left.target.index - right.target.index ||
    left.target.node.id.localeCompare(right.target.node.id) ||
    left.index - right.index ||
    left.edge.id.localeCompare(right.edge.id)
  )
}

function branchOrder(label: ProgramEdge['label']): number {
  return label === 'true' ? 0 : label === 'false' ? 1 : 2
}

function compareIndexedNodes(left: IndexedNode, right: IndexedNode): number {
  return left.index - right.index || left.node.id.localeCompare(right.node.id)
}

function comparePositionedBlocks(
  left: PositionedBlock,
  right: PositionedBlock,
): number {
  return left.anchorIndex - right.anchorIndex || left.anchorId.localeCompare(right.anchorId)
}

function positionBounds(
  nodes: IndexedNode[],
  positions: Map<string, { x: number; y: number }>,
  dimensions: ReadonlyMap<string, FlowNodeDimensions>,
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (!nodes.length) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  }
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const entry of nodes) {
    const position = positions.get(entry.node.id) ?? { x: 0, y: 0 }
    const nodeDimensions = requiredDimensions(dimensions, entry.node)
    minX = Math.min(minX, position.x)
    minY = Math.min(minY, position.y)
    maxX = Math.max(maxX, position.x + nodeDimensions.width)
    maxY = Math.max(maxY, position.y + nodeDimensions.height)
  }
  return { minX, minY, maxX, maxY }
}

function requiredDimensions(
  dimensions: ReadonlyMap<string, FlowNodeDimensions>,
  node: ProgramNode,
): FlowNodeDimensions {
  return (
    dimensions.get(node.id) ?? {
      width: minimumFlowNodeWidth(node.type),
      height: estimatedNodeHeight(node, minimumFlowNodeWidth(node.type)),
    }
  )
}

function estimatedNodeHeight(node: ProgramNode, width: number): number {
  const commentLines = estimatedWrappedLineCount(
    node.comment ?? '',
    Math.max(1, Math.floor((width - 32) / COMMENT_CHARACTER_WIDTH)),
  )
  const commentHeight = commentLines ? commentLines * 15 + 6 : 0

  if (isBranchNodeType(node.type)) {
    return Math.max(142, 122 + commentHeight)
  }
  if (node.type === 'process') {
    const textLines = Math.max(2, node.text.split(/\r?\n/).length)
    return 80 + textLines * 16 + commentHeight
  }
  if (node.type === 'class') {
    const fieldsHeight = (() => {
      try {
        return parseClassDeclaration(node.text).fields.length ? 24 : 0
      } catch {
        return 0
      }
    })()
    return 114 + fieldsHeight + commentHeight
  }
  return 82 + commentHeight
}

function estimatedWrappedLineCount(text: string, columns: number): number {
  if (!text) {
    return 0
  }
  return text.split(/\r?\n/).reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / columns)),
    0,
  )
}

function longestLineLength(text: string): number {
  return Math.max(0, ...text.split(/\r?\n/).map((line) => line.length))
}

function attachedMethodIds(program: Program, classNodeId: string): string[] {
  const methodIds = new Set(
    program.nodes
      .filter((node) => node.type === 'method')
      .map((node) => node.id),
  )
  const seen = new Set<string>()
  return program.edges.flatMap((edge) => {
    if (
      edge.source !== classNodeId ||
      !methodIds.has(edge.target) ||
      seen.has(edge.target)
    ) {
      return []
    }
    seen.add(edge.target)
    return [edge.target]
  })
}

function addCenterCandidate(
  candidates: Map<string, CenterCandidate[]>,
  nodeId: string,
  value: number,
  priority: number,
): void {
  candidates.set(nodeId, [
    ...(candidates.get(nodeId) ?? []),
    { value, priority },
  ])
}

function median(values: number[]): number {
  const middle = Math.floor(values.length / 2)
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle]
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function roundToHalfPixel(value: number): number {
  return Math.round(value * 2) / 2
}
