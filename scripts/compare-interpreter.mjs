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
  for (const scenario of scenarios) {
    for (const mode of ['run', 'step', 'debugger', 'breakpoints']) {
      const execute = api => {
        let seed = 12345
        let draws = 0
        Math.random = () => { draws++; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
        const source = structuredClone(scenario.program)
        let state = api.createExecution(source, scenario.inputs, structuredClone(scenario.options))
        const trace = [{ state: structuredClone(state), draws }]
        for (let count = 0; count < 10000 && state.status !== 'halted' && state.status !== 'error'; count++) {
          let reason
          if (state.status === 'asking') state = api.answerAskExecution(state, '7')
          else if (state.status === 'loading' && state.textRequest) state = api.completeTextLoadExecution(state, 'loaded')
          else if (state.status === 'loading') state = api.completeImageLoadExecution(state, { width: 1, height: 1, pixels: new Uint8ClampedArray([11, 22, 33, 255]) })
          else if (state.status === 'waiting') state = { ...api.replaceExecutionInputQueue(state, ['2', '3']), status: 'running' }
          else if (mode === 'run') state = api.runExecution(state)
          else if (mode === 'step') state = api.stepExecution(state)
          else {
            const chunk = mode === 'debugger'
              ? api.stepExecutionChunk(state, { maxSteps: 3, maxMilliseconds: Infinity })
              : api.runExecutionChunk(state, { maxSteps: 3, maxMilliseconds: Infinity, breakpoints: new Set(source.nodes.map(n => n.id)), skipCurrentBreakpoint: true })
            state = chunk.state
            reason = chunk.reason
          }
          trace.push({ state: structuredClone(state), draws, reason })
        }
        assert.ok(state.status === 'halted' || state.status === 'error', `${scenario.name} never finished`)
        return trace
      }
      const expected = execute(before)
      const actual = execute(after)
      assert.deepEqual(actual, expected, `${scenario.name}: ${mode}`)
      snapshots += actual.length
    }
    console.log(`${scenario.name}: identical Run, Step, debugger, and breakpoint states`)
  }
  console.log(`${scenarios.length} scenarios; ${snapshots} identical complete snapshots, including random draw counts`)
} finally {
  Math.random = originalRandom
  await server.close()
}
