export type FlowNodeType =
  | 'function'
  | 'return'
  | 'assignment'
  | 'input'
  | 'output'
  | 'if'
  | 'while'
  | 'for'

export type BranchLabel = 'true' | 'false'
export type RuntimeValue = number | string | boolean | RuntimeValue[]
export type Environment = Record<string, RuntimeValue>

export interface ProgramPosition {
  x: number
  y: number
}

export interface ProgramNode {
  id: string
  type: FlowNodeType
  text: string
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
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export const FLOW_NODE_TYPES: readonly FlowNodeType[] = [
  'function',
  'return',
  'assignment',
  'input',
  'output',
  'if',
  'while',
  'for',
]

export const NODE_TYPE_LABELS: Record<FlowNodeType, string> = {
  function: 'Function',
  return: 'Return',
  assignment: 'Assignment',
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
