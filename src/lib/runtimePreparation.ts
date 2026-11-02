import { prepareExpression } from './expression'
import { attachedMethodDefinition } from './classMethods'
import { classAttributeNames } from './classInitialization'
import {
  parseAssignment, parseClassDeclaration, parseForLoop, parseInputVariables,
  splitOutputExpressions, splitProcessStatements,
} from './statements'
import type { Program, ProgramEdge, ProgramNode } from './types'

interface ClassDefinition {
  name: string
  fields: string[]
  program: Program
  node: ProgramNode
}

interface PreparedProgram {
  nodes: Map<string, ProgramNode>
  outgoing: Map<string, ProgramEdge[]>
  functions: Map<string, ProgramNode>
  classes: Map<string, ClassDefinition>
  methods: Map<string, ProgramNode>
  expression: (source: string) => ReturnType<typeof prepareExpression>
  assignment: typeof parseAssignment
  forLoop: typeof parseForLoop
  inputs: typeof parseInputVariables
  process: typeof splitProcessStatements
  output: typeof splitOutputExpressions
}

interface ProgramRevision {
  nodes: Array<{ node: ProgramNode; id: string; type: string; text: string }>
  edges: Array<{ edge: ProgramEdge; id: string; source: string; target: string; label?: string }>
  imports?: string
  prepared: PreparedProgram
}

// Weak ownership keeps obsolete documents/revisions collectible. A revision owns
// its syntax and graph indexes; nothing is attached to a Program or execution JSON.
const revisions = new WeakMap<Program, ProgramRevision>()

function sameRevision(program: Program, revision: ProgramRevision): boolean {
  return program.imports === revision.imports &&
    program.nodes.length === revision.nodes.length &&
    program.edges.length === revision.edges.length &&
    program.nodes.every((node, index) => {
      const old = revision.nodes[index]
      return node === old.node && node.id === old.id && node.type === old.type && node.text === old.text
    }) &&
    program.edges.every((edge, index) => {
      const old = revision.edges[index]
      return edge === old.edge && edge.id === old.id && edge.source === old.source &&
        edge.target === old.target && edge.label === old.label
    })
}

function syntaxCache<T>(parse: (source: string) => T): (source: string) => T {
  const entries = new Map<string, T>()
  return source => {
    if (entries.has(source)) return entries.get(source)!
    const syntax = parse(source)
    // Also bound the unusual case of old suspended sources or headless callers
    // supplying many different expressions against the same program revision.
    if (entries.size >= 1024) entries.delete(entries.keys().next().value!)
    entries.set(source, syntax)
    return syntax
  }
}

/** Check at execution boundaries, including in-place edits by headless callers. */
export function refreshProgram(program: Program): void {
  const old = revisions.get(program)
  if (old && sameRevision(program, old)) return

  const prepared: PreparedProgram = {
    nodes: new Map(), outgoing: new Map(), functions: new Map(), classes: new Map(), methods: new Map(),
    expression: syntaxCache(prepareExpression), assignment: syntaxCache(parseAssignment),
    forLoop: syntaxCache(parseForLoop), inputs: syntaxCache(parseInputVariables),
    process: syntaxCache(splitProcessStatements), output: syntaxCache(splitOutputExpressions),
  }
  for (const node of program.nodes) {
    // Array.find semantics: the first match wins, even in an invalid graph.
    if (!prepared.nodes.has(node.id)) prepared.nodes.set(node.id, node)
    if (node.type === 'function' && !prepared.functions.has(node.text.trim())) {
      prepared.functions.set(node.text.trim(), node)
    }
    if (node.type === 'class') {
      try {
        const { name } = parseClassDeclaration(node.text)
        if (!prepared.classes.has(name)) {
          prepared.classes.set(name, { name, fields: classAttributeNames(program, node), program, node })
        }
      } catch {
        // Keep validation and runtime errors at their existing call sites.
      }
    }
    const method = attachedMethodDefinition(program, node)
    if (method && !prepared.methods.has(method.qualifiedName)) {
      prepared.methods.set(method.qualifiedName, node)
    }
  }
  for (const edge of program.edges) {
    const outgoing = prepared.outgoing.get(edge.source)
    if (outgoing) outgoing.push(edge)
    else prepared.outgoing.set(edge.source, [edge])
  }
  revisions.set(program, {
    nodes: program.nodes.map(node => ({ node, id: node.id, type: node.type, text: node.text })),
    edges: program.edges.map(edge => ({ edge, id: edge.id, source: edge.source, target: edge.target, label: edge.label })),
    imports: program.imports,
    prepared,
  })
}

/** Callers refresh once per step/run/resumption, never in the lookup hot path. */
export function preparedProgram(program: Program): PreparedProgram {
  if (!revisions.has(program)) refreshProgram(program)
  return revisions.get(program)!.prepared
}

interface NamedDefinition { name: string; program: Program; node: ProgramNode }
const definitionIndexes = new WeakMap<NamedDefinition[], {
  snapshot: Array<{ definition: NamedDefinition; name: string }>
  byName: Map<string, NamedDefinition>
}>()

export function refreshDefinitions<T extends NamedDefinition>(definitions: T[]): void {
  const old = definitionIndexes.get(definitions)
  if (old && old.snapshot.length === definitions.length && definitions.every((definition, index) =>
    definition === old.snapshot[index].definition && definition.name === old.snapshot[index].name)) return
  const byName = new Map<string, T>()
  for (const definition of definitions) {
    if (!byName.has(definition.name)) byName.set(definition.name, definition)
  }
  definitionIndexes.set(definitions, {
    snapshot: definitions.map(definition => ({ definition, name: definition.name })), byName,
  })
}

export function preparedDefinition<T extends NamedDefinition>(definitions: T[], name: string): T | undefined {
  if (!definitionIndexes.has(definitions)) refreshDefinitions(definitions)
  return definitionIndexes.get(definitions)!.byName.get(name) as T | undefined
}
