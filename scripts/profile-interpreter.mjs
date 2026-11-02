// Instrument a temporary source copy only. Production storage is never changed.
// node scripts/profile-interpreter.mjs [/path/to/baseline]
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import assert from 'node:assert/strict'

const source = resolve(process.argv[2] ?? '.')
const temporary = await mkdtemp(join(tmpdir(), 'flowlab-profile-'))
let server
try {
  await cp(join(source, 'src/lib'), join(temporary, 'src/lib'), { recursive: true })
  const path = join(temporary, 'src/lib/interpreter.ts')
  let code = await readFile(path, 'utf8')
  const paged = code.includes('objectHeap = withHeapInstance(')
  const createStart = paged ? '          objectHeap = withHeapInstance(' : '          objectHeap = {\n            ...objectHeap,'
  const createEnd = '          nextObjectId += 1'
  assert.equal(code.split(createStart).length, 2)
  assert.equal(code.split(createEnd).length, 2)
  code = code.replace(createStart, `          const copyStart = performance.now()\n${createStart}`)
    .replace(createEnd, `          heapProfile.createMs += performance.now() - copyStart\n          heapProfile.creates++\n          heapProfile.copiedEntries += ${paged ? '0' : 'nextObjectId - 1'}\n${createEnd}`)
  const start = code.indexOf('function setObjectField(')
  const end = code.indexOf('\nfunction requireObjectInstance(', start)
  const original = code.slice(start, end)
  const updateStart = paged ? '  return withHeapInstance(' : '  return {\n    ...objectHeap,'
  assert.ok(original.includes(updateStart))
  const instrumented = original.replace(updateStart, `  const copyStart = performance.now()\n${updateStart.replace('return ', 'const result = ')}`)
    .replace(/\n}\n$/, `\n  heapProfile.updateMs += performance.now() - copyStart\n  heapProfile.updates++\n  heapProfile.copiedEntries += ${paged ? '0' : 'heapProfile.creates'}\n  return result\n}\n`)
  code = `${code.slice(0, start)}${instrumented}${code.slice(end)}\nexport const heapProfile = { createMs: 0, updateMs: 0, creates: 0, updates: 0, copiedEntries: 0 }\n`
  await writeFile(path, code)
  const storagePath = join(temporary, 'src/lib/objectStorage.ts')
  if (paged) {
    let storage = await readFile(storagePath, 'utf8')
    storage = storage.replace('  const next = node ? node.slice() : []', '  storageProfile.copiedSlots += node?.length ?? 0\n  const next = node ? node.slice() : []')
      .replace('  const entries: Array<[PropertyKey, RuntimeObjectInstance]> = []', '  const materializeStart = performance.now()\n  const entries: Array<[PropertyKey, RuntimeObjectInstance]> = []')
      .replace('  store.snapshot = Object.fromEntries(entries)', '  store.snapshot = Object.fromEntries(entries)\n  storageProfile.materializationMs += performance.now() - materializeStart\n  storageProfile.materializations++\n  storageProfile.materializedEntries += entries.length')
    storage += '\nexport const storageProfile = { copiedSlots: 0, materializationMs: 0, materializations: 0, materializedEntries: 0 }\n'
    await writeFile(storagePath, storage)
  }
  server = await createServer({ configFile: false, server: { middlewareMode: true, fs: { allow: [temporary, process.cwd()] } }, appType: 'custom' })
  const api = await server.ssrLoadModule(path)
  const storageProfile = paged ? (await server.ssrLoadModule(storagePath)).storageProfile : {}
  const { workloads } = await server.ssrLoadModule(resolve('scripts/benchmarks/programs.ts'))
  const samples = []
  for (const name of ['mutating-object', 'mandelbrot-51x51-30', 'many-allocations', 'many-alias-mutations']) {
    const workload = workloads.find(w => w.name === name)
    for (let iteration = -1; iteration < 3; iteration++) {
      for (const key of Object.keys(api.heapProfile)) api.heapProfile[key] = 0
      for (const key of Object.keys(storageProfile)) storageProfile[key] = 0
      const start = performance.now()
      const state = api.runExecution({ ...api.createExecution(structuredClone(workload.program), workload.inputs, structuredClone(workload.options)), collectFeedback: false })
      void state.objectHeap
      const elapsedMs = performance.now() - start
      assert.equal(state.status, 'halted', state.error)
      const sample = { name, elapsedMs, steps: state.steps, ...api.heapProfile, ...storageProfile }
      if (iteration >= 0) samples.push(sample)
    }
  }
  console.log(JSON.stringify({ source, note: 'Temporary instrumentation includes replacement instance/field construction and final public heap exposure; timer overhead perturbs execution. copiedEntries counts baseline table entries; copiedSlots counts paged array slots, not bytes.', samples }, null, 2))
} finally {
  await server?.close()
  await rm(temporary, { recursive: true, force: true })
}
