import { useCallback, useMemo, useState, type MouseEvent } from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Connection,
  type EdgeChange,
  type EdgeTypes,
  type ReactFlowInstance,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  createExecution,
  runExecution,
  stepExecution,
  type ExecutionState,
} from './lib/interpreter'
import { stringifyValue } from './lib/expression'
import { LoopbackEdge } from './components/LoopbackEdge'
import {
  DELETE_KEY_CODES,
  programToEdges,
  type EditorEdge,
} from './lib/editorEdges'
import {
  branchLabelFromHandle,
  sourceHandleForBranch,
} from './lib/flowRouting'
import { sampleProgram } from './lib/sampleProgram'
import {
  isBranchLabel,
  isBranchNodeType,
  NODE_TYPE_LABELS,
  type BranchLabel,
  type FlowNodeType,
  type Program,
  type RuntimeValue,
} from './lib/types'
import { normalizeImportedProgram, validateProgram } from './lib/validation'
import './App.css'

interface FlowNodeData extends Record<string, unknown> {
  nodeType: FlowNodeType
  text: string
  isCurrent?: boolean
  onTextChange?: (nodeId: string, text: string) => void
}

type EditorNode = Node<FlowNodeData, 'flowNode'>

interface SaveFilePickerWritable {
  write: (value: Blob) => Promise<void> | void
  close: () => Promise<void> | void
}

interface SaveFilePickerHandle {
  createWritable: () => Promise<SaveFilePickerWritable>
}

interface SaveFilePickerOptions {
  suggestedName: string
  types: Array<{
    description: string
    accept: Record<string, string[]>
  }>
}

interface WindowWithSaveFilePicker extends Window {
  showSaveFilePicker?: (
    options: SaveFilePickerOptions,
  ) => Promise<SaveFilePickerHandle>
}

const nodeTypes = {
  flowNode: FlowChartNode,
} satisfies NodeTypes

const edgeTypes = {
  loopback: LoopbackEdge,
} satisfies EdgeTypes

const DEFAULT_NODE_TEXT: Record<FlowNodeType, string> = {
  function: 'main',
  return: '0',
  assignment: 'x <- x + 1',
  input: 'n',
  output: 'total',
  if: 'x < 10',
  while: 'x < 10',
  for: 'item in L',
}

const NODE_PALETTE: FlowNodeType[] = [
  'function',
  'return',
  'assignment',
  'input',
  'output',
  'if',
  'while',
  'for',
]

const DECISION_SIDE_HANDLE_OFFSET = '15px'

const EXPORT_FILE_NAME = 'flowlab-program.json'
const EXPORT_FILE_OPTIONS: SaveFilePickerOptions = {
  suggestedName: EXPORT_FILE_NAME,
  types: [
    {
      description: 'FlowLab program JSON',
      accept: { 'application/json': ['.json'] },
    },
  ],
}

