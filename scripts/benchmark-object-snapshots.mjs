// node --expose-gc scripts/benchmark-object-snapshots.mjs --source /path/to/source [--observe]
// Retained-memory experiment, separate from the execution timing comparison.
import { createServer } from 'vite'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

assert.equal(typeof globalThis.gc, 'function', 'Run with node --expose-gc')
const args = process.argv.slice(2)
const source = resolve(args.includes('--source') ? args[args.indexOf('--source') + 1] : '.')
const observe = args.includes('--observe')
const server = await createServer({ configFile: false, server: { middlewareMode: true, fs: { allow: [source, process.cwd()] } }, appType: 'custom' })
try {
  const api = await server.ssrLoadModule(`${source}/src/lib/interpreter.ts`)
  const { runExecutionChunk } = await server.ssrLoadModule(`${source}/src/lib/debugger.ts`)
  const { program } = await server.ssrLoadModule(resolve('scripts/benchmarks/programs.ts'))
  const fixture = program([
    ['main', 'function', 'main'], ['init', 'process', 'i <- 0'], ['allocate', 'while', 'i < 6000'],
    ['add', 'process', 'item <- Cell(i)\ni <- i + 1'], ['reset', 'process', 'i <- 0'],
    ['mutate', 'while', 'i < 6000'], ['change', 'process', 'item.value <- item.value + 1\ni <- i + 1'],
    ['end', 'return', 'item.value'], ['cell', 'class', 'Cell(value)'],
  ], [['main', 'init'], ['init', 'allocate'], ['allocate', 'add', 'true'], ['add', 'allocate'], ['allocate', 'reset', 'false'],
    ['reset', 'mutate'], ['mutate', 'change', 'true'], ['change', 'mutate'], ['mutate', 'end', 'false']])
  const samples = []
  for (let iteration = -1; iteration < 3; iteration++) {
    globalThis.gc()
    const before = process.memoryUsage().heapUsed
    let state = { ...api.createExecution(structuredClone(fixture), []), collectFeedback: false }
    let retained = []
    while (state.status === 'running') {
      state = runExecutionChunk(state, { maxSteps: 100, maxMilliseconds: Infinity, collectFeedback: false }).state
      if (observe) void state.objectHeap
      retained.push(state)
    }
    assert.equal(state.returnValue, 11999)
    globalThis.gc()
    const retainedBytes = process.memoryUsage().heapUsed - before
    const count = retained.length
    // Check old object fields after measuring, so the unobserved measurement
    // doesn't accidentally materialize all the public snapshot tables.
    for (const snapshot of retained) {
      const lastId = snapshot.nextObjectId - 1
      if (lastId) {
        const expected = snapshot.currentNodeId === 'allocate' || snapshot.currentNodeId === 'add' || snapshot.currentNodeId === 'reset'
          ? lastId - 1 : 5999 + Number(snapshot.environment.i)
        assert.equal(snapshot.objectHeap[lastId].fields.value, expected)
      }
    }
    if (iteration >= 0) samples.push({ retainedBytes, snapshots: count, objects: state.nextObjectId - 1, steps: state.steps })
    retained = undefined
    state = undefined
    globalThis.gc()
  }
  console.log(JSON.stringify({ source, observe, note: 'Node heapUsed delta after forced test-harness GC; includes retained states, fields, private pages and any observed flat heaps; not peak RSS or browser memory.', samples }, null, 2))
} finally { await server.close() }
