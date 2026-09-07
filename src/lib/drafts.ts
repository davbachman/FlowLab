import {
  isBranchLabel,
  isFlowNodeType,
  type Program,
  type ProgramEdge,
  type ProgramNode,
} from './types'
import { normalizeImportedProgram } from './validation'

export const DRAFT_QUERY_PARAM = 'draft'
const DRAFT_STORAGE_PREFIX = 'flowlab:draft:v1:'
const DRAFT_INDEX_KEY = 'flowlab:draft-index:v1'

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> &
  Partial<Pick<Storage, 'key' | 'length'>>

export interface RecoveryDraft {
  version: 1
  id: string
  program: Program
  documentName: string
  /** The last file load/export, separate from automatic browser recovery. */
  savedFingerprint: string | null
  updatedAt: number
}

export type DraftStorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export function createDraftId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** A distinct URL makes new tabs independent while reloads restore their draft. */
export function newDraftUrl(currentUrl: string, id = createDraftId()): string {
  const url = new URL(currentUrl)
  url.searchParams.set(DRAFT_QUERY_PARAM, id)
  return url.toString()
}

/** Canonical exported content: selection and runtime state never make a file dirty. */
export function documentFingerprint(program: Program, documentName: string): string {
  return JSON.stringify({
    documentName,
    program: {
      version: 1,
      nodes: program.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        text: node.text,
        ...(node.comment ? { comment: node.comment } : {}),
        ...(node.width === undefined ? {} : { width: node.width }),
        position: { x: node.position.x, y: node.position.y },
      })),
      edges: program.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...(edge.label === undefined ? {} : { label: edge.label }),
      })),
      imports: program.imports ?? '',
      inputQueue: program.inputQueue ?? '',
    },
  })
}

/** Check that the editor can safely display the JSON, without requiring runnable code. */
export function parseProgramDraft(value: unknown): Program {
  if (!isRecord(value)) {
    throw new Error('Program JSON must contain version, nodes, and edges.')
  }

  if (
    value.version !== 1 ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges)
  ) {
    throw new Error('Program JSON must contain version 1, nodes, and edges.')
  }

  if (
    (value.imports !== undefined && typeof value.imports !== 'string') ||
    (value.inputQueue !== undefined && typeof value.inputQueue !== 'string')
  ) {
    throw new Error('Program imports and input queue must be text.')
  }

  const normalized = normalizeImportedProgram(value)
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()
  const nodes = normalized.nodes.map((node): ProgramNode => {
    if (
      !isRecord(node) ||
      typeof node.id !== 'string' ||
      !node.id.trim() ||
      !isFlowNodeType(node.type) ||
      typeof node.text !== 'string' ||
      !isRecord(node.position) ||
      typeof node.position.x !== 'number' ||
      !Number.isFinite(node.position.x) ||
      typeof node.position.y !== 'number' ||
      !Number.isFinite(node.position.y) ||
      (node.comment !== undefined && typeof node.comment !== 'string') ||
      (node.width !== undefined &&
        (typeof node.width !== 'number' ||
          !Number.isFinite(node.width) ||
          node.width <= 0))
    ) {
      throw new Error('Each block must have an id, a known type, text, and a finite position.')
    }
    if (nodeIds.has(node.id)) {
      throw new Error(`Duplicate block id "${node.id}" cannot be loaded into the editor.`)
    }
    nodeIds.add(node.id)
    return {
      id: node.id,
      type: node.type,
      text: node.text,
      position: { x: node.position.x, y: node.position.y },
      ...(node.comment === undefined ? {} : { comment: node.comment }),
      ...(node.width === undefined ? {} : { width: node.width }),
    }
  })
  const edges = normalized.edges.map((edge): ProgramEdge => {
    if (
      !isRecord(edge) ||
      typeof edge.id !== 'string' ||
      !edge.id.trim() ||
      typeof edge.source !== 'string' ||
      typeof edge.target !== 'string' ||
      (edge.label !== undefined && !isBranchLabel(edge.label))
    ) {
      throw new Error('Each connection must have an id, source, target, and an optional true/false label.')
    }
    if (edgeIds.has(edge.id)) {
      throw new Error(`Duplicate connection id "${edge.id}" cannot be loaded into the editor.`)
    }
    edgeIds.add(edge.id)
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.label === undefined ? {} : { label: edge.label }),
    }
  })

  return {
    version: 1,
    nodes,
    edges,
    ...(normalized.imports === undefined ? {} : { imports: normalized.imports }),
    ...(normalized.inputQueue === undefined ? {} : { inputQueue: normalized.inputQueue }),
  }
}

