import type { Program } from './types'
import { normalizeImportedProgram, validateProgram } from './validation'

export interface ImportedProgramFile {
  name: string
  program: Program
}

export interface ImportResolution {
  files: ImportedProgramFile[]
  errors: string[]
}

export interface FlowLabFileHandle {
  getFile: () => Promise<File>
  createWritable?: () => Promise<{
    write: (value: Blob) => Promise<void> | void
    close: () => Promise<void> | void
  }>
}

export interface FlowLabDirectoryHandle {
  name?: string
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<FlowLabFileHandle>
}

interface ImportResolutionOptions {
  directoryHandle?: FlowLabDirectoryHandle | null
}

const FLOWLAB_FILE_STORAGE_PREFIX = 'flowlab:file:'
const JSON_EXTENSION = '.json'

export function parseImportNames(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
}

export function registerFlowLabProgram(name: string, program: Program): void {
  const storage = browserStorage()

  if (!storage) {
    return
  }

  for (const candidate of lookupNamesFor(name)) {
    try {
      storage.setItem(
        `${FLOWLAB_FILE_STORAGE_PREFIX}${candidate}`,
        JSON.stringify(program),
      )
    } catch {
      return
    }
  }
}

export function displayFlowLabFileName(name: string): string {
  const trimmed = name.trim()

  if (trimmed.toLowerCase().endsWith(JSON_EXTENSION)) {
    return trimmed.slice(0, -JSON_EXTENSION.length)
  }

  return trimmed
}

export async function resolveFlowLabImports(
  text: string,
  options: ImportResolutionOptions = {},
): Promise<ImportResolution> {
  const files: ImportedProgramFile[] = []
  const errors: string[] = []
  const seenNames = new Set<string>()

  for (const name of parseImportNames(text)) {
    const displayName = displayFlowLabFileName(name)

    if (seenNames.has(displayName)) {
      continue
    }

    seenNames.add(displayName)
    const result = await loadFlowLabProgram(name, options.directoryHandle)

    if (result.program) {
      files.push({ name: displayName, program: result.program })
    } else {
      errors.push(`Import "${displayName}": ${result.error}`)
    }
  }

  return { files, errors }
}

export function callableImportedFunctionNames(
  files: ImportedProgramFile[],
  currentProgram: Program,
): string[] {
  const currentFunctionNames = currentProgramFunctionNames(currentProgram)
  const importedFunctionNames = new Set<string>()

  for (const file of files) {
    for (const node of file.program.nodes) {
      const functionName = node.text.trim()

      if (
        node.type !== 'function' ||
        functionName === 'main' ||
        currentFunctionNames.has(functionName) ||
        importedFunctionNames.has(functionName)
      ) {
        continue
      }

      importedFunctionNames.add(functionName)
    }
  }

  return [...importedFunctionNames].sort((left, right) =>
    left.localeCompare(right),
  )
}

export function importWarnings(
  files: ImportedProgramFile[],
  currentProgram: Program,
): string[] {
  const currentFunctionNames = currentProgramFunctionNames(currentProgram)
  const importedFunctionOwners = new Map<string, string>()
  const warnings: string[] = []

  for (const file of files) {
    for (const node of file.program.nodes) {
      const functionName = node.text.trim()

      if (node.type !== 'function' || functionName === 'main') {
        continue
      }

      if (currentFunctionNames.has(functionName)) {
        warnings.push(
          `Function "${functionName}" from "${file.name}" is ignored because the current canvas defines it.`,
        )
        continue
      }

      const firstOwner = importedFunctionOwners.get(functionName)
      if (firstOwner) {
        warnings.push(
          `Function "${functionName}" from "${file.name}" is ignored because "${firstOwner}" already imports it.`,
        )
        continue
      }

      importedFunctionOwners.set(functionName, file.name)
    }
  }

  return warnings
}

async function loadFlowLabProgram(
  name: string,
  directoryHandle?: FlowLabDirectoryHandle | null,
): Promise<{ program?: Program; error: string }> {
  if (directoryHandle) {
    const directoryProgram = await loadDirectoryProgram(name, directoryHandle)

    if (directoryProgram.program || directoryProgram.error !== 'not-found') {
      return directoryProgram
    }
  }

  const storedProgram = loadStoredProgram(name)

  if (storedProgram.program || storedProgram.error !== 'not-found') {
    return storedProgram
  }

  return loadFetchedProgram(name)
}

async function loadDirectoryProgram(
  name: string,
  directoryHandle: FlowLabDirectoryHandle,
): Promise<{ program?: Program; error: string }> {
  for (const candidate of lookupNamesFor(name)) {
    try {
      const fileHandle = await directoryHandle.getFileHandle(candidate)
      const parsed = parseProgramSource(await (await fileHandle.getFile()).text())

      if (parsed.program) {
        registerFlowLabProgram(name, parsed.program)
      }

      return parsed
    } catch (error) {
      if (isFileNotFoundError(error)) {
        continue
      }

      return {
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return { error: 'not-found' }
}

function loadStoredProgram(name: string): { program?: Program; error: string } {
  const storage = browserStorage()

  if (!storage) {
    return { error: 'not-found' }
  }

  for (const candidate of lookupNamesFor(name)) {
    const storedValue = storage.getItem(`${FLOWLAB_FILE_STORAGE_PREFIX}${candidate}`)

    if (!storedValue) {
      continue
    }

    return parseProgramSource(storedValue)
  }

  return { error: 'not-found' }
}

async function loadFetchedProgram(
  name: string,
): Promise<{ program?: Program; error: string }> {
  if (!globalThis.fetch) {
    return {
      error: 'FlowLab file was not found. Import the JSON file once before referencing it by name.',
    }
  }

  for (const candidate of lookupNamesFor(name)) {
    try {
      const response = await fetch(candidate, { cache: 'no-store' })

      if (!response.ok) {
        continue
      }

      const parsed = parseProgramSource(await response.text())

      if (parsed.program) {
        registerFlowLabProgram(name, parsed.program)
        return parsed
      }
    } catch {
      continue
    }
  }

  return {
    error: 'FlowLab file was not found. Import the JSON file once before referencing it by name.',
  }
}

function parseProgramSource(source: string): { program?: Program; error: string } {
  try {
    const program = normalizeImportedProgram(JSON.parse(source))
    const validation = validateProgram(program)

    if (!validation.valid) {
      return { error: validation.errors.join(' ') }
    }

    return { program, error: '' }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function lookupNamesFor(name: string): string[] {
  const trimmed = name.trim()
  const displayName = displayFlowLabFileName(trimmed)
  const names = [trimmed, displayName]

  if (displayName) {
    names.push(`${displayName}${JSON_EXTENSION}`)
  }

  return [...new Set(names.filter(Boolean))]
}

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

function currentProgramFunctionNames(program: Program): Set<string> {
  return new Set(
    program.nodes
      .filter((node) => node.type === 'function')
      .map((node) => node.text.trim()),
  )
}

function browserStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage

    if (
      storage &&
      typeof storage.getItem === 'function' &&
      typeof storage.setItem === 'function' &&
      typeof storage.removeItem === 'function'
    ) {
      return storage
    }

    return null
  } catch {
    return null
  }
}
