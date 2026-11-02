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
  const createStart = '          objectHeap = {\n            ...objectHeap,'
  const createEnd = '          nextObjectId += 1'
  assert.equal(code.split(createStart).length, 2)
  assert.equal(code.split(createEnd).length, 2)
  code = code.replace(createStart, `          const copyStart = performance.now()\n${createStart}`)
    .replace(createEnd, `          heapProfile.createMs += performance.now() - copyStart\n          heapProfile.creates++\n          heapProfile.copiedEntries += nextObjectId - 1\n${createEnd}`)
  const start = code.indexOf('function setObjectField(')
  const end = code.indexOf('\nfunction requireObjectInstance(', start)
  const original = code.slice(start, end)
  assert.ok(original.includes('  return {\n    ...objectHeap,'))
  const instrumented = original.replace('  return {\n    ...objectHeap,', '  const copyStart = performance.now()\n  const result = {\n    ...objectHeap,')
    .replace(/\n}\n$/, '\n  heapProfile.updateMs += performance.now() - copyStart\n  heapProfile.updates++\n  heapProfile.copiedEntries += heapProfile.creates\n  return result\n}\n')
  code = `${code.slice(0, start)}${instrumented}${code.slice(end)}\nexport const heapProfile = { createMs: 0, updateMs: 0, creates: 0, updates: 0, copiedEntries: 0 }\n`
  await writeFile(path, code)
  server = await createServer({ configFile: false, server: { middlewareMode: true, fs: { allow: [temporary, process.cwd()] } }, appType: 'custom' })
  const api = await server.ssrLoadModule(path)
  const { workloads } = await server.ssrLoadModule(resolve('scripts/benchmarks/programs.ts'))
  const samples = []
  for (const name of ['mutating-object', 'mandelbrot-51x51-30']) {
    const workload = workloads.find(w => w.name === name)
    for (let iteration = -1; iteration < 3; iteration++) {
      for (const key of Object.keys(api.heapProfile)) api.heapProfile[key] = 0
      const start = performance.now()
      const state = api.runExecution({ ...api.createExecution(structuredClone(workload.program), workload.inputs, structuredClone(workload.options)), collectFeedback: false })
      const elapsedMs = performance.now() - start
      assert.equal(state.status, 'halted', state.error)
      const sample = { name, elapsedMs, steps: state.steps, ...api.heapProfile }
      if (iteration >= 0) samples.push(sample)
    }
  }
  console.log(JSON.stringify({ source, note: 'Instrumentation timing includes construction of the replacement instance/fields; timer overhead perturbs execution. copiedEntries counts table entries copied, not bytes.', samples }, null, 2))
} finally {
  await server?.close()
  await rm(temporary, { recursive: true, force: true })
}