function App() {
  const [nodes, setNodes] = useState<EditorNode[]>(() =>
    programToNodes(sampleProgram),
  )
  const [edges, setEdges] = useState<EditorEdge[]>(() =>
    programToEdges(sampleProgram),
  )
  const [inputQueueText, setInputQueueText] = useState('3')
  const [execution, setExecution] = useState<ExecutionState | null>(null)
  const [message, setMessage] = useState('')
  const [pendingNodeType, setPendingNodeType] = useState<FlowNodeType | null>(
    null,
  )
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<EditorNode, EditorEdge> | null>(null)

  const program = useMemo(() => toProgram(nodes, edges), [nodes, edges])
  const validation = useMemo(() => validateProgram(program), [program])
  const currentNodeId = execution?.currentNodeId ?? null
  const showExecutionInputQueue =
    execution !== null && execution.status !== 'halted' && execution.status !== 'error'
  const visibleInputQueueText = showExecutionInputQueue
    ? formatInputQueue(execution.inputQueue)
    : inputQueueText
  const renderEdges = useMemo(() => programToEdges(program, edges), [program, edges])
  const variableEntries = useMemo(
    () =>
      Object.entries(execution?.environment ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    [execution],
  )

  const updateNodeText = useCallback(
    (nodeId: string, text: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, text } }
            : node,
        ),
      )
      setExecution(null)
    },
    [setNodes],
  )

  const renderNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isCurrent: node.id === currentNodeId,
          onTextChange: updateNodeText,
        },
      })),
    [currentNodeId, nodes, updateNodeText],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<EditorNode>[]) => {
      setNodes((currentNodes) => applyNodeChanges(changes, currentNodes))
      if (changes.some((change) => change.type === 'remove')) {
        setExecution(null)
      }
    },
    [setNodes],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<EditorEdge>[]) => {
      setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges))
      if (changes.some((change) => change.type === 'remove')) {
        setExecution(null)
      }
    },
    [setEdges],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return
      }

      setEdges((currentEdges) => {
        const sourceNode = nodes.find((node) => node.id === connection.source)
        const branchLabel =
          branchLabelFromHandle(connection.sourceHandle) ??
          (sourceNode ? nextBranchLabel(sourceNode, currentEdges) : undefined)

        const edge: EditorEdge = {
          ...connection,
          id: nextEdgeId(connection, currentEdges),
          source: connection.source,
          target: connection.target,
          sourceHandle:
            sourceNode && branchLabel
              ? sourceHandleForBranch(sourceNode.data.nodeType, branchLabel)
              : connection.sourceHandle,
          type: 'smoothstep',
          label: branchLabel,
        }

        return addEdge(edge, currentEdges)
      })
      setExecution(null)
    },
    [nodes, setEdges],
  )

  function selectNodeType(nodeType: FlowNodeType): void {
    setPendingNodeType(nodeType)
  }

  function addNodeAt(
    nodeType: FlowNodeType,
    position: { x: number; y: number },
  ): void {
    const newNode: EditorNode = {
      id: nextNodeId(nodeType, nodes),
      type: 'flowNode',
      position: centerNodePosition(nodeType, position),
      data: {
        nodeType,
        text: DEFAULT_NODE_TEXT[nodeType],
      },
    }

    setNodes((currentNodes) => [...currentNodes, newNode])
    setExecution(null)
  }

  function placePendingNode(event: MouseEvent): void {
    if (!pendingNodeType) {
      return
    }

    const position =
      flowInstance?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) ?? { x: event.clientX, y: event.clientY }

    addNodeAt(pendingNodeType, position)
    setPendingNodeType(null)
  }

  function resetSample(): void {
    setNodes(programToNodes(sampleProgram))
    setEdges(programToEdges(sampleProgram))
    setInputQueueText('3')
    setExecution(null)
    setPendingNodeType(null)
    setMessage('Sample program loaded.')
  }

  function resetExecution(): void {
    setMessage('')
    setExecution(createExecution(program, parseInputQueue(inputQueueText)))
  }

  function stepProgram(): void {
    setMessage('')
    setExecution((currentExecution) => {
      const activeExecution =
        currentExecution ?? createExecution(program, parseInputQueue(inputQueueText))
      return stepExecution(activeExecution)
    })
  }

  function runProgram(): void {
    setMessage('')
    const initialExecution = createExecution(
      program,
      parseInputQueue(inputQueueText),
    )
    setExecution(runExecution(initialExecution))
  }

  async function exportJson(): Promise<void> {
    const blob = programJsonBlob(program)
    const saveFilePicker = (window as WindowWithSaveFilePicker).showSaveFilePicker

    if (!saveFilePicker) {
      downloadProgramJson(blob)
      return
    }

    try {
      const handle = await saveFilePicker(EXPORT_FILE_OPTIONS)
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      setMessage('Program JSON exported.')
    } catch (error) {
      if (!isAbortError(error)) {
        setMessage(
          `Export failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  async function importJson(file: File | undefined): Promise<void> {
    if (!file) {
      return
    }

    try {
      const parsed = normalizeImportedProgram(JSON.parse(await file.text()))
      const result = validateProgram(parsed)

      if (!result.valid) {
        setMessage(`Import failed: ${result.errors.join(' ')}`)
        return
      }

      setNodes(programToNodes(parsed))
      setEdges(programToEdges(parsed))
      setExecution(null)
      setPendingNodeType(null)
      setMessage('Program JSON loaded.')
    } catch (error) {
      setMessage(
        `Import failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>FlowLab</h1>
          <p>Build flowchart programs, validate them, and step through execution.</p>
        </div>
        <div className="toolbar" aria-label="Program actions">
          <button type="button" onClick={resetSample}>
            Load Sample
          </button>
          <button
            type="button"
            onClick={() => {
              void exportJson()
            }}
          >
            Export JSON
          </button>
          <label className="file-button">
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                void importJson(event.target.files?.[0])
                event.currentTarget.value = ''
              }}
            />
          </label>
        </div>
      </header>

      <section className="workspace" aria-label="Flowchart workspace">
        <aside className="palette" aria-label="Node palette">
          <h2>Nodes</h2>
          <div className="palette-buttons">
            {NODE_PALETTE.map((nodeType) => (
              <button
                key={nodeType}
                type="button"
                className={
                  pendingNodeType === nodeType ? 'palette-button-active' : ''
                }
                aria-pressed={pendingNodeType === nodeType}
                onClick={() => selectNodeType(nodeType)}
              >
                Add {NODE_TYPE_LABELS[nodeType]}
              </button>
            ))}
          </div>

          <section className="validation-panel" aria-label="Graph validation">
            <h2>Validation</h2>
            {validation.valid ? (
              <p className="valid-message">Valid program</p>
            ) : (
              <ul className="error-list">
                {validation.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className="canvas-shell" aria-label="Visual editor">
          <ReactFlow
            nodes={renderNodes}
            edges={renderEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setFlowInstance}
            onPaneClick={placePendingNode}
            deleteKeyCode={DELETE_KEY_CODES}
            fitView
            defaultEdgeOptions={{ type: 'smoothstep' }}
          >
            <Background color="#d4d9e2" gap={18} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </section>

        <aside className="console-panel" aria-label="Console">
          <h2>Console</h2>
          <div className="execution-buttons">
            <button
              type="button"
              onClick={resetExecution}
              disabled={!validation.valid}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={stepProgram}
              disabled={!validation.valid}
            >
              Step
            </button>
            <button
              type="button"
              onClick={runProgram}
              disabled={!validation.valid}
            >
              Run
            </button>
          </div>

          <label className="input-label" htmlFor="input-queue">
            Input queue
          </label>
          <textarea
            id="input-queue"
            value={visibleInputQueueText}
            onChange={(event) => {
              if (!showExecutionInputQueue) {
                setInputQueueText(event.target.value)
              }
            }}
            readOnly={showExecutionInputQueue}
            rows={5}
            spellCheck={false}
          />

          <dl className="status-grid">
            <div>
              <dt>Status</dt>
              <dd>{formatStatus(execution)}</dd>
            </div>
            <div>
              <dt>Steps</dt>
              <dd>{execution?.steps ?? 0}</dd>
            </div>
          </dl>

          {message ? <p className="notice">{message}</p> : null}
          {execution?.error ? <p className="runtime-error">{execution.error}</p> : null}

          <section className="variables-panel" aria-label="Variables">
            <h3>Variables</h3>
            {variableEntries.length ? (
              <dl className="variable-list">
                {variableEntries.map(([name, value]) => (
                  <div className="variable-row" key={name}>
                    <dt>{name}</dt>
                    <dd>{formatRuntimeValue(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="empty-variables">No variables yet</p>
            )}
          </section>

          <section className="output-log" aria-label="Output">
            <h3>Output</h3>
            {execution?.output.length ? (
              execution.output.map((line, index) => (
                <div className="console-line" key={`${line}-${index}`}>
                  {line}
                </div>
              ))
            ) : (
              <p className="empty-output">No output yet</p>
            )}
          </section>
        </aside>
      </section>
    </main>
  )
}

function FlowChartNode({ id, data }: NodeProps<EditorNode>) {
  const label = NODE_TYPE_LABELS[data.nodeType]
  const editable =
    data.nodeType === 'function' ||
    data.nodeType === 'return' ||
    data.nodeType === 'assignment' ||
    data.nodeType === 'input' ||
    data.nodeType === 'output' ||
    data.nodeType === 'if' ||
    data.nodeType === 'while' ||
    data.nodeType === 'for'

  return (
    <div
      className={`flow-node flow-node-${data.nodeType}`}
      data-testid={`flow-node-${id}`}
      data-current={data.isCurrent ? 'true' : 'false'}
      data-shape={isBranchNodeType(data.nodeType) ? 'diamond' : 'block'}
    >
      {data.nodeType !== 'function' ? (
        <Handle className="node-handle" type="target" position={Position.Top} />
      ) : null}
      <div className="node-content">
        <div className="node-label">{label}</div>
        {editable ? (
          <>
            <label className="sr-only" htmlFor={`${id}-text`}>
              {label} text
            </label>
            <input
              id={`${id}-text`}
              className="node-input nodrag"
              value={data.text}
              onChange={(event) => data.onTextChange?.(id, event.target.value)}
              spellCheck={false}
            />
          </>
        ) : (
          <div className="fixed-node-text">{label}</div>
        )}
      </div>
      {isBranchNodeType(data.nodeType) ? (
        <>
          <Handle
            id={sourceHandleForBranch(data.nodeType, 'true')}
            className="node-handle node-handle-true"
            type="source"
            position={Position.Left}
            style={{
              left: DECISION_SIDE_HANDLE_OFFSET,
              transform: 'translateY(-50%)',
            }}
          />
          <Handle
            id={sourceHandleForBranch(data.nodeType, 'false')}
            className="node-handle node-handle-false"
            type="source"
            position={Position.Bottom}
          />
        </>
      ) : data.nodeType !== 'return' ? (
        <Handle
          className="node-handle"
          type="source"
          position={Position.Bottom}
        />
      ) : null}
    </div>
  )
}

function programToNodes(program: Program): EditorNode[] {
  return program.nodes.map((node) => ({
    id: node.id,
    type: 'flowNode',
    position: node.position,
    data: {
      nodeType: node.type,
      text: node.text,
    },
  }))
}

function toProgram(nodes: EditorNode[], edges: EditorEdge[]): Program {
  return {
    version: 1,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      text: node.data.text,
      position: node.position,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: isBranchLabel(edge.label) ? edge.label : undefined,
    })),
  }
}

function programJsonBlob(program: Program): Blob {
  return new Blob([JSON.stringify(program, null, 2)], {
    type: 'application/json',
  })
}

function downloadProgramJson(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = EXPORT_FILE_NAME
  anchor.click()
  URL.revokeObjectURL(url)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function nextBranchLabel(
  sourceNode: EditorNode,
  edges: EditorEdge[],
): BranchLabel | undefined {
  if (!isBranchNodeType(sourceNode.data.nodeType)) {
    return undefined
  }

  const usedLabels = new Set(
    edges
      .filter((edge) => edge.source === sourceNode.id)
      .map((edge) => edge.label)
      .filter(isBranchLabel),
  )

  if (!usedLabels.has('true')) {
    return 'true'
  }

  if (!usedLabels.has('false')) {
    return 'false'
  }

  return 'true'
}

function nextNodeId(nodeType: FlowNodeType, nodes: EditorNode[]): string {
  let suffix = 1
  let id = `${nodeType}-${suffix}`

  while (nodes.some((node) => node.id === id)) {
    suffix += 1
    id = `${nodeType}-${suffix}`
  }

  return id
}

function nextEdgeId(connection: Connection, edges: EditorEdge[]): string {
  const baseId = `edge-${connection.source}-${connection.target}`
  let suffix = 1
  let id = `${baseId}-${suffix}`

  while (edges.some((edge) => edge.id === id)) {
    suffix += 1
    id = `${baseId}-${suffix}`
  }

  return id
}

function centerNodePosition(
  nodeType: FlowNodeType,
  position: { x: number; y: number },
): { x: number; y: number } {
  const width = isBranchNodeType(nodeType) ? 188 : 170
  const height = isBranchNodeType(nodeType) ? 142 : 82

  return {
    x: position.x - width / 2,
    y: position.y - height / 2,
  }
}

function parseInputQueue(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function formatInputQueue(values: RuntimeValue[]): string {
  return values.map(formatRuntimeValue).join('\n')
}

function formatStatus(execution: ExecutionState | null): string {
  if (!execution) {
    return 'Not started'
  }

  return execution.status[0].toUpperCase() + execution.status.slice(1)
}

function formatRuntimeValue(value: RuntimeValue): string {
  return typeof value === 'string' ? `"${value}"` : stringifyValue(value)
}

export default App
