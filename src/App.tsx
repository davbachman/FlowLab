import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  ConnectionLineType,
  Handle,
  NodeResizeControl,
  Position,
  ReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type EdgeChange,
  type EdgeTypes,
  type KeyCode,
  type ReactFlowInstance,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  SelectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  answerAskExecution,
  completeImageLoadExecution,
  completeTextLoadExecution,
  createExecution,
  failImageLoadExecution,
  failTextLoadExecution,
  runExecution,
  stepExecution,
  type ExecutionState,
} from './lib/interpreter'
import {
  callableImportedClassNames,
  callableImportedFunctionNames,
  displayFlowLabFileName,
  importWarnings,
  parseImportNames,
  registerFlowLabProgram,
  resolveFlowLabImports,
  type FlowLabDirectoryHandle,
  type ImportResolution,
} from './lib/imports'
import { stringifyValue } from './lib/expression'
import {
  displayedImageData,
  downloadImage,
  IMAGE_LIBRARY_NAME,
  initialImageRuntimeState,
  loadImageFromUrl,
  paintImageCanvas,
  type ImageRuntimeState,
  type ImageSaveRequest,
} from './lib/image'
import {
  initialTurtleState,
  TURTLE_LIBRARY_NAME,
  type TurtleState,
} from './lib/turtle'
import { LoopbackEdge } from './components/LoopbackEdge'
import {
  DELETE_KEY_CODES,
  programToEdges,
  type EditorEdge,
} from './lib/editorEdges'
import {
  branchLabelFromHandle,
  CLASS_METHOD_NEW_HANDLE,
  classMethodHandleId,
  METHOD_OWNER_HANDLE,
  sourceHandleForBranch,
  sourceHandleForBranchConnection,
} from './lib/flowRouting'
import { FLOWLAB_EXAMPLES, type FlowLabExample } from './lib/examples'
import { isRuntimeObject } from './lib/runtimeValues'
import {
  parseClassDeclaration,
  splitProcessStatements,
  type ClassDeclaration,
} from './lib/statements'
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
  comment?: string
  isCurrent?: boolean
  isWidthCustomized?: boolean
  trueBranchHandle?: string
  attachedMethods?: AttachedMethodHandle[]
  onTextChange?: (nodeId: string, text: string) => void
  onResizeStart?: () => void
}

interface AttachedMethodHandle {
  nodeId: string
  name: string
}

type EditorNode = Node<FlowNodeData, 'flowNode'>

interface CanvasSnapshot {
  nodes: EditorNode[]
  edges: EditorEdge[]
}

interface TurtleViewState {
  panX: number
  panY: number
  zoom: number
}

interface TurtleViewBoxBounds {
  x: number
  y: number
  width: number
  height: number
}

interface TurtlePanDrag {
  pointerId: number
  startX: number
  startY: number
  startPanX: number
  startPanY: number
  viewBoxWidth: number
  viewBoxHeight: number
  rectWidth: number
  rectHeight: number
}

interface TurtlePointer {
  x: number
  y: number
}

interface TurtlePinch {
  pointerIds: [number, number]
  startDistance: number
  startView: TurtleViewState
  centerX: number
  centerY: number
  rect: DOMRect
}

interface FilenameRequest {
  resolve: (fileName: string | null) => void
}

interface CommentRequest {
  nodeId: string
}

interface SidebarResizeDrag {
  startX: number
  startWidth: number
}

interface ViewportSize {
  width: number
  height: number
}

type ToolbarMenuName = 'flowlab' | 'file' | 'edit' | 'examples'

interface ToolbarMenuProps {
  id: ToolbarMenuName
  label: string
  brand?: boolean
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  children: ReactNode
}

interface SaveFilePickerWritable {
  write: (value: Blob) => Promise<void> | void
  close: () => Promise<void> | void
}

interface SaveFilePickerHandle {
  name?: string
  createWritable: () => Promise<SaveFilePickerWritable>
}

interface SaveFilePickerOptions {
  id?: string
  suggestedName: string
  types: Array<{
    description: string
    accept: Record<string, string[]>
  }>
}

interface DirectoryPickerOptions {
  id?: string
  mode: 'read' | 'readwrite'
}

interface WindowWithFilePickers extends Window {
  showSaveFilePicker?: (
    options: SaveFilePickerOptions,
  ) => Promise<SaveFilePickerHandle>
  showDirectoryPicker?: (
    options: DirectoryPickerOptions,
  ) => Promise<FlowLabDirectoryHandle>
}

const nodeTypes = {
  flowNode: FlowChartNode,
} satisfies NodeTypes

const edgeTypes = {
  loopback: LoopbackEdge,
} satisfies EdgeTypes

const DEFAULT_NODE_TEXT: Record<FlowNodeType, string> = {
  function: 'main',
  class: 'Point(x, y)',
  method: 'move',
  return: '0',
  process: 'x <- 1\nsqrt(x)',
  assignment: 'x <- x + 1',
  call: 'forward(50)',
  input: 'n',
  output: 'total',
  if: 'x < 10',
  while: 'x < 10',
  for: 'item in L',
}

const DEFINITION_NODE_PALETTE: FlowNodeType[] = [
  'function',
  'class',
  'method',
]
const STEP_NODE_PALETTE: FlowNodeType[] = [
  'return',
  'process',
  'input',
  'output',
  'if',
  'while',
  'for',
]

const DECISION_SIDE_HANDLE_OFFSET = '15px'

const DEFAULT_DOCUMENT_NAME = 'untitled'
const README_URL = 'https://github.com/davbachman/FlowLab/blob/main/README.md'
const FILE_PICKER_ID = 'flowlab-programs'
const JSON_EXTENSION = '.json'
const EXPORT_FILE_TYPES: SaveFilePickerOptions['types'] = [
  {
    description: 'FlowLab program JSON',
    accept: { 'application/json': [JSON_EXTENSION] },
  },
]

const CANVAS_DRAG_BUTTONS = [2] satisfies number[]
const INITIAL_CANVAS_VIEWPORT = { x: 0, y: 0, zoom: 0.85 }
const COPY_PASTE_OFFSET = { x: 36, y: 36 }
const PROCESS_SPLIT_VERTICAL_GAP = 112
const HISTORY_LIMIT = 80
const NO_SELECTION_KEY = null satisfies KeyCode | null
const MULTI_SELECTION_KEY_CODES = [
  'Meta',
  'Control',
  'Shift',
] satisfies KeyCode
const DEFAULT_SIDEBAR_WIDTH = 420
const MIN_SIDEBAR_WIDTH = 340
const MAX_SIDEBAR_WIDTH = 720
const DEFAULT_AUTO_STEP_SPEED = 2
const MIN_AUTO_STEP_SPEED = 1
const MAX_AUTO_STEP_SPEED = 10
const VARIABLE_VALUE_PREVIEW_LINES = 4
const DEFAULT_TURTLE_VIEW: TurtleViewState = { panX: 0, panY: 0, zoom: 1 }
const MIN_TURTLE_ZOOM = 0.25
const MAX_TURTLE_ZOOM = 8
const TURTLE_WHEEL_ZOOM_INTENSITY = 0.004
const EMPTY_IMPORT_RESOLUTION: ImportResolution = {
  files: [],
  nativeLibraries: [],
  errors: [],
}

function currentViewportSize(): ViewportSize {
  const viewport = window.visualViewport

  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  }
}

function useViewportSize(): ViewportSize {
  const [viewportSize, setViewportSize] =
    useState<ViewportSize>(currentViewportSize)

  useEffect(() => {
    const viewport = window.visualViewport

    function updateViewportSize(): void {
      setViewportSize(currentViewportSize())
    }

    updateViewportSize()
    window.addEventListener('resize', updateViewportSize)
    viewport?.addEventListener('resize', updateViewportSize)
    viewport?.addEventListener('scroll', updateViewportSize)

    return () => {
      window.removeEventListener('resize', updateViewportSize)
      viewport?.removeEventListener('resize', updateViewportSize)
      viewport?.removeEventListener('scroll', updateViewportSize)
    }
  }, [])

  return viewportSize
}