export function readRecoveryDraft(
  storage: DraftStorage | null,
  id: string,
): DraftStorageResult<RecoveryDraft | null> {
  if (!storage) return storageUnavailable()
  try {
    const text = storage.getItem(storageKey(id))
    if (text === null) return { ok: true, value: null }
    const draft = parseRecoveryDraft(JSON.parse(text))
    if (draft.id !== id) throw new Error('The draft id does not match its storage key.')
    return { ok: true, value: draft }
  } catch {
    return { ok: false, error: 'This browser draft could not be recovered. You can still load a saved program file.' }
  }
}

export function writeRecoveryDraft(
  storage: DraftStorage | null,
  draft: RecoveryDraft,
): DraftStorageResult<void> {
  if (!storage) return storageUnavailable()
  try {
    const snapshot = parseRecoveryDraft(draft)
    storage.setItem(storageKey(snapshot.id), JSON.stringify(snapshot))
    const ids = new Set(readDraftIds(storage))
    ids.add(snapshot.id)
    storage.setItem(DRAFT_INDEX_KEY, JSON.stringify([...ids]))
    return { ok: true, value: undefined }
  } catch {
    return {
      ok: false,
      error: 'Automatic recovery could not be saved in this browser. Save your program to a file to keep these changes.',
    }
  }
}

export function listRecoveryDrafts(
  storage: DraftStorage | null,
): DraftStorageResult<RecoveryDraft[]> {
  if (!storage) return storageUnavailable()
  try {
    const drafts: RecoveryDraft[] = []
    for (const id of readDraftIds(storage)) {
      const result = readRecoveryDraft(storage, id)
      if (result.ok && result.value) drafts.push(result.value)
    }
    return { ok: true, value: drafts.sort((a, b) => b.updatedAt - a.updatedAt) }
  } catch {
    return { ok: false, error: 'Browser drafts are unavailable. You can still load a saved program file.' }
  }
}

function readDraftIds(storage: DraftStorage): string[] {
  const ids = new Set<string>()
  if (storage.key && typeof storage.length === 'number') {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(DRAFT_STORAGE_PREFIX)) ids.add(key.slice(DRAFT_STORAGE_PREFIX.length))
    }
  }
  // The index also supports browser storage adapters that cannot enumerate keys.
  const indexText = storage.getItem(DRAFT_INDEX_KEY)
  try {
    const index: unknown = JSON.parse(indexText ?? '[]')
    if (Array.isArray(index)) {
      for (const id of index) if (typeof id === 'string') ids.add(id)
    }
  } catch {
    // An interrupted index write never prevents recovery by the document URL.
  }
  return [...ids]
}

function parseRecoveryDraft(value: unknown): RecoveryDraft {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.documentName !== 'string' ||
    (value.savedFingerprint !== null && typeof value.savedFingerprint !== 'string') ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt)
  ) {
    throw new Error('Invalid browser draft.')
  }
  return {
    version: 1,
    id: value.id,
    program: parseProgramDraft(value.program),
    documentName: value.documentName,
    savedFingerprint: value.savedFingerprint,
    updatedAt: value.updatedAt,
  }
}

function storageUnavailable(): DraftStorageResult<never> {
  return { ok: false, error: 'Automatic recovery is unavailable in this browser. Save your program to a file to keep your work.' }
}

function storageKey(id: string): string {
  return `${DRAFT_STORAGE_PREFIX}${id}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
