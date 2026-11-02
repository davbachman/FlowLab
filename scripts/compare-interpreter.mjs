// Compare a saved baseline source tree with this checkout, using controlled
// random/input/load events and complete state snapshots after every API action.
import { createServer } from 'vite'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const baseline = process.argv[2]
assert.ok(baseline, 'Usage: node scripts/compare-interpreter.mjs /path/to/baseline')
const server = await createServer({ configFile: false, server: { middlewareMode: true, fs: { allow: [resolve(baseline), process.cwd()] } }, appType: 'custom' })
const originalRandom = Math.random
try {
  const load = async root => ({
    ...await server.ssrLoadModule(resolve(root, 'src/lib/interpreter.ts')),
    ...await server.ssrLoadModule(resolve(root, 'src/lib/debugger.ts')),
  })
  const before = await load(baseline)
  const after = await load('.')
  const { scenarios } = await server.ssrLoadModule(resolve('scripts/benchmarks/compatibility.ts'))
  let snapshots = 0
  let retainedChecks = 0
  let baselineProgressChanges = 0
  const identities = state => {
    const seen = new Map()
    const aliases = []
    const visit = (value, path) => {
      if (!value || typeof value !== 'object') return
      if (seen.has(value)) { aliases.push([path, seen.get(value)]); return }
      seen.set(value, path)
      for (const key of Object.keys(value)) visit(value[key], `${path}.${key}`)
    }
    visit(state.environment, 'environment')
    visit(state.objectHeap, 'objectHeap')
    return aliases
  }
  for (const scenario of scenarios) {
    for (const mode of ['run', 'step', 'debugger', 'breakpoints', 'cloned-step', 'external-step']) {
      const execute = (api, reference) => {
        let seed = 12345
        let draws = 0
        Math.random = () => { draws++; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
        const source = structuredClone(scenario.program)
        let state = api.createExecution(source, scenario.inputs, structuredClone(scenario.options))
        const trace = []
        const originals = []
        let previous
        const retain = reason => {
          const heap = state.objectHeap
          trace.push({ state: structuredClone(state), draws, reason, identities: identities(state),
            sameHeap: previous ? heap === previous.objectHeap : undefined,
            sharedInstances: previous ? Object.keys(heap).filter(id => heap[id] === previous.objectHeap[id]) : [],
          })
          originals.push(state)
          previous = state
        }
        retain()
        for (let count = 0; count < 10000 && state.status !== 'halted' && state.status !== 'error'; count++) {
          let reason
          if (state.status === 'asking') state = api.answerAskExecution(state, scenario.name === 'indexed-resumption' ? '0' : '7')
          else if (state.status === 'loading' && state.textRequest) state = api.completeTextLoadExecution(state, 'loaded')
          else if (state.status === 'loading') state = api.completeImageLoadExecution(state, { width: 1, height: 1, pixels: new Uint8ClampedArray([11, 22, 33, 255]) })
          else if (state.status === 'waiting') state = { ...api.replaceExecutionInputQueue(state, ['2', '3']), status: 'running' }
          else if (mode === 'run') state = api.runExecution(state)
          else if (mode === 'step' || mode === 'cloned-step' || mode === 'external-step') state = api.stepExecution(state)
          else {
            const chunk = mode === 'debugger'
              ? api.stepExecutionChunk(state, { maxSteps: 3, maxMilliseconds: Infinity })
              : api.runExecutionChunk(state, { maxSteps: 3, maxMilliseconds: Infinity, breakpoints: new Set(source.nodes.map(n => n.id)), skipCurrentBreakpoint: true })
            state = chunk.state
            reason = chunk.reason
          }
          retain(reason)
          if (mode === 'cloned-step') state = structuredClone(state)
          if (mode === 'external-step') {
            const plain = structuredClone(state)
            state = { ...plain, objectHeap: { ...plain.objectHeap } }
          }
        }
        assert.ok(state.status === 'halted' || state.status === 'error', `${scenario.name} never finished`)
        originals.forEach((original, index) => {
          assert.deepEqual(original.objectHeap, trace[index].state.objectHeap, `${scenario.name}: ${mode} retained heap ${index}`)
          if (reference) {
            // e140bdf shares member/random progress maps across resumptions.
            // Record that known historical-state defect; nothing else may drift.
            const withoutProgressMaps = value => JSON.stringify(value, (key, entry) =>
              key === 'completedMemberReads' || key === 'completedRandomValues' ? undefined : entry)
            assert.equal(withoutProgressMaps(original), withoutProgressMaps(trace[index].state))
            if (JSON.stringify(original) !== JSON.stringify(trace[index].state)) baselineProgressChanges++
          } else assert.deepEqual(original, trace[index].state, `${scenario.name}: ${mode} retained snapshot ${index}`)
        })
        retainedChecks += originals.length
        return trace
      }
      const expected = execute(before, true)
      const actual = execute(after, false)
      assert.deepEqual(actual, expected, `${scenario.name}: ${mode}`)
      snapshots += actual.length
    }
    console.log(`${scenario.name}: identical return-time states and heap identities in six modes; optimized retained originals unchanged`)
  }
  console.log(`${scenarios.length} scenarios; ${snapshots} identical complete snapshots; ${retainedChecks} retained-original checks; ${baselineProgressChanges} baseline snapshots with preexisting progress-map drift; controlled random draw counts`)
} finally {
  Math.random = originalRandom
  await server.close()
}