function App() {
  const viewportSize = useViewportSize()
  const [nodes, setNodes] = useState<EditorNode[]>([])
  const [edges, setEdges] = useState<EditorEdge[]>([])
  const [inputQueueText, setInputQueueText] = useState('')
  const [documentName, setDocumentName] = useState(DEFAULT_DOCUMENT_NAME)
  const [filenameInput, setFilenameInput] = useState('')
  const [filenameRequest, setFilenameRequest] = useState<FilenameRequest | null>(
    null,
  )
  const [commentInputText, setCommentInputText] = useState('')
  const [commentRequest, setCommentRequest] = useState<CommentRequest | null>(
    null,
  )
  const [askInputText, setAskInputText] = useState('')
  const [importNamesText, setImportNamesText] = useState('')
  const [importDirectoryHandle, setImportDirectoryHandle] =
    useState<FlowLabDirectoryHandle | null>(null)
  const [importDirectoryName, setImportDirectoryName] = useState('')
  const [importResolution, setImportResolution] = useState<ImportResolution>(
    EMPTY_IMPORT_RESOLUTION,
  )
  const [importsLoading, setImportsLoading] = useState(false)
  const [execution, setExecution] = useState<ExecutionState | null>(null)
  const [autoStepEnabled, setAutoStepEnabled] = useState(false)
  const [autoStepSpeed, setAutoStepSpeed] = useState(DEFAULT_AUTO_STEP_SPEED)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [sidebarResizeDrag, setSidebarResizeDrag] =
    useState<SidebarResizeDrag | null>(null)
  const [message, setMessage] = useState('')
  const [openToolbarMenu, setOpenToolbarMenu] =
    useState<ToolbarMenuName | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [pendingNodeType, setPendingNodeType] = useState<FlowNodeType | null>(
    null,
  )
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<EditorNode, EditorEdge> | null>(null)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const clipboardRef = useRef<CanvasSnapshot | null>(null)
  const historyRef = useRef<CanvasSnapshot[]>([])
  const askResumeModeRef = useRef<'step' | 'auto-step' | 'run'>('step')
  const fitViewAfterLoadRef = useRef(false)
  const toolbarRef = useRef<HTMLElement | null>(null)
  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const processedImageSaveRequestsRef = useRef(
    new WeakSet<ImageSaveRequest>(),
  )
  const autoStepIsActive =
    autoStepEnabled &&
    (execution?.status === 'running' ||
      execution?.status === 'asking' ||
      execution?.status === 'loading')

  const closeAboutDialog = useCallback(() => {
    setAboutOpen(false)
    window.requestAnimationFrame(() => {
      document.getElementById('flowlab-menu-trigger')?.focus()
    })
  }, [])

  useEffect(() => {
    if (!openToolbarMenu) {
      return
    }

    function closeMenuOutsideToolbar(event: PointerEvent): void {
      const target = event.target
      if (
        target instanceof globalThis.Node &&
        !toolbarRef.current?.contains(target)
      ) {
        setOpenToolbarMenu(null)
      }
    }

    document.addEventListener('pointerdown', closeMenuOutsideToolbar)
    return () =>
      document.removeEventListener('pointerdown', closeMenuOutsideToolbar)
  }, [openToolbarMenu])

  useEffect(() => {
    if (!aboutOpen) {
      return
    }

    function closeAboutOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeAboutDialog()
      }
    }

    document.addEventListener('keydown', closeAboutOnEscape)
    return () => document.removeEventListener('keydown', closeAboutOnEscape)
  }, [aboutOpen, closeAboutDialog])

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  useEffect(() => {
    if (!flowInstance || !fitViewAfterLoadRef.current) {
      return
    }

    const allNodesMeasured =
      nodes.length > 0 &&
      nodes.every(
        (node) =>
          (node.measured?.width ?? 0) > 0 &&
          (node.measured?.height ?? 0) > 0,
      )
    if (!allNodesMeasured) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      fitViewAfterLoadRef.current = false
      void flowInstance.fitView({ padding: 0.08 })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [edges, flowInstance, nodes])

  useEffect(() => {
    if (!sidebarResizeDrag) {
      return
    }

    const drag = sidebarResizeDrag

    function onPointerMove(event: PointerEvent): void {
      const delta = drag.startX - event.clientX
      setSidebarWidth(
        clampSidebarWidth(drag.startWidth + delta),
      )
    }

    function onPointerUp(): void {
      setSidebarResizeDrag(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [sidebarResizeDrag])

  useEffect(() => {
    let cancelled = false

    if (!importNamesText.trim()) {
      return
    }

    void resolveFlowLabImports(importNamesText, {
      directoryHandle: importDirectoryHandle,
    })
      .then((resolution) => {
        if (cancelled) {
          return
        }

        setImportResolution(resolution)
        setImportsLoading(false)
        setExecution(null)
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        setImportResolution({
          files: [],
          nativeLibraries: [],
          errors: [
            `Imports failed: ${error instanceof Error ? error.message : String(error)}`,
          ],
        })
        setImportsLoading(false)
        setExecution(null)
      })

    return () => {
      cancelled = true
    }
  }, [importDirectoryHandle, importNamesText])

  useEffect(() => {
    if (execution?.status !== 'loading' || !execution.textRequest) {
      return
    }

    let cancelled = false
    const loadingExecution = execution
    const { url } = execution.textRequest

    void loadTextFromUrl(url)
      .then((text) => {
        if (cancelled) {
          return
        }

        setExecution((currentExecution) => {
          if (currentExecution !== loadingExecution) {
            return currentExecution
          }

          const resumedExecution = completeTextLoadExecution(
            currentExecution,
            text,
          )

          return askResumeModeRef.current === 'run'
            ? runExecution(resumedExecution)
            : resumedExecution
        })
        setMessage('')
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        setExecution((currentExecution) =>
          currentExecution === loadingExecution
            ? failTextLoadExecution(
                currentExecution,
                textLoadErrorMessage(url, error),
              )
            : currentExecution,
        )
        setMessage('')
      })

    return () => {
      cancelled = true
    }
  }, [execution])

  useEffect(() => {
    if (execution?.status !== 'loading' || !execution.imageRequest) {
      return
    }

    let cancelled = false
    const loadingExecution = execution
    const { url } = execution.imageRequest

    void loadImageFromUrl(url)
      .then((image) => {
        if (cancelled) {
          return
        }

        setExecution((currentExecution) => {
          if (currentExecution !== loadingExecution) {
            return currentExecution
          }

          const resumedExecution = completeImageLoadExecution(
            currentExecution,
            image,
          )

          return askResumeModeRef.current === 'run'
            ? runExecution(resumedExecution)
            : resumedExecution
        })
        setMessage('')
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        setExecution((currentExecution) =>
          currentExecution === loadingExecution
            ? failImageLoadExecution(
                currentExecution,
                imageLoadErrorMessage(url, error),
              )
            : currentExecution,
        )
        setMessage('')
      })

    return () => {
      cancelled = true
    }
  }, [execution])

  useEffect(() => {
    const requests = execution?.image?.saveRequests ?? []

    for (const request of requests) {
      if (processedImageSaveRequestsRef.current.has(request)) {
        continue
      }

      processedImageSaveRequestsRef.current.add(request)
      void downloadImage(request.image, request.fileName)
        .then(() => setMessage(`Image saved as ${request.fileName}.`))
        .catch((error: unknown) =>
          setMessage(
            `Image save failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        )
        .finally(() => {
          setExecution((currentExecution) => {
            if (!currentExecution?.image) {
              return currentExecution
            }

            return {
              ...currentExecution,
              image: {
                ...currentExecution.image,
                saveRequests: currentExecution.image.saveRequests.filter(
                  (candidate) => candidate !== request,
                ),
              },
            }
          })
        })
    }
  }, [execution?.image?.saveRequests])

  useEffect(() => {
    if (
      !autoStepIsActive ||
      execution?.status !== 'running' ||
      !execution.currentNodeId
    ) {
      return
    }

    const timeout = window.setTimeout(() => {
      setExecution((currentExecution) => {
        if (
          currentExecution?.status !== 'running' ||
          !currentExecution.currentNodeId
        ) {
          return currentExecution
        }

        return stepExecution(currentExecution)
      })
    }, 1000 / autoStepSpeed)

    return () => window.clearTimeout(timeout)
  }, [autoStepIsActive, autoStepSpeed, execution])

  const pushHistorySnapshot = useCallback(() => {
    const snapshot = cloneCanvasSnapshot({
      nodes: nodesRef.current,
      edges: edgesRef.current,
    })

    historyRef.current = [
      ...historyRef.current.slice(-(HISTORY_LIMIT - 1)),
      snapshot,
    ]
  }, [])

  const recordCanvasChangeStart = useCallback(() => {
    pushHistorySnapshot()
  }, [pushHistorySnapshot])

  const restoreCanvasSnapshot = useCallback((snapshot: CanvasSnapshot) => {
    const nextSnapshot = cloneCanvasSnapshot(snapshot)
    nodesRef.current = nextSnapshot.nodes
    edgesRef.current = nextSnapshot.edges
    setNodes(nextSnapshot.nodes)
    setEdges(nextSnapshot.edges)
    setExecution(null)
    setPendingNodeType(null)
  }, [])

  const program = useMemo(() => toProgram(nodes, edges), [nodes, edges])
  const nativeLibraryNames = useMemo(
    () => importResolution.nativeLibraries.map((library) => library.name),
    [importResolution.nativeLibraries],
  )
  const hasTurtleLibrary = nativeLibraryNames.includes(TURTLE_LIBRARY_NAME)
  const hasImageLibrary = nativeLibraryNames.includes(IMAGE_LIBRARY_NAME)
  const importedFunctionNames = useMemo(
    () =>
      callableImportedFunctionNames(
        importResolution.files,
        program,
        importResolution.nativeLibraries,
      ),
    [importResolution.files, importResolution.nativeLibraries, program],
  )
  const importedClassNames = useMemo(
    () => callableImportedClassNames(importResolution.files, program),
    [importResolution.files, program],
  )
  const importedPlainFunctionNames = useMemo(() => {
    const classNames = new Set(importedClassNames)
    return importedFunctionNames.filter((name) => !classNames.has(name))
  }, [importedClassNames, importedFunctionNames])
  const importedPrograms = useMemo(
    () => importResolution.files.map((file) => file.program),
    [importResolution.files],
  )
  const importWarningMessages = useMemo(
    () => importWarnings(importResolution.files, program),
    [importResolution.files, program],
  )
  const validation = useMemo(() => {
    const importErrors = [
      ...(importsLoading ? ['Imports are loading.'] : []),
      ...importResolution.errors,
    ]
    const result = validateProgram(program, {
      externalFunctionNames: new Set(importedFunctionNames),
      externalClassNames: new Set(importedClassNames),
    })

    return {
      valid: result.valid && importErrors.length === 0,
      errors: [...result.errors, ...importErrors],
    }
  }, [
    importResolution.errors,
    importedClassNames,
    importedFunctionNames,
    importsLoading,
    program,
  ])
  const currentNodeId = execution?.currentNodeId ?? null
  const executionIsBusy =
    execution?.status === 'asking' || execution?.status === 'loading'
  const showExecutionInputQueue =
    execution !== null && execution.status !== 'halted' && execution.status !== 'error'
  const visibleTurtleState = useMemo(
    () =>
      execution?.turtle ?? (hasTurtleLibrary ? initialTurtleState() : null),
    [execution?.turtle, hasTurtleLibrary],
  )
  const visibleImageState = useMemo(
    () =>
      execution?.image ??
      (hasImageLibrary ? initialImageRuntimeState() : null),
    [execution?.image, hasImageLibrary],
  )
  const visibleInputQueueText = showExecutionInputQueue
    ? formatInputQueue(execution.inputQueue)
    : inputQueueText
  const renderEdges = useMemo(() => programToEdges(program, edges), [program, edges])
  const exportFileName = useMemo(
    () => fileNameForDocument(documentName),
    [documentName],
  )
  const exportFileOptions = useMemo<SaveFilePickerOptions>(
    () => ({
      id: FILE_PICKER_ID,
      suggestedName: exportFileName,
      types: EXPORT_FILE_TYPES,
    }),
    [exportFileName],
  )
  const variableEntries = useMemo(
    () =>
      Object.entries(execution?.environment ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    [execution],
  )

  const updateNodeText = useCallback(
    (nodeId: string, text: string) => {
      pushHistorySnapshot()
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, text } }
            : node,
        ),
      )
      setExecution(null)
    },
    [pushHistorySnapshot, setNodes],
  )

  const renderNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isCurrent: node.id === currentNodeId,
          isWidthCustomized: node.width !== undefined,
          trueBranchHandle: trueBranchHandleForNode(node, edges),
          attachedMethods:
            node.data.nodeType === 'class'
              ? attachedMethodsForClass(node.id, nodes, edges)
              : undefined,
          onTextChange: updateNodeText,
          onResizeStart: recordCanvasChangeStart,
        },
      })),
    [
      currentNodeId,
      edges,
      nodes,
      recordCanvasChangeStart,
      updateNodeText,
    ],
  )
  const combinableSelection = useMemo(
    () => selectedLinearNodeChain(nodes, edges),
    [edges, nodes],
  )
  const splittableProcess = useMemo(
    () => selectedProcessNode(nodes),
    [nodes],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<EditorNode>[]) => {
      setNodes((currentNodes) => applyNodeChanges(changes, currentNodes))
      if (changes.some((change) => change.type !== 'select')) {
        setExecution(null)
      }
    },
    [setNodes],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<EditorEdge>[]) => {
      setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges))
      if (changes.some((change) => change.type !== 'select')) {
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

      const sourceNode = nodes.find((node) => node.id === connection.source)
      const targetNode = nodes.find((node) => node.id === connection.target)
      const isClassMethodAttachment =
        sourceNode?.data.nodeType === 'class' &&
        targetNode?.data.nodeType === 'method' &&
        connection.sourceHandle === CLASS_METHOD_NEW_HANDLE &&
        connection.targetHandle === METHOD_OWNER_HANDLE
      const attachmentEdgeId = isClassMethodAttachment
        ? nextEdgeId(connection, edges)
        : null

      pushHistorySnapshot()
      setEdges((currentEdges) => {
        const branchLabel =
          branchLabelFromHandle(connection.sourceHandle) ??
          (sourceNode ? nextBranchLabel(sourceNode, currentEdges) : undefined)

        const edge: EditorEdge = {
          ...connection,
          id: attachmentEdgeId ?? nextEdgeId(connection, currentEdges),
          source: connection.source,
          target: connection.target,
          sourceHandle:
            sourceNode && branchLabel
              ? sourceHandleForBranchConnection(
                  sourceNode.data.nodeType,
                  branchLabel,
                  connection.sourceHandle,
                )
              : connection.sourceHandle,
          type: 'smoothstep',
          label: branchLabel,
        }

        return addEdge(edge, currentEdges)
      })

      if (attachmentEdgeId) {
        if (sourceNode?.width !== undefined) {
          const attachedMethodCount =
            attachedMethodsForClass(sourceNode.id, nodes, edges).length + 1
          const minimumWidth = minimumNodeWidth('class', attachedMethodCount)

          if (sourceNode.width < minimumWidth) {
            setNodes((currentNodes) =>
              currentNodes.map((node) =>
                node.id === sourceNode.id
                  ? { ...node, width: minimumWidth }
                  : node,
              ),
            )
          }
        }

        // Keep the edge on the already-measured open handle until React Flow
        // has measured the newly expanded, method-specific handle row.
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              setEdges((currentEdges) =>
                currentEdges.map((edge) =>
                  edge.id === attachmentEdgeId
                    ? {
                        ...edge,
                        sourceHandle: classMethodHandleId(connection.target),
                      }
                    : edge,
                ),
              )
            })
          })
        })
      }

      setExecution(null)
    },
    [edges, nodes, pushHistorySnapshot, setEdges],
  )

  const isValidConnection = useCallback(
    (connection: Connection | EditorEdge) => {
      const sourceNode = nodes.find((node) => node.id === connection.source)
      const targetNode = nodes.find((node) => node.id === connection.target)

      if (!sourceNode || !targetNode) {
        return false
      }

      const startsAtClass = sourceNode.data.nodeType === 'class'
      const endsAtMethod = targetNode.data.nodeType === 'method'

      if (startsAtClass || endsAtMethod) {
        if (
          !startsAtClass ||
          !endsAtMethod ||
          connection.sourceHandle !== CLASS_METHOD_NEW_HANDLE ||
          connection.targetHandle !== METHOD_OWNER_HANDLE
        ) {
          return false
        }

        return !edges.some((edge) => {
          if (edge.target !== targetNode.id) {
            return false
          }

          return nodes.some(
            (node) =>
              node.id === edge.source && node.data.nodeType === 'class',
          )
        })
      }

      return true
    },
    [edges, nodes],
  )

  function selectNodeType(nodeType: FlowNodeType): void {
    setPendingNodeType(nodeType)
  }

  function addNodeAt(
    nodeType: FlowNodeType,
    position: { x: number; y: number },
  ): void {
    pushHistorySnapshot()
    const newNode: EditorNode = {
      id: nextNodeId(nodeType, nodes),
      type: 'flowNode',
      position: centerNodePosition(nodeType, position),
      data: {
        nodeType,
        text: defaultNodeText(nodeType),
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

  function focusToolbarTrigger(menu: ToolbarMenuName): void {
    document.getElementById(`${menu}-menu-trigger`)?.focus()
  }

  function closeToolbarMenuAndFocus(menu: ToolbarMenuName): void {
    setOpenToolbarMenu(null)
    focusToolbarTrigger(menu)
  }

  function runToolbarAction(
    menu: ToolbarMenuName,
    action: () => void,
  ): void {
    closeToolbarMenuAndFocus(menu)
    action()
  }

  function openAboutDialog(): void {
    setOpenToolbarMenu(null)
    setAboutOpen(true)
  }

  function openImportPicker(): void {
    closeToolbarMenuAndFocus('file')
    importFileInputRef.current?.click()
  }

  function loadExample(example: FlowLabExample): void {
    pushHistorySnapshot()
    fitViewAfterLoadRef.current = true
    setNodes(programToNodes(example.program))
    setEdges(programToEdges(example.program))
    setInputQueueText(example.inputQueue)
    const currentImports = parseImportNames(importNamesText)
    const missingImports = example.requiredImports.filter(
      (name) => !currentImports.includes(name),
    )
    if (missingImports.length) {
      updateImportNames(
        [...currentImports, ...missingImports].join('\n'),
      )
    }
    setDocumentName(DEFAULT_DOCUMENT_NAME)
    setExecution(null)
    setPendingNodeType(null)
    setMessage(example.message)
  }

  function clearCanvas(): void {
    pushHistorySnapshot()
    setNodes([])
    setEdges([])
    setDocumentName(DEFAULT_DOCUMENT_NAME)
    setExecution(null)
    setPendingNodeType(null)
    setMessage('Canvas cleared.')
  }

  function resetExecution(): void {
    setMessage('')
    setAutoStepEnabled(false)
    askResumeModeRef.current = 'step'
    setExecution(
      createExecution(program, parseInputQueue(inputQueueText), {
        importedPrograms,
        nativeLibraries: nativeLibraryNames,
      }),
    )
  }

  function stepProgram(): void {
    setMessage('')
    setAutoStepEnabled(false)
    askResumeModeRef.current = 'step'
    setExecution((currentExecution) => {
      const activeExecution =
        currentExecution ??
        createExecution(program, parseInputQueue(inputQueueText), {
          importedPrograms,
          nativeLibraries: nativeLibraryNames,
        })
      return stepExecution(activeExecution)
    })
  }

  function runProgram(): void {
    setMessage('')
    setAutoStepEnabled(false)
    askResumeModeRef.current = 'run'
    const initialExecution = createExecution(
      program,
      parseInputQueue(inputQueueText),
      { importedPrograms, nativeLibraries: nativeLibraryNames },
    )
    setExecution(runExecution(initialExecution))
  }

  function toggleAutoStepProgram(): void {
    setMessage('')

    if (autoStepIsActive) {
      setAutoStepEnabled(false)
      askResumeModeRef.current = 'step'
      return
    }

    askResumeModeRef.current = 'auto-step'
    setExecution((currentExecution) => {
      if (
        currentExecution &&
        currentExecution.status !== 'halted' &&
        currentExecution.status !== 'error' &&
        currentExecution.status !== 'waiting'
      ) {
        return currentExecution
      }

      return createExecution(program, parseInputQueue(inputQueueText), {
        importedPrograms,
        nativeLibraries: nativeLibraryNames,
      })
    })
    setAutoStepEnabled(true)
  }

  function startSidebarResize(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    setSidebarResizeDrag({
      startX: event.clientX,
      startWidth: sidebarWidth,
    })
  }

  function updateImportNames(text: string): void {
    setImportNamesText(text)
    setExecution(null)

    if (text.trim()) {
      setImportsLoading(true)
      return
    }

    setImportResolution(EMPTY_IMPORT_RESOLUTION)
    setImportsLoading(false)
  }

  const onBeforeDelete = useCallback(
    async ({ nodes: deletedNodes, edges: deletedEdges }: CanvasSnapshot) => {
      if (deletedNodes.length || deletedEdges.length) {
        pushHistorySnapshot()
      }

      return true
    },
    [pushHistorySnapshot],
  )

  const selectClickedNode = useCallback((event: MouseEvent, node: EditorNode) => {
    const shouldExtendSelection = event.metaKey || event.ctrlKey || event.shiftKey

    setNodes((currentNodes) => {
      const nextNodes = currentNodes.map((currentNode) => ({
        ...currentNode,
        selected: shouldExtendSelection
          ? currentNode.id === node.id || Boolean(currentNode.selected)
          : currentNode.id === node.id,
      }))

      nodesRef.current = nextNodes
      return nextNodes
    })
    setEdges((currentEdges) => {
      const nextEdges = currentEdges.map((edge) =>
        edge.selected ? { ...edge, selected: false } : edge,
      )

      edgesRef.current = nextEdges
      return nextEdges
    })
  }, [])

  const openNodeCommentDialog = useCallback(
    (event: MouseEvent, node: EditorNode) => {
      event.preventDefault()
      setCommentInputText(node.data.comment ?? '')
      setCommentRequest({ nodeId: node.id })
    },
    [],
  )

  const copySelection = useCallback(() => {
    const selectedNodes = nodesRef.current.filter((node) => node.selected)

    if (!selectedNodes.length) {
      setMessage('Select blocks to copy.')
      return
    }

    const selectedNodeIds = new Set(selectedNodes.map((node) => node.id))
    const selectedEdges = edgesRef.current.filter(
      (edge) =>
        selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target),
    )

    clipboardRef.current = cloneCanvasSnapshot({
      nodes: selectedNodes,
      edges: selectedEdges,
    })
    setMessage(`${selectedNodes.length} block${selectedNodes.length === 1 ? '' : 's'} copied.`)
  }, [])

  const pasteSelection = useCallback(() => {
    const clipboard = clipboardRef.current

    if (!clipboard?.nodes.length) {
      setMessage('Nothing to paste.')
      return
    }

    pushHistorySnapshot()

    const usedNodeIds = new Set(nodesRef.current.map((node) => node.id))
    const usedEdgeIds = new Set(edgesRef.current.map((edge) => edge.id))
    const nodeIdMap = new Map<string, string>()
    const pastedNodes = clipboard.nodes.map((node) => {
      const id = nextCopiedId(node.id, usedNodeIds)
      nodeIdMap.set(node.id, id)

      return {
        ...node,
        id,
        selected: true,
        position: offsetPosition(node.position, COPY_PASTE_OFFSET),
        data: { ...node.data },
      }
    })
    const pastedEdges = clipboard.edges.flatMap((edge) => {
      const source = nodeIdMap.get(edge.source)
      const target = nodeIdMap.get(edge.target)

      if (!source || !target) {
        return []
      }

      return [
        {
          ...edge,
          id: nextCopiedId(edge.id, usedEdgeIds),
          source,
          target,
          selected: true,
          data: edge.data ? { ...edge.data } : undefined,
        },
      ]
    })
    const nextNodes = [
      ...nodesRef.current.map((node) =>
        node.selected ? { ...node, selected: false } : node,
      ),
      ...pastedNodes,
    ]
    const nextEdges = [
      ...edgesRef.current.map((edge) =>
        edge.selected ? { ...edge, selected: false } : edge,
      ),
      ...pastedEdges,
    ]

    nodesRef.current = nextNodes
    edgesRef.current = nextEdges
    setNodes(nextNodes)
    setEdges(nextEdges)
    clipboardRef.current = cloneCanvasSnapshot({
      nodes: pastedNodes,
      edges: pastedEdges,
    })
    setExecution(null)
    setPendingNodeType(null)
    setMessage(`${pastedNodes.length} block${pastedNodes.length === 1 ? '' : 's'} pasted.`)
  }, [pushHistorySnapshot])

  const undoCanvasChange = useCallback(() => {
    const previousSnapshot = historyRef.current.at(-1)

    if (!previousSnapshot) {
      setMessage('Nothing to undo.')
      return
    }

    historyRef.current = historyRef.current.slice(0, -1)
    restoreCanvasSnapshot(previousSnapshot)
    setMessage('Undo.')
  }, [restoreCanvasSnapshot])

  const combineSelectionIntoProcess = useCallback(() => {
    const chain = selectedLinearNodeChain(nodesRef.current, edgesRef.current)

    if (!chain) {
      setMessage(
        'Select one straight-line chain of Assignment, Call, or Process blocks.',
      )
      return
    }

    pushHistorySnapshot()
    const entryNode = chain[0]
    const exitNode = chain.at(-1) as EditorNode
    const selectedNodeIds = new Set(chain.map((node) => node.id))
    const comments = chain
      .map((node) => node.data.comment?.trim())
      .filter((comment): comment is string => Boolean(comment))
    const processNode: EditorNode = {
      ...entryNode,
      width:
        entryNode.width === undefined
          ? undefined
          : Math.max(entryNode.width, minimumNodeWidth('process')),
      measured: undefined,
      selected: true,
      data: {
        ...entryNode.data,
        nodeType: 'process',
        text: chain
          .map((node) => node.data.text.trim())
          .filter(Boolean)
          .join('\n'),
        comment: comments.length ? comments.join('\n\n') : undefined,
      },
    }
    const nextNodes = nodesRef.current.flatMap((node) => {
      if (node.id === entryNode.id) {
        return [processNode]
      }

      return selectedNodeIds.has(node.id) ? [] : [{ ...node, selected: false }]
    })
    const nextEdges = edgesRef.current.flatMap((edge) => {
      const sourceIsSelected = selectedNodeIds.has(edge.source)
      const targetIsSelected = selectedNodeIds.has(edge.target)

      if (sourceIsSelected && targetIsSelected) {
        return []
      }

      if (edge.source === exitNode.id) {
        return [
          {
            ...edge,
            source: entryNode.id,
            sourceHandle: null,
            selected: false,
          },
        ]
      }

      return [{ ...edge, selected: false }]
    })

    nodesRef.current = nextNodes
    edgesRef.current = nextEdges
    setNodes(nextNodes)
    setEdges(nextEdges)
    setExecution(null)
    setPendingNodeType(null)
    setMessage(`${chain.length} blocks combined into one Process.`)
  }, [pushHistorySnapshot])

  const splitSelectedProcess = useCallback(() => {
    const processNode = selectedProcessNode(nodesRef.current)

    if (!processNode) {
      setMessage('Select exactly one Process block to split.')
      return
    }

    const statements = splitProcessStatements(processNode.data.text)
    if (!statements.length) {
      setMessage('The selected Process has no statements to split.')
      return
    }

    pushHistorySnapshot()
    const createdNodes: EditorNode[] = []
    for (const [index, statement] of statements.entries()) {
      const id =
        index === 0
          ? processNode.id
          : nextNodeId(statement.kind, [
              ...nodesRef.current,
              ...createdNodes,
            ])
      createdNodes.push({
        id,
        type: 'flowNode',
        width:
          processNode.width === undefined
            ? undefined
            : Math.max(
                processNode.width,
                minimumNodeWidth(statement.kind),
              ),
        position: {
          x: processNode.position.x,
          y: processNode.position.y + index * PROCESS_SPLIT_VERTICAL_GAP,
        },
        selected: true,
        data: {
          nodeType: statement.kind,
          text: statement.text,
          comment: index === 0 ? processNode.data.comment : undefined,
        },
      })
    }

    const lastNode = createdNodes.at(-1) as EditorNode
    const rewiredEdges = edgesRef.current.map((edge) =>
      edge.source === processNode.id
        ? { ...edge, source: lastNode.id, sourceHandle: null, selected: false }
        : { ...edge, selected: false },
    )
    const internalEdges: EditorEdge[] = []
    for (let index = 0; index < createdNodes.length - 1; index += 1) {
      const source = createdNodes[index].id
      const target = createdNodes[index + 1].id
      const connection: Connection = {
        source,
        target,
        sourceHandle: null,
        targetHandle: null,
      }
      internalEdges.push({
        ...connection,
        id: nextEdgeId(connection, [...rewiredEdges, ...internalEdges]),
        type: 'smoothstep',
      })
    }

    const nextNodes = nodesRef.current.flatMap((node) =>
      node.id === processNode.id
        ? createdNodes
        : [{ ...node, selected: false }],
    )
    const nextEdges = [...rewiredEdges, ...internalEdges]

    nodesRef.current = nextNodes
    edgesRef.current = nextEdges
    setNodes(nextNodes)
    setEdges(nextEdges)
    setExecution(null)
    setPendingNodeType(null)
    setMessage(
      `Process split into ${createdNodes.length} block${
        createdNodes.length === 1 ? '' : 's'
      }.`,
    )
  }, [pushHistorySnapshot])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const key = event.key.toLowerCase()

      if (
        document.querySelector('[aria-modal="true"]') ||
        isEditableShortcutTarget(event.target) ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey)
      ) {
        return
      }

      if (key === 'c') {
        event.preventDefault()
        copySelection()
      } else if (key === 'v') {
        event.preventDefault()
        pasteSelection()
      } else if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undoCanvasChange()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [copySelection, pasteSelection, undoCanvasChange])

  async function exportJson(): Promise<void> {
    const exportedProgram = programWithSavedRuntimeState(
      program,
      importNamesText,
      inputQueueText,
    )
    const blob = programJsonBlob(exportedProgram)
    const saveFilePicker = (window as WindowWithFilePickers).showSaveFilePicker
    const directoryPicker = (window as WindowWithFilePickers).showDirectoryPicker

    if (importDirectoryHandle || directoryPicker) {
      let directoryHandle: FlowLabDirectoryHandle | null = importDirectoryHandle

      try {
        if (!directoryHandle) {
          setMessage('Choose a location.')
          directoryHandle = await chooseExportDirectory()
        }

        if (!directoryHandle) {
          setMessage('Export canceled.')
          return
        }

        const savedFileName = await requestExportFileName(exportFileName)

        if (!savedFileName) {
          setMessage('Export canceled.')
          return
        }

        await writeProgramToDirectory(directoryHandle, savedFileName, blob)
        registerFlowLabProgram(savedFileName, exportedProgram)
        setDocumentName(documentNameFromFileName(savedFileName))
        const directoryName = directoryHandle.name ?? importDirectoryName
        setMessage(
          directoryName
            ? `Program exported. Imports folder: ${directoryName}.`
            : 'Program exported.',
        )
      } catch (error) {
        if (isAbortError(error)) {
          setMessage('Export canceled.')
        } else {
          setMessage(
            `Export failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      return
    }

    if (!saveFilePicker) {
      registerFlowLabProgram(exportFileName, exportedProgram)
      downloadProgramJson(blob, exportFileName)
      setDocumentName(documentNameFromFileName(exportFileName))
      setMessage('Program exported.')
      return
    }

    try {
      const handle = await saveFilePicker(exportFileOptions)
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      const savedFileName = handle.name ?? exportFileName
      registerFlowLabProgram(savedFileName, exportedProgram)
      setDocumentName(documentNameFromFileName(savedFileName))
      setMessage('Program exported.')
    } catch (error) {
      if (!isAbortError(error)) {
        setMessage(
          `Export failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  async function chooseExportDirectory(): Promise<FlowLabDirectoryHandle | null> {
    const directoryPicker = (window as WindowWithFilePickers).showDirectoryPicker

    if (!directoryPicker) {
      return null
    }

    const directoryHandle = await directoryPicker({
      id: FILE_PICKER_ID,
      mode: 'readwrite',
    })
    const directoryName = directoryHandle.name ?? ''

    setImportDirectoryHandle(directoryHandle)
    setImportDirectoryName(directoryName)

    return directoryHandle
  }

  function requestExportFileName(defaultFileName: string): Promise<string | null> {
    setFilenameInput(defaultFileName)

    return new Promise((resolve) => {
      setFilenameRequest({ resolve })
    })
  }

  async function writeProgramToDirectory(
    directoryHandle: FlowLabDirectoryHandle,
    fileName: string,
    blob: Blob,
  ): Promise<void> {
    const fileHandle = await directoryHandle.getFileHandle(fileName, {
      create: true,
    })
    const writable = await fileHandle.createWritable?.()

    if (!writable) {
      throw new Error('The selected folder cannot be written to.')
    }

    await writable.write(blob)
    await writable.close()
  }

  function submitFilenameRequest(event: FormEvent): void {
    event.preventDefault()
    focusToolbarTrigger('file')
    filenameRequest?.resolve(fileNameForDocument(filenameInput))
    setFilenameRequest(null)
  }

  function cancelFilenameRequest(): void {
    focusToolbarTrigger('file')
    filenameRequest?.resolve(null)
    setFilenameRequest(null)
  }

  function submitCommentRequest(event: FormEvent): void {
    event.preventDefault()

    if (!commentRequest) {
      return
    }

    pushHistorySnapshot()
    const comment = commentInputText.trim() ? commentInputText : undefined

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === commentRequest.nodeId
          ? { ...node, data: { ...node.data, comment } }
          : node,
      ),
    )
    setCommentRequest(null)
    setCommentInputText('')
    setExecution(null)
  }

  function cancelCommentRequest(): void {
    setCommentRequest(null)
    setCommentInputText('')
  }

  function submitAskInput(event: FormEvent): void {
    event.preventDefault()

    setExecution((currentExecution) => {
      if (!currentExecution) {
        return currentExecution
      }

      const resumedExecution = answerAskExecution(
        currentExecution,
        askInputText,
      )

      return askResumeModeRef.current === 'run'
        ? runExecution(resumedExecution)
        : resumedExecution
    })
    setAskInputText('')
  }

  async function importJson(file: File | undefined): Promise<void> {
    if (!file) {
      return
    }

    try {
      const parsed = normalizeImportedProgram(JSON.parse(await file.text()))
      const savedImportsText =
        typeof parsed.imports === 'string' ? parsed.imports : null
      const savedInputQueueText =
        typeof parsed.inputQueue === 'string' ? parsed.inputQueue : null
      let validationFunctionNames = importedFunctionNames
      let validationClassNames = importedClassNames
      let nextImportResolution: ImportResolution | null = null

      if (savedImportsText !== null) {
        nextImportResolution = savedImportsText.trim()
          ? await resolveFlowLabImports(savedImportsText, {
              directoryHandle: importDirectoryHandle,
            })
          : EMPTY_IMPORT_RESOLUTION
        validationFunctionNames = callableImportedFunctionNames(
          nextImportResolution.files,
          parsed,
          nextImportResolution.nativeLibraries,
        )
        validationClassNames = callableImportedClassNames(
          nextImportResolution.files,
          parsed,
        )
      }

      const result = validateProgram(parsed, {
        externalFunctionNames: new Set(validationFunctionNames),
        externalClassNames: new Set(validationClassNames),
      })
      const importErrors = nextImportResolution?.errors ?? []

      if (!result.valid || importErrors.length) {
        setMessage(
          `Import failed: ${[...result.errors, ...importErrors].join(' ')}`,
        )
        return
      }

      registerFlowLabProgram(file.name, parsed)
      pushHistorySnapshot()
      setNodes(programToNodes(parsed))
      setEdges(programToEdges(parsed))
      if (savedImportsText !== null) {
        setImportNamesText(savedImportsText)
        setImportResolution(nextImportResolution ?? EMPTY_IMPORT_RESOLUTION)
        setImportsLoading(false)
      }
      if (savedInputQueueText !== null) {
        setInputQueueText(savedInputQueueText)
      }
      setDocumentName(documentNameFromFileName(file.name))
      setExecution(null)
      setPendingNodeType(null)
      setMessage('Program loaded.')
    } catch (error) {
      setMessage(
        `Import failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return (
    <main
      className="app-shell"
      style={
        {
          '--app-viewport-width': `${viewportSize.width}px`,
          '--app-viewport-height': `${viewportSize.height}px`,
        } as CSSProperties
      }
    >
      <header className="topbar">
        <h1 className="sr-only">FlowLab</h1>
        <nav
          ref={toolbarRef}
          className="app-menu-bar"
          aria-label="Application menus"
        >
          <ToolbarMenu
            id="flowlab"
            label="FlowLab"
            brand
            isOpen={openToolbarMenu === 'flowlab'}
            onOpen={() => setOpenToolbarMenu('flowlab')}
            onClose={() => setOpenToolbarMenu(null)}
          >
            <button
              type="button"
              className="toolbar-menu-item"
              data-menu-item
              role="menuitem"
              onClick={openAboutDialog}
            >
              About
            </button>
            <a
              className="toolbar-menu-item"
              data-menu-item
              href={README_URL}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => closeToolbarMenuAndFocus('flowlab')}
            >
              Instructions
            </a>
          </ToolbarMenu>

          <ToolbarMenu
            id="file"
            label="File"
            isOpen={openToolbarMenu === 'file'}
            onOpen={() => setOpenToolbarMenu('file')}
            onClose={() => setOpenToolbarMenu(null)}
          >
            <button
              type="button"
              className="toolbar-menu-item"
              data-menu-item
              role="menuitem"
              onClick={() => runToolbarAction('file', clearCanvas)}
            >
              New
            </button>
            <button
              type="button"
              className="toolbar-menu-item"
              data-menu-item
              role="menuitem"
              onClick={() =>
                runToolbarAction('file', () => {
                  void exportJson()
                })
              }
            >
              Save
            </button>
            <button
              type="button"
              className="toolbar-menu-item"
              data-menu-item
              role="menuitem"
              onClick={openImportPicker}
            >
              Load
            </button>
          </ToolbarMenu>

          <ToolbarMenu
            id="edit"
            label="Edit"
            isOpen={openToolbarMenu === 'edit'}
            onOpen={() => setOpenToolbarMenu('edit')}
            onClose={() => setOpenToolbarMenu(null)}
          >
            <button
              type="button"
              className="toolbar-menu-item"
              data-menu-item
              role="menuitem"
              disabled={!combinableSelection}
              onClick={() =>
                runToolbarAction('edit', combineSelectionIntoProcess)
              }
            >
              Combine into Process
            </button>
            <button
              type="button"
              className="toolbar-menu-item"
              data-menu-item
              role="menuitem"
              disabled={!splittableProcess}
              onClick={() => runToolbarAction('edit', splitSelectedProcess)}
            >
              Split Process
            </button>
          </ToolbarMenu>

          <ToolbarMenu
            id="examples"
            label="Examples"
            isOpen={openToolbarMenu === 'examples'}
            onOpen={() => setOpenToolbarMenu('examples')}
            onClose={() => setOpenToolbarMenu(null)}
          >
            {FLOWLAB_EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                className="toolbar-menu-item"
                data-menu-item
                role="menuitem"
                onClick={() =>
                  runToolbarAction('examples', () => loadExample(example))
                }
              >
                {example.label}
              </button>
            ))}
          </ToolbarMenu>
        </nav>

        <span className="document-name" aria-label="Current document">
          {documentName}
        </span>
        <input
          ref={importFileInputRef}
          className="toolbar-file-input"
          type="file"
          accept="application/json,.json"
          aria-label="Import"
          onChange={(event) => {
            void importJson(event.target.files?.[0])
            event.currentTarget.value = ''
          }}
        />
      </header>

      <section
        className="workspace"
        aria-label="Flowchart workspace"
        style={
          {
            '--runtime-sidebar-width': `${sidebarWidth}px`,
          } as CSSProperties
        }
      >
        <aside className="palette" aria-label="Node palette">
          <h2>Nodes</h2>
          <section className="palette-group" aria-labelledby="definitions-heading">
            <h3 id="definitions-heading">Definitions</h3>
            <div className="palette-buttons">
              {DEFINITION_NODE_PALETTE.map((nodeType) => (
                <button
                  key={nodeType}
                  type="button"
                  className={
                    pendingNodeType === nodeType ? 'palette-button-active' : ''
                  }
                  aria-pressed={pendingNodeType === nodeType}
                  onClick={() => selectNodeType(nodeType)}
                >
                  {NODE_TYPE_LABELS[nodeType]}
                </button>
              ))}
            </div>
          </section>
          <section className="palette-group" aria-labelledby="steps-heading">
            <h3 id="steps-heading">Steps</h3>
            <div className="palette-buttons">
              {STEP_NODE_PALETTE.map((nodeType) => (
                <button
                  key={nodeType}
                  type="button"
                  className={
                    pendingNodeType === nodeType ? 'palette-button-active' : ''
                  }
                  aria-pressed={pendingNodeType === nodeType}
                  onClick={() => selectNodeType(nodeType)}
                >
                  {NODE_TYPE_LABELS[nodeType]}
                </button>
              ))}
            </div>
          </section>

          <details
            className="special-methods-reference"
            aria-label="Special methods reference"
          >
            <summary>Special methods</summary>
            <p>Attach these exact Method names to a Class.</p>
            <dl>
              <div>
                <dt>__repr__</dt>
                <dd>Output · 0 Inputs · String</dd>
              </div>
              <div>
                <dt>__neg__</dt>
                <dd>unary - · 0 Inputs</dd>
              </div>
              <div>
                <dt>__add__ · __sub__ · __mul__ · __truediv__</dt>
                <dd>+ · - · * · / · 1 Input</dd>
              </div>
              <div>
                <dt>__eq__ · __ne__ · __lt__ · __le__ · __gt__ · __ge__</dt>
                <dd>= / == · != · &lt; · &lt;= · &gt; · &gt;= · 1 Input · Boolean</dd>
              </div>
            </dl>
          </details>

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

          <section className="imports-panel" aria-label="Imports">
            <h2>Imports</h2>
            <textarea
              id="imports-list"
              aria-label="Imports list"
              value={importNamesText}
              onChange={(event) => updateImportNames(event.target.value)}
              rows={5}
              spellCheck={false}
            />
            {importsLoading ? (
              <p className="import-status">Loading imports...</p>
            ) : (
              <>
                {importDirectoryName ? (
                  <p className="import-status">
                    Folder: {importDirectoryName}
                  </p>
                ) : null}
                {importResolution.files.length ? (
                  <p className="import-status">
                    Imported files:{' '}
                    {importResolution.files.map((file) => file.name).join(', ')}
                  </p>
                ) : null}
                {importResolution.nativeLibraries.length ? (
                  <p className="import-status">
                    Native libraries:{' '}
                    {importResolution.nativeLibraries
                      .map((library) => library.name)
                      .join(', ')}
                  </p>
                ) : null}
                {importedClassNames.length ? (
                  <p className="import-status">
                    Classes: {importedClassNames.join(', ')}
                  </p>
                ) : null}
                {importedPlainFunctionNames.length ? (
                  <p className="import-status">
                    Functions: {importedPlainFunctionNames.join(', ')}
                  </p>
                ) : null}
                {!importedClassNames.length &&
                !importedPlainFunctionNames.length ? (
                  <p className="import-status">No imported callables</p>
                ) : null}
              </>
            )}
            {importWarningMessages.length ? (
              <ul className="warning-list">
                {importWarningMessages.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {importResolution.errors.length ? (
              <ul className="error-list">
                {importResolution.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
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
            isValidConnection={isValidConnection}
            onInit={setFlowInstance}
            onPaneClick={placePendingNode}
            onNodeClick={selectClickedNode}
            onNodeContextMenu={openNodeCommentDialog}
            onNodeDragStart={recordCanvasChangeStart}
            onSelectionDragStart={recordCanvasChangeStart}
            onBeforeDelete={onBeforeDelete}
            deleteKeyCode={DELETE_KEY_CODES}
            selectionKeyCode={NO_SELECTION_KEY}
            multiSelectionKeyCode={MULTI_SELECTION_KEY_CODES}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnDrag={CANVAS_DRAG_BUTTONS}
            panOnScroll
            defaultViewport={INITIAL_CANVAS_VIEWPORT}
            connectionLineType={ConnectionLineType.SmoothStep}
            defaultEdgeOptions={{ type: 'smoothstep' }}
          >
            <Background color="#d4d9e2" gap={18} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </section>

        <aside
          className="console-panel"
          aria-label="Runtime sidebar"
          style={{ width: `${sidebarWidth}px` }}
        >
          <div
            className="sidebar-resize-handle"
            role="separator"
            aria-label="Resize right sidebar"
            aria-orientation="vertical"
            aria-valuemin={MIN_SIDEBAR_WIDTH}
            aria-valuemax={MAX_SIDEBAR_WIDTH}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onPointerDown={startSidebarResize}
          />
          <div className="execution-bar">
            <h2>Console</h2>
            <div className="execution-buttons">
              <button
                type="button"
                onClick={resetExecution}
                disabled={!validation.valid || executionIsBusy}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={stepProgram}
                disabled={
                  !validation.valid || executionIsBusy || autoStepIsActive
                }
              >
                Step
              </button>
              <button
                type="button"
                onClick={toggleAutoStepProgram}
                disabled={
                  !validation.valid || (executionIsBusy && !autoStepIsActive)
                }
                title={
                  autoStepIsActive
                    ? 'Pause automatic stepping'
                    : 'Automatically step through the program'
                }
              >
                {autoStepIsActive ? 'Pause' : 'Auto Step'}
              </button>
              <button
                type="button"
                onClick={runProgram}
                disabled={
                  !validation.valid || executionIsBusy || autoStepIsActive
                }
              >
                Run
              </button>
            </div>
            <div className="execution-speed-control">
              <div className="execution-speed-header">
                <label htmlFor="auto-step-speed">Auto Step speed</label>
                <output id="auto-step-speed-value" htmlFor="auto-step-speed">
                  {autoStepSpeed} {autoStepSpeed === 1 ? 'step' : 'steps'}/s
                </output>
              </div>
              <input
                id="auto-step-speed"
                type="range"
                aria-describedby="auto-step-speed-value"
                min={MIN_AUTO_STEP_SPEED}
                max={MAX_AUTO_STEP_SPEED}
                step={1}
                value={autoStepSpeed}
                onChange={(event) =>
                  setAutoStepSpeed(Number(event.target.value))
                }
              />
            </div>
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
            <div>
              <dt>Flow</dt>
              <dd>{execution?.functionName ?? '—'}</dd>
            </div>
          </dl>

          {message ? <p className="notice">{message}</p> : null}
          {execution?.error ? <p className="runtime-error">{execution.error}</p> : null}

          {visibleTurtleState ? (
            <TurtlePanel turtle={visibleTurtleState} />
          ) : null}

          {visibleImageState ? (
            <ImagePanel imageState={visibleImageState} />
          ) : null}

          <section className="variables-panel" aria-label="Variables">
            <h3>Variables</h3>
            {variableEntries.length ? (
              <dl className="variable-list">
                {variableEntries.map(([name, value]) => (
                  <div className="variable-row" key={name}>
                    <dt>{name}</dt>
                    <dd>
                      <VariableValue
                        value={value}
                        objectHeap={execution?.objectHeap ?? {}}
                      />
                    </dd>
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
                  {renderConsoleLine(line)}
                </div>
              ))
            ) : (
              <p className="empty-output">No output yet</p>
            )}
          </section>
        </aside>
      </section>
      {aboutOpen ? (
        <div
          className="modal-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              closeAboutDialog()
            }
          }}
        >
          <div
            className="about-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-flowlab-title"
            aria-describedby="about-flowlab-description"
            onKeyDown={trapDialogFocus}
          >
            <h2 id="about-flowlab-title">About FlowLab</h2>
            <p id="about-flowlab-description">
              Created by David Bachman with GPT 5.5 and GPT 5.6 sol. To learn
              more about David see{' '}
              <a
                href="https://pzacad.pitzer.edu/~dbachman/"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://pzacad.pitzer.edu/~dbachman/
              </a>
              , and subscribe to his AI podcast <em>Entropy Bonus</em> at{' '}
              <a
                href="https://profbachman.substack.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://profbachman.substack.com/
              </a>
              .
            </p>
            <div className="modal-buttons">
              <button type="button" autoFocus onClick={closeAboutDialog}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {filenameRequest ? (
        <div className="modal-backdrop">
          <form
            className="filename-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="filename-modal-title"
            onSubmit={submitFilenameRequest}
          >
            <h2 id="filename-modal-title">Choose a filename</h2>
            <label className="input-label" htmlFor="export-filename">
              Filename
            </label>
            <input
              id="export-filename"
              value={filenameInput}
              onChange={(event) => setFilenameInput(event.target.value)}
              autoFocus
              spellCheck={false}
            />
            <div className="modal-buttons">
              <button type="submit">Save</button>
              <button type="button" onClick={cancelFilenameRequest}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {commentRequest ? (
        <div className="modal-backdrop">
          <form
            className="filename-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="comment-modal-title"
            onSubmit={submitCommentRequest}
          >
            <h2 id="comment-modal-title">Block comment</h2>
            <label className="input-label" htmlFor="block-comment">
              Comment
            </label>
            <textarea
              id="block-comment"
              value={commentInputText}
              onChange={(event) => setCommentInputText(event.target.value)}
              autoFocus
              rows={4}
              spellCheck={false}
            />
            <div className="modal-buttons">
              <button type="submit">Save</button>
              <button type="button" onClick={cancelCommentRequest}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {execution?.status === 'asking' ? (
        <div className="modal-backdrop">
          <form
            className="filename-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ask-modal-title"
            onSubmit={submitAskInput}
          >
            <h2 id="ask-modal-title">Input requested</h2>
            <label className="input-label" htmlFor="ask-input">
              Input
            </label>
            <input
              id="ask-input"
              value={askInputText}
              onChange={(event) => setAskInputText(event.target.value)}
              autoFocus
              spellCheck={false}
            />
            <div className="modal-buttons">
              <button type="submit">Submit</button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  )
}

function ToolbarMenu({
  id,
  label,
  brand = false,
  isOpen,
  onOpen,
  onClose,
  children,
}: ToolbarMenuProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const triggerId = `${id}-menu-trigger`
  const panelId = `${id}-menu-panel`

  function menuItems(): HTMLElement[] {
    return Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>(
        '[data-menu-item]:not([disabled])',
      ) ?? [],
    )
  }

  function focusMenuItem(index: number): void {
    const items = menuItems()
    if (!items.length) {
      return
    }

    items[(index + items.length) % items.length].focus()
  }

  function openAndFocus(index: number): void {
    onOpen()
    window.requestAnimationFrame(() => focusMenuItem(index))
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      triggerRef.current?.focus()
      return
    }

    if (event.target === triggerRef.current) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        openAndFocus(0)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        openAndFocus(-1)
      }
      return
    }

    if (!isOpen || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return
    }

    const items = menuItems()
    if (!items.length) {
      return
    }

    event.preventDefault()
    const activeIndex = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Home') {
      focusMenuItem(0)
    } else if (event.key === 'End') {
      focusMenuItem(-1)
    } else if (event.key === 'ArrowDown') {
      focusMenuItem(activeIndex + 1)
    } else {
      focusMenuItem(activeIndex <= 0 ? -1 : activeIndex - 1)
    }
  }

  return (
    <div
      ref={containerRef}
      className="toolbar-menu"
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        if (
          isOpen &&
          (!(event.relatedTarget instanceof globalThis.Node) ||
            !event.currentTarget.contains(event.relatedTarget))
        ) {
          onClose()
        }
      }}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={`toolbar-menu-trigger${brand ? ' toolbar-menu-brand' : ''}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => (isOpen ? onClose() : onOpen())}
      >
        {brand ? <strong>{label}</strong> : label}
        <span className="toolbar-menu-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {isOpen ? (
        <div
          id={panelId}
          className="toolbar-menu-panel"
          role="menu"
          aria-labelledby={triggerId}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

function trapDialogFocus(event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (event.key !== 'Tab') {
    return
  }

  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
    ),
  )
  const first = focusable[0]
  const last = focusable.at(-1)
  if (!first || !last) {
    return
  }

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function FlowChartNode({ id, data, selected }: NodeProps<EditorNode>) {
  const updateNodeInternals = useUpdateNodeInternals()
  const label = NODE_TYPE_LABELS[data.nodeType]
  const editable =
    data.nodeType === 'function' ||
    data.nodeType === 'class' ||
    data.nodeType === 'method' ||
    data.nodeType === 'return' ||
    data.nodeType === 'process' ||
    data.nodeType === 'assignment' ||
    data.nodeType === 'call' ||
    data.nodeType === 'input' ||
    data.nodeType === 'output' ||
    data.nodeType === 'if' ||
    data.nodeType === 'while' ||
    data.nodeType === 'for'
  const trueLeftHandle = sourceHandleForBranch(data.nodeType, 'true', 'left')
  const trueRightHandle = sourceHandleForBranch(data.nodeType, 'true', 'right')
  const showTrueLeftHandle =
    data.trueBranchHandle === undefined || data.trueBranchHandle === trueLeftHandle
  const showTrueRightHandle =
    data.trueBranchHandle === undefined || data.trueBranchHandle === trueRightHandle
  const isDeclaration = data.nodeType === 'class'
  const isFunctionRoot = data.nodeType === 'function'
  const isInputOutput =
    data.nodeType === 'input' || data.nodeType === 'output'
  const isProcess = data.nodeType === 'process'
  const classSignature = isDeclaration
    ? tryParseClassDeclaration(data.text)
    : null
  const attachedMethods = data.attachedMethods ?? []
  const classMethodSlotCount = attachedMethods.length + 1
  const minimumWidth = minimumNodeWidth(
    data.nodeType,
    attachedMethods.length,
  )
  const attachedMethodIds = attachedMethods
    .map((method) => method.nodeId)
    .join('\u0000')

  useEffect(() => {
    if (typeof window.DOMMatrixReadOnly === 'function') {
      updateNodeInternals(id)
    }
  }, [attachedMethodIds, id, updateNodeInternals])

  return (
    <div
      className={`flow-node flow-node-${data.nodeType}${
        data.isWidthCustomized ? ' flow-node-width-custom' : ''
      }`}
      data-testid={`flow-node-${id}`}
      data-current={data.isCurrent ? 'true' : 'false'}
      data-shape={
        isBranchNodeType(data.nodeType)
          ? 'diamond'
          : isDeclaration
            ? 'declaration'
            : isInputOutput
              ? 'parallelogram'
              : 'block'
      }
      aria-current={data.isCurrent ? 'step' : undefined}
      style={
        isDeclaration
          ? ({
              '--class-method-slot-count': classMethodSlotCount,
              '--class-node-width': `${classNodeContentWidth(
                attachedMethods.length,
              )}px`,
            } as CSSProperties)
          : undefined
      }
    >
      {selected ? (
        <>
          <NodeResizeControl
            className="node-width-resizer"
            position="left"
            resizeDirection="horizontal"
            minWidth={minimumWidth}
            onResizeStart={() => data.onResizeStart?.()}
          />
          <NodeResizeControl
            className="node-width-resizer"
            position="right"
            resizeDirection="horizontal"
            minWidth={minimumWidth}
            onResizeStart={() => data.onResizeStart?.()}
          />
        </>
      ) : null}
      {!isFunctionRoot && !isDeclaration ? (
        <Handle
          id={data.nodeType === 'method' ? METHOD_OWNER_HANDLE : undefined}
          className={
            data.nodeType === 'method'
              ? 'node-handle method-owner-handle'
              : 'node-handle'
          }
          type="target"
          position={Position.Top}
          aria-label={
            data.nodeType === 'method' ? 'Owning class connection' : undefined
          }
        />
      ) : null}
      <div className="node-content">
        <div className="node-label">{label}</div>
        {data.comment ? <div className="node-comment">{data.comment}</div> : null}
        {editable ? (
          <>
            <label className="sr-only" htmlFor={`${id}-text`}>
              {label} text
            </label>
            {isProcess ? (
              <textarea
                id={`${id}-text`}
                className="node-input node-textarea nodrag nowheel"
                value={data.text}
                rows={Math.max(2, data.text.split(/\r?\n/).length)}
                onChange={(event) =>
                  data.onTextChange?.(id, event.target.value)
                }
                spellCheck={false}
              />
            ) : (
              <input
                id={`${id}-text`}
                className="node-input nodrag"
                value={data.text}
                onChange={(event) => data.onTextChange?.(id, event.target.value)}
                spellCheck={false}
              />
            )}
            {classSignature?.fields.length ? (
              <div className="class-fields" aria-label="Declared fields">
                {classSignature.fields.map((field) => (
                  <span className="class-field" key={field}>
                    {field}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="fixed-node-text">{label}</div>
        )}
      </div>
      {isDeclaration ? (
        <div className="class-method-handles" aria-label="Method connections">
          {attachedMethods.map((method) => (
            <div
              className="class-method-slot class-method-slot-attached"
              key={method.nodeId}
              title={`Connected to ${method.name}`}
            >
              <span className="class-method-name">{method.name}</span>
              <Handle
                id={classMethodHandleId(method.nodeId)}
                className="node-handle class-method-handle"
                type="source"
                position={Position.Bottom}
                isConnectableStart={false}
                aria-label={`${method.name} method connection`}
              />
            </div>
          ))}
          <div
            className="class-method-slot class-method-slot-new"
            title="Attach another Method"
          >
            <span className="class-method-name">+ method</span>
            <Handle
              id={CLASS_METHOD_NEW_HANDLE}
              className="node-handle class-method-handle"
              type="source"
              position={Position.Bottom}
              aria-label="Attach another method"
            />
          </div>
        </div>
      ) : null}
      {isBranchNodeType(data.nodeType) ? (
        <>
          {showTrueLeftHandle ? (
            <Handle
              id={trueLeftHandle}
              className="node-handle node-handle-true node-handle-true-left"
              type="source"
              position={Position.Left}
              style={{
                left: DECISION_SIDE_HANDLE_OFFSET,
                transform: 'translateY(-50%)',
              }}
            />
          ) : null}
          {showTrueRightHandle ? (
            <Handle
              id={trueRightHandle}
              className="node-handle node-handle-true node-handle-true-right"
              type="source"
              position={Position.Right}
              style={{
                right: DECISION_SIDE_HANDLE_OFFSET,
                transform: 'translateY(-50%)',
              }}
            />
          ) : null}
          <Handle
            id={sourceHandleForBranch(data.nodeType, 'false')}
            className="node-handle node-handle-false"
            type="source"
            position={Position.Bottom}
          />
        </>
      ) : data.nodeType !== 'return' && !isDeclaration ? (
        <Handle
          className="node-handle"
          type="source"
          position={Position.Bottom}
        />
      ) : null}
    </div>
  )
}

function VariableValue({
  value,
  objectHeap,
  seenObjectIds = new Set<number>(),
}: {
  value: RuntimeValue
  objectHeap: ExecutionState['objectHeap']
  seenObjectIds?: Set<number>
}) {
  if (!isRuntimeObject(value)) {
    return (
      <span className="variable-value-preview">
        {formatVariableValue(value)}
      </span>
    )
  }

  const object = objectHeap[value.id]
  const objectLabel = formatVariableValue(value)

  if (seenObjectIds.has(value.id)) {
    return (
      <span className="object-reference">
        {objectLabel} (already shown)
      </span>
    )
  }

  if (!object) {
    return <span className="object-reference">{objectLabel}</span>
  }

  const fields = Object.entries(object.fields)
  const nextSeenObjectIds = new Set(seenObjectIds)
  nextSeenObjectIds.add(value.id)

  return (
    <details className="object-value" data-object-id={value.id}>
      <summary>{objectLabel}</summary>
      {fields.length ? (
        <dl className="object-field-list">
          {fields.map(([name, fieldValue]) => (
            <div className="object-field-row" key={name}>
              <dt>{name}</dt>
              <dd>
                <VariableValue
                  value={fieldValue}
                  objectHeap={objectHeap}
                  seenObjectIds={nextSeenObjectIds}
                />
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="empty-object-fields">No fields</p>
      )}
    </details>
  )
}

function ImagePanel({ imageState }: { imageState: ImageRuntimeState }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const image = displayedImageData(imageState)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) {
      return
    }

    paintImageCanvas(canvas, image)
  }, [image])

  return (
    <section className="image-panel" aria-label="Image">
      <h3>Image</h3>
      {image ? (
        <>
          <canvas
            ref={canvasRef}
            className="image-canvas"
            data-testid="image-canvas"
            aria-label="Displayed image"
            width={image.width}
            height={image.height}
          />
          <p className="image-metadata">
            Image #{image.id} · {image.width} × {image.height}
          </p>
        </>
      ) : (
        <p className="empty-image">No image displayed</p>
      )}
    </section>
  )
}

function TurtlePanel({ turtle }: { turtle: TurtleState }) {
  const baseViewBox = useMemo(() => turtleViewBoxBounds(turtle), [turtle])
  const [view, setView] = useState<TurtleViewState>(DEFAULT_TURTLE_VIEW)
  const [panDrag, setPanDrag] = useState<TurtlePanDrag | null>(null)
  const activePointersRef = useRef(new Map<number, TurtlePointer>())
  const pinchRef = useRef<TurtlePinch | null>(null)
  const turtleCanvasRef = useRef<SVGSVGElement | null>(null)
  const visibleViewBox = navigatedTurtleViewBox(baseViewBox, view)
  const viewBox = formatTurtleViewBox(visibleViewBox)

  useEffect(() => {
    const canvas = turtleCanvasRef.current

    if (!canvas) {
      return
    }

    const canvasElement = canvas

    function onWheel(event: WheelEvent): void {
      if (!event.ctrlKey) {
        return
      }

      event.preventDefault()
      const wheelFactor = Math.exp(-event.deltaY * TURTLE_WHEEL_ZOOM_INTENSITY)
      const rect = canvasElement.getBoundingClientRect()

      setView((currentView) =>
        zoomTurtleViewAtClientPoint(
          baseViewBox,
          currentView,
          clampTurtleZoom(currentView.zoom * wheelFactor),
          event.clientX,
          event.clientY,
          rect,
        ),
      )
    }

    canvasElement.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      canvasElement.removeEventListener('wheel', onWheel)
    }
  }, [baseViewBox])

  function startTurtlePointer(event: ReactPointerEvent<SVGSVGElement>): void {
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (event.pointerType === 'touch') {
      event.currentTarget.setPointerCapture?.(event.pointerId)
      startTurtlePinchIfReady(event.currentTarget)
    }

    if (event.button !== 2) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setPanDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: view.panX,
      startPanY: view.panY,
      viewBoxWidth: visibleViewBox.width,
      viewBoxHeight: visibleViewBox.height,
      rectWidth: safeRectLength(event.currentTarget.getBoundingClientRect().width),
      rectHeight: safeRectLength(event.currentTarget.getBoundingClientRect().height),
    })
  }

  function moveTurtlePointer(event: ReactPointerEvent<SVGSVGElement>): void {
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      })
    }

    if (panDrag?.pointerId === event.pointerId) {
      event.preventDefault()
      const deltaX =
        ((event.clientX - panDrag.startX) * panDrag.viewBoxWidth) /
        panDrag.rectWidth
      const deltaY =
        ((event.clientY - panDrag.startY) * panDrag.viewBoxHeight) /
        panDrag.rectHeight

      setView((currentView) => ({
        ...currentView,
        panX: panDrag.startPanX - deltaX,
        panY: panDrag.startPanY - deltaY,
      }))
      return
    }

    const pinch = pinchRef.current
    if (!pinch) {
      return
    }

    const firstPointer = activePointersRef.current.get(pinch.pointerIds[0])
    const secondPointer = activePointersRef.current.get(pinch.pointerIds[1])

    if (!firstPointer || !secondPointer) {
      return
    }

    event.preventDefault()
    const distance = turtlePointerDistance(firstPointer, secondPointer)
    const zoom = clampTurtleZoom(
      pinch.startView.zoom * (distance / pinch.startDistance),
    )

    setView(
      zoomTurtleViewAtClientPoint(
        baseViewBox,
        pinch.startView,
        zoom,
        pinch.centerX,
        pinch.centerY,
        pinch.rect,
      ),
    )
  }

  function finishTurtlePointer(event: ReactPointerEvent<SVGSVGElement>): void {
    activePointersRef.current.delete(event.pointerId)
    event.currentTarget.releasePointerCapture?.(event.pointerId)

    if (panDrag?.pointerId === event.pointerId) {
      setPanDrag(null)
    }

    const pinch = pinchRef.current
    if (pinch?.pointerIds.includes(event.pointerId)) {
      pinchRef.current = null
    }
  }

  function startTurtlePinchIfReady(svg: SVGSVGElement): void {
    const activePointers = [...activePointersRef.current.entries()]

    if (activePointers.length !== 2) {
      return
    }

    const [[firstId, firstPointer], [secondId, secondPointer]] = activePointers
    const startDistance = turtlePointerDistance(firstPointer, secondPointer)

    if (startDistance <= 0) {
      return
    }

    pinchRef.current = {
      pointerIds: [firstId, secondId],
      startDistance,
      startView: view,
      centerX: (firstPointer.x + secondPointer.x) / 2,
      centerY: (firstPointer.y + secondPointer.y) / 2,
      rect: svg.getBoundingClientRect(),
    }
  }

  return (
    <section className="turtle-panel" aria-label="Turtle">
      <h3>Turtle</h3>
      <svg
        ref={turtleCanvasRef}
        className="turtle-canvas"
        data-panning={panDrag !== null ? 'true' : undefined}
        data-testid="turtle-canvas"
        viewBox={viewBox}
        role="img"
        aria-label="Turtle drawing"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={startTurtlePointer}
        onPointerMove={moveTurtlePointer}
        onPointerUp={finishTurtlePointer}
        onPointerCancel={finishTurtlePointer}
      >
        <rect className="turtle-canvas-background" x="-10000" y="-10000" width="20000" height="20000" />
        <line className="turtle-axis" x1="-10000" y1="0" x2="10000" y2="0" />
        <line className="turtle-axis" x1="0" y1="-10000" x2="0" y2="10000" />
        {turtle.segments.map((segment, index) => (
          <line
            data-testid="turtle-segment"
            key={`${segment.x1}-${segment.y1}-${segment.x2}-${segment.y2}-${index}`}
            x1={formatSvgNumber(segment.x1)}
            y1={formatSvgNumber(svgY(segment.y1))}
            x2={formatSvgNumber(segment.x2)}
            y2={formatSvgNumber(svgY(segment.y2))}
            stroke={segment.color}
          />
        ))}
        <polygon
          className="turtle-marker"
          data-testid="turtle-marker"
          points="-6,-4 8,0 -6,4"
          transform={`translate(${formatSvgNumber(turtle.x)} ${formatSvgNumber(svgY(turtle.y))}) rotate(${formatSvgNumber(-turtle.heading)})`}
        />
      </svg>
    </section>
  )
}

function renderConsoleLine(line: string) {
  const parts = line.split('\n')

  return parts.map((part, index) => (
    <Fragment key={`${part}-${index}`}>
      {part}
      {index < parts.length - 1 ? <br /> : null}
    </Fragment>
  ))
}

function turtleViewBoxBounds(turtle: TurtleState): TurtleViewBoxBounds {
  const points = [
    { x: 0, y: 0 },
    { x: turtle.x, y: turtle.y },
    ...turtle.segments.flatMap((segment) => [
      { x: segment.x1, y: segment.y1 },
      { x: segment.x2, y: segment.y2 },
    ]),
  ]
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = Math.max(maxX - minX, 40)
  const height = Math.max(maxY - minY, 40)
  const padding = Math.max(20, Math.max(width, height) * 0.12)

  return {
    x: minX - padding,
    y: svgY(maxY + padding),
    width: width + padding * 2,
    height: height + padding * 2,
  }
}

function navigatedTurtleViewBox(
  baseViewBox: TurtleViewBoxBounds,
  view: TurtleViewState,
): TurtleViewBoxBounds {
  const zoom = clampTurtleZoom(view.zoom)
  const width = baseViewBox.width / zoom
  const height = baseViewBox.height / zoom

  return {
    x: baseViewBox.x + baseViewBox.width / 2 - width / 2 + view.panX,
    y: baseViewBox.y + baseViewBox.height / 2 - height / 2 + view.panY,
    width,
    height,
  }
}

function formatTurtleViewBox(viewBox: TurtleViewBoxBounds): string {
  return [
    formatSvgNumber(viewBox.x),
    formatSvgNumber(viewBox.y),
    formatSvgNumber(viewBox.width),
    formatSvgNumber(viewBox.height),
  ].join(' ')
}

function zoomTurtleViewAtClientPoint(
  baseViewBox: TurtleViewBoxBounds,
  currentView: TurtleViewState,
  zoom: number,
  clientX: number,
  clientY: number,
  rect: DOMRect,
): TurtleViewState {
  const currentViewBox = navigatedTurtleViewBox(baseViewBox, currentView)
  const nextZoom = clampTurtleZoom(zoom)
  const nextWidth = baseViewBox.width / nextZoom
  const nextHeight = baseViewBox.height / nextZoom
  const ratioX = clampUnitInterval((clientX - rect.left) / safeRectLength(rect.width))
  const ratioY = clampUnitInterval((clientY - rect.top) / safeRectLength(rect.height))
  const anchorX = currentViewBox.x + ratioX * currentViewBox.width
  const anchorY = currentViewBox.y + ratioY * currentViewBox.height
  const nextX = anchorX - ratioX * nextWidth
  const nextY = anchorY - ratioY * nextHeight

  return {
    zoom: nextZoom,
    panX: nextX - (baseViewBox.x + baseViewBox.width / 2 - nextWidth / 2),
    panY: nextY - (baseViewBox.y + baseViewBox.height / 2 - nextHeight / 2),
  }
}

function svgY(value: number): number {
  return -value
}

function clampTurtleZoom(zoom: number): number {
  return Math.min(MAX_TURTLE_ZOOM, Math.max(MIN_TURTLE_ZOOM, zoom))
}

function clampUnitInterval(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function safeRectLength(value: number): number {
  return value > 0 ? value : 1
}

function turtlePointerDistance(
  firstPointer: TurtlePointer,
  secondPointer: TurtlePointer,
): number {
  return Math.hypot(
    secondPointer.x - firstPointer.x,
    secondPointer.y - firstPointer.y,
  )
}

function formatSvgNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width))
}

function cloneCanvasSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  return {
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data },
    })),
    edges: snapshot.edges.map((edge) => ({
      ...edge,
      data: edge.data ? { ...edge.data } : undefined,
    })),
  }
}

function offsetPosition(
  position: { x: number; y: number },
  offset: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: position.x + offset.x,
    y: position.y + offset.y,
  }
}

function nextCopiedId(originalId: string, usedIds: Set<string>): string {
  const baseId = `${originalId}-copy`
  let suffix = 1
  let id = baseId

  while (usedIds.has(id)) {
    suffix += 1
    id = `${baseId}-${suffix}`
  }

  usedIds.add(id)
  return id
}

function selectedLinearNodeChain(
  nodes: EditorNode[],
  edges: EditorEdge[],
): EditorNode[] | null {
  const selectedNodes = nodes.filter((node) => node.selected)
  if (
    selectedNodes.length < 2 ||
    selectedNodes.some(
      (node) =>
        node.data.nodeType !== 'assignment' &&
        node.data.nodeType !== 'call' &&
        node.data.nodeType !== 'process',
    )
  ) {
    return null
  }

  const selectedIds = new Set(selectedNodes.map((node) => node.id))
  const selectedById = new Map(selectedNodes.map((node) => [node.id, node]))
  const internalEdges = edges.filter(
    (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
  )
  if (internalEdges.length !== selectedNodes.length - 1) {
    return null
  }

  const internalIncoming = new Map<string, EditorEdge[]>()
  const internalOutgoing = new Map<string, EditorEdge[]>()
  for (const edge of internalEdges) {
    internalIncoming.set(edge.target, [
      ...(internalIncoming.get(edge.target) ?? []),
      edge,
    ])
    internalOutgoing.set(edge.source, [
      ...(internalOutgoing.get(edge.source) ?? []),
      edge,
    ])
  }

  if (
    selectedNodes.some(
      (node) =>
        (internalIncoming.get(node.id)?.length ?? 0) > 1 ||
        (internalOutgoing.get(node.id)?.length ?? 0) > 1,
    )
  ) {
    return null
  }

  const entries = selectedNodes.filter(
    (node) => !internalIncoming.get(node.id)?.length,
  )
  const exits = selectedNodes.filter(
    (node) => !internalOutgoing.get(node.id)?.length,
  )
  if (entries.length !== 1 || exits.length !== 1) {
    return null
  }

  const entryId = entries[0].id
  const exitId = exits[0].id
  if (
    edges.some(
      (edge) =>
        !selectedIds.has(edge.source) &&
        selectedIds.has(edge.target) &&
        edge.target !== entryId,
    ) ||
    edges.some(
      (edge) =>
        selectedIds.has(edge.source) &&
        !selectedIds.has(edge.target) &&
        edge.source !== exitId,
    )
  ) {
    return null
  }

  const chain: EditorNode[] = []
  let currentId: string | undefined = entryId
  while (currentId) {
    const node = selectedById.get(currentId)
    if (!node || chain.some((candidate) => candidate.id === currentId)) {
      return null
    }

    chain.push(node)
    currentId = internalOutgoing.get(currentId)?.[0]?.target
  }

  return chain.length === selectedNodes.length ? chain : null
}

function selectedProcessNode(nodes: EditorNode[]): EditorNode | null {
  const selectedNodes = nodes.filter((node) => node.selected)
  return selectedNodes.length === 1 &&
    selectedNodes[0].data.nodeType === 'process'
    ? selectedNodes[0]
    : null
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  )
}

function programToNodes(program: Program): EditorNode[] {
  return program.nodes.map((node) => {
    const attachedMethodCount =
      node.type === 'class'
        ? attachedProgramMethodCount(node.id, program)
        : 0
    const width =
      node.width === undefined
        ? undefined
        : Math.max(
            node.width,
            minimumNodeWidth(node.type, attachedMethodCount),
          )

    return {
      id: node.id,
      type: 'flowNode',
      width,
      position: node.position,
      data: {
        nodeType: node.type,
        text: node.text,
        comment: node.comment,
      },
    }
  })
}

function toProgram(nodes: EditorNode[], edges: EditorEdge[]): Program {
  return {
    version: 1,
    nodes: nodes.map((node) => {
      const comment = node.data.comment?.trim()

      return {
        id: node.id,
        type: node.data.nodeType,
        text: node.data.text,
        ...(comment ? { comment: node.data.comment } : {}),
        ...(node.width === undefined ? {} : { width: node.width }),
        position: node.position,
      }
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: isBranchLabel(edge.label) ? edge.label : undefined,
    })),
  }
}

function attachedProgramMethodCount(
  classNodeId: string,
  program: Program,
): number {
  const methodIds = new Set(
    program.nodes
      .filter((node) => node.type === 'method')
      .map((node) => node.id),
  )

  return new Set(
    program.edges
      .filter(
        (edge) =>
          edge.source === classNodeId && methodIds.has(edge.target),
      )
      .map((edge) => edge.target),
  ).size
}

function classNodeContentWidth(attachedMethodCount: number): number {
  const methodSlotCount = attachedMethodCount + 1
  return Math.max(200, methodSlotCount * 70 + 20)
}

function minimumNodeWidth(
  nodeType: FlowNodeType,
  attachedMethodCount = 0,
): number {
  if (isBranchNodeType(nodeType)) {
    return 188
  }

  if (nodeType === 'class') {
    return classNodeContentWidth(attachedMethodCount) + 24
  }

  if (nodeType === 'process') {
    return 284
  }

  if (nodeType === 'assignment') {
    return 214
  }

  return 194
}

function programWithSavedRuntimeState(
  program: Program,
  imports: string,
  inputQueue: string,
): Program {
  return {
    ...program,
    imports,
    inputQueue,
  }
}

function programJsonBlob(program: Program): Blob {
  return new Blob([JSON.stringify(program, null, 2)], {
    type: 'application/json',
  })
}

function documentNameFromFileName(fileName: string): string {
  return displayFlowLabFileName(fileName) || DEFAULT_DOCUMENT_NAME
}

function fileNameForDocument(name: string): string {
  return `${documentNameFromFileName(name)}${JSON_EXTENSION}`
}

function downloadProgramJson(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function loadTextFromUrl(url: string): Promise<string> {
  if (!globalThis.fetch) {
    throw new Error('This browser does not support URL text loading.')
  }

  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`URL returned status ${response.status}`)
  }

  return response.text()
}

function textLoadErrorMessage(url: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `Text load failed for "${url}": ${message}`
}

function imageLoadErrorMessage(url: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `Image load failed for "${url}": ${message}`
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

function trueBranchHandleForNode(
  node: EditorNode,
  edges: EditorEdge[],
): string | undefined {
  if (!isBranchNodeType(node.data.nodeType)) {
    return undefined
  }

  const trueEdge = edges.find(
    (edge) => edge.source === node.id && edge.label === 'true',
  )

  return trueEdge
    ? sourceHandleForBranchConnection(
        node.data.nodeType,
        'true',
        trueEdge.sourceHandle,
      )
    : undefined
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

function tryParseClassDeclaration(text: string): ClassDeclaration | null {
  try {
    return parseClassDeclaration(text)
  } catch {
    return null
  }
}

function defaultNodeText(nodeType: FlowNodeType): string {
  return DEFAULT_NODE_TEXT[nodeType]
}

function attachedMethodsForClass(
  classNodeId: string,
  nodes: EditorNode[],
  edges: EditorEdge[],
): AttachedMethodHandle[] {
  const methodsById = new Map(
    nodes
      .filter((node) => node.data.nodeType === 'method')
      .map((node) => [node.id, node] as const),
  )
  const seenMethodIds = new Set<string>()

  return edges.flatMap((edge) => {
    if (edge.source !== classNodeId || seenMethodIds.has(edge.target)) {
      return []
    }

    const methodNode = methodsById.get(edge.target)

    if (!methodNode) {
      return []
    }

    seenMethodIds.add(methodNode.id)
    return [
      {
        nodeId: methodNode.id,
        name: methodNode.data.text.trim() || 'unnamed',
      },
    ]
  })
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
  const width = isBranchNodeType(nodeType)
    ? 188
    : nodeType === 'class'
      ? 200
      : nodeType === 'process'
        ? 260
        : nodeType === 'assignment'
        ? 190
        : 170
  const height = isBranchNodeType(nodeType)
    ? 142
    : nodeType === 'class'
      ? 138
      : nodeType === 'process'
        ? 112
        : 82

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

function formatVariableValue(value: RuntimeValue): string {
  const formatted = formatRuntimeValue(value)
  const lines = formatted.split(/\r?\n/)

  if (lines.length <= VARIABLE_VALUE_PREVIEW_LINES) {
    return formatted
  }

  return [...lines.slice(0, VARIABLE_VALUE_PREVIEW_LINES), '...'].join('\n')
}

export default App
