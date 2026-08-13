export type FlowNodeType =
  | 'function'
  | 'class'
  | 'method'
  | 'return'
  | 'process'
  | 'assignment'
  | 'call'
  | 'input'
  | 'output'
  | 'if'
  | 'while'
  | 'for'

export type BranchLabel = 'true' | 'false'
export type DictionaryKey = number | string | boolean

export interface RuntimeDictionary {
  kind: 'dictionary'
  entries: Array<{ key: DictionaryKey; value: RuntimeValue }>
}

export interface RuntimeObject {
  kind: 'object'
  id: number
  className: string
}

export type RuntimeValue =
  | number
  | string
  | boolean
  | RuntimeValue[]
  | RuntimeDictionary
  | RuntimeObject
export type Environment = Record<string, RuntimeValue>

export interface ProgramPosition {
  x: number
  y: number
}

export interface ProgramNode {
  id: string
  type: FlowNodeType
  text: string
  comment?: string
  position: ProgramPosition
}

export interface ProgramEdge {
  id: string
  source: string
  target: string
  label?: BranchLabel
}

export interface Program {
  version: 1
  nodes: ProgramNode[]
  edges: ProgramEdge[]
  imports?: string
  inputQueue?: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export const FLOW_NODE_TYPES: readonly FlowNodeType[] = [
  'function',
  'class',
  'method',
  'return',
  'process',
  'assignment',
  'call',
  'input',
  'output',
  'if',
  'while',
  'for',
]

export const NODE_TYPE_LABELS: Record<FlowNodeType, string> = {
  function: 'Function',
  class: 'Class',
  method: 'Method',
  return: 'Return',
  process: 'Process',
  assignment: 'Assignment',
  call: 'Call',
  input: 'Input',
  output: 'Output',
  if: 'If',
  while: 'While',
  for: 'For',
}

export function isFlowNodeType(value: unknown): value is FlowNodeType {
  return (
    typeof value === 'string' &&
    FLOW_NODE_TYPES.includes(value as FlowNodeType)
  )
}

export function isBranchLabel(value: unknown): value is BranchLabel {
  return value === 'true' || value === 'false'
}

export function isBranchNodeType(type: FlowNodeType): boolean {
  return type === 'if' || type === 'while' || type === 'for'
}
