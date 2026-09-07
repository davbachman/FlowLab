import { describe, expect, it } from 'vitest'
import {
  documentFingerprint,
  listRecoveryDrafts,
  newDraftUrl,
  parseProgramDraft,
  readRecoveryDraft,
  writeRecoveryDraft,
  type DraftStorage,
  type RecoveryDraft,
} from './drafts'
import type { Program } from './types'

const incompleteProgram: Program = {
  version: 1,
  nodes: [{ id: 'condition', type: 'while', text: 'n >', position: { x: 80, y: 30 } }],
  edges: [],
  imports: 'missing-library',
  inputQueue: '4\n5',
}

function memoryStorage(): DraftStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
}

function draft(id = 'tab-a'): RecoveryDraft {
  return {
    version: 1,
    id,
    program: incompleteProgram,
    documentName: 'Working draft',
    savedFingerprint: null,
    updatedAt: 100,
  }
}

describe('draft loading', () => {
  it('loads an unfinished graph and preserves its invalid expression, imports, and input', () => {
    expect(parseProgramDraft(incompleteProgram)).toEqual(incompleteProgram)
    expect(parseProgramDraft({ version: 1, nodes: [], edges: [] })).toEqual({ version: 1, nodes: [], edges: [] })
  })

  it('normalizes legacy blocks while loading a draft', () => {
    const program = parseProgramDraft({
      version: 1,
      nodes: [{ id: 'start', type: 'start', text: '', position: { x: 0, y: 0 } }],
      edges: [],
    })
    expect(program.nodes[0]).toMatchObject({ type: 'function', text: 'main' })
  })

  it.each([
    null,
    { version: 2, nodes: [], edges: [] },
    { version: 1, nodes: [null], edges: [] },
    { ...incompleteProgram, imports: ['wrong type'] },
    { ...incompleteProgram, nodes: [{ ...incompleteProgram.nodes[0], position: { x: Infinity, y: 0 } }] },
    { ...incompleteProgram, nodes: [incompleteProgram.nodes[0], incompleteProgram.nodes[0]] },
    { ...incompleteProgram, edges: [{ id: 'edge', source: 'condition', target: 'condition', label: 'maybe' }] },
  ])('rejects malformed or unsafe graph data: %j', (value) => {
    expect(() => parseProgramDraft(value)).toThrow()
  })

  it('keeps dangling connections for validation to explain', () => {
    const program = {
      ...incompleteProgram,
      edges: [{ id: 'edge', source: 'condition', target: 'missing' }],
    }
    expect(parseProgramDraft(program)).toEqual(program)
  })
})

describe('browser recovery', () => {
  it('recovers unfinished work without marking it as exported', () => {
    const storage = memoryStorage()
    expect(writeRecoveryDraft(storage, draft()).ok).toBe(true)
    expect(readRecoveryDraft(storage, 'tab-a')).toEqual({ ok: true, value: draft() })
    expect(readRecoveryDraft(storage, 'tab-new')).toEqual({ ok: true, value: null })
  })

  it('isolates drafts by document and lists the newest first', () => {
    const storage = memoryStorage()
    const secondDraft = { ...draft('tab-b'), documentName: 'Another file', updatedAt: 200 }
    writeRecoveryDraft(storage, draft())
    writeRecoveryDraft(storage, secondDraft)
    expect(readRecoveryDraft(storage, 'tab-a')).toEqual({ ok: true, value: draft() })
    expect(listRecoveryDrafts(storage)).toEqual({ ok: true, value: [secondDraft, draft()] })
  })

  it('keeps independent keys discoverable when the shared index is incomplete or corrupt', () => {
    const storage = memoryStorage()
    writeRecoveryDraft(storage, draft())
    writeRecoveryDraft(storage, draft('tab-b'))
    storage.setItem('flowlab:draft-index:v1', '{broken')
    const result = listRecoveryDrafts(storage)
    expect(result.ok && result.value.map((entry) => entry.id).sort()).toEqual(['tab-a', 'tab-b'])
  })

  it('handles malformed recovery records without discarding good drafts', () => {
    const storage = memoryStorage()
    writeRecoveryDraft(storage, draft())
    storage.setItem('flowlab:draft:v1:broken', '{broken')
    expect(readRecoveryDraft(storage, 'broken').ok).toBe(false)
    expect(listRecoveryDrafts(storage)).toEqual({ ok: true, value: [draft()] })
  })

  it('rejects a mismatched document identity', () => {
    const storage = memoryStorage()
    storage.setItem('flowlab:draft:v1:wrong', JSON.stringify(draft()))
    expect(readRecoveryDraft(storage, 'wrong').ok).toBe(false)
  })

  it('returns actionable storage errors while preserving the last successful snapshot', () => {
    const storage = memoryStorage()
    writeRecoveryDraft(storage, draft())
    const fullStorage = { ...storage, setItem: () => { throw new Error('QuotaExceededError') } }
    const result = writeRecoveryDraft(fullStorage, { ...draft(), documentName: 'Unsaved edit' })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('Save your program to a file')
    expect(readRecoveryDraft(storage, 'tab-a')).toEqual({ ok: true, value: draft() })
    expect(writeRecoveryDraft(null, draft()).ok).toBe(false)
  })

  it('reports denied reads instead of presenting an empty recovery list', () => {
    const storage = memoryStorage()
    const blockedStorage = { ...storage, getItem: () => { throw new Error('SecurityError') } }
    expect(readRecoveryDraft(blockedStorage, 'tab-a').ok).toBe(false)
    expect(listRecoveryDrafts(blockedStorage).ok).toBe(false)
  })

  it('builds a fresh document URL without losing unrelated URL state', () => {
    const original = 'https://example.test/FlowLab/?draft=old&theme=dark#canvas'
    const next = new URL(newDraftUrl(original, 'fresh'))
    expect(next.searchParams.get('draft')).toBe('fresh')
    expect(next.searchParams.get('theme')).toBe('dark')
    expect(next.hash).toBe('#canvas')
  })
})

describe('saved-file fingerprint', () => {
  it('treats omitted empty metadata and explicit empty metadata identically', () => {
    const emptyProgram: Program = { version: 1, nodes: [], edges: [] }
    expect(documentFingerprint(emptyProgram, 'Untitled')).toBe(
      documentFingerprint({ ...emptyProgram, imports: '', inputQueue: '' }, 'Untitled'),
    )
  })

  it('detects edits, layout changes, rename, inputs, and imports', () => {
    const saved = documentFingerprint(incompleteProgram, 'Working draft')
    const changes: Array<[Program, string]> = [
      [incompleteProgram, 'Renamed'],
      [{ ...incompleteProgram, imports: '' }, 'Working draft'],
      [{ ...incompleteProgram, inputQueue: '6' }, 'Working draft'],
      [{ ...incompleteProgram, nodes: [{ ...incompleteProgram.nodes[0], text: 'n > 0' }] }, 'Working draft'],
      [{ ...incompleteProgram, nodes: [{ ...incompleteProgram.nodes[0], position: { x: 81, y: 30 } }] }, 'Working draft'],
    ]
    for (const [program, name] of changes) expect(documentFingerprint(program, name)).not.toBe(saved)
  })
})
