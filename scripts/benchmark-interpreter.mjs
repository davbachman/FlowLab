// node scripts/benchmark-interpreter.mjs --source /path/to/checkout --output /tmp/results.json
import { createServer } from 'vite'
import { writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { platform, arch, cpus } from 'node:os'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const args = process.argv.slice(2)
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const source = resolve(option('--source', '.'))
const repeats = Number(option('--repeats', '3'))
const warmups = Number(option('--warmups', '1'))
const selected = option('--case', '')
const mode = option('--mode', 'headless')
assert.ok(mode === 'headless' || mode === 'chunks', '--mode must be headless or chunks')
// JSON's default number encoding loses -0 (and nonfinite values). Keep the
// comparison lossless, including numeric signs in intermediate object fields.
const encodeNumber = (_key, value) => typeof value === 'number' && (Object.is(value, -0) || !Number.isFinite(value))
  ? { $number: Object.is(value, -0) ? '-0' : String(value) } : value
const decodeNumber = (_key, value) => value && typeof value === 'object' && Object.keys(value).length === 1 && '$number' in value
  ? Number(value.$number) : value
const server = await createServer({ configFile: false, server: { middlewareMode: true, fs: { allow: [source, process.cwd()] } }, appType: 'custom' })
try {
  const interpreter = await server.ssrLoadModule(`${source}/src/lib/interpreter.ts`)
  const debuggerApi = mode === 'chunks' ? await server.ssrLoadModule(`${source}/src/lib/debugger.ts`) : undefined
  const { workloads } = await server.ssrLoadModule(resolve('scripts/benchmarks/programs.ts'))
  const results = { environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0].model }, mode, repeats, warmups, workloads: [] }
  for (const workload of workloads.filter(w => !selected || w.name === selected)) {
    const durations = []
    let observation
    for (let iteration = -warmups; iteration < repeats; iteration++) {
      // Fresh program JSON and execution every time, with identical inputs.
      const program = structuredClone(workload.program)
      const options = structuredClone(workload.options)
      const start = performance.now()
      let state = { ...interpreter.createExecution(program, workload.inputs, options), collectFeedback: false }
      if (debuggerApi) {
        while (state.status === 'running') state = debuggerApi.runExecutionChunk(state, { maxSteps: 10000, maxMilliseconds: Infinity, collectFeedback: false }).state
      } else state = interpreter.runExecution(state)
      const elapsed = performance.now() - start
      assert.equal(state.status, 'halted', state.error)
      const images = Object.values(state.image?.images ?? {}).map(img => ({ width: img.width, height: img.height, pixels: Array.from(img.pixels) }))
      const actual = { steps: state.steps, output: state.output, returnValue: state.returnValue, environment: state.environment, objectHeap: state.objectHeap, nextObjectId: state.nextObjectId, images }
      if (observation) assert.deepEqual(actual, observation)
      observation = actual
      if (iteration >= 0) durations.push(elapsed)
      process.stderr.write(`${workload.name} ${iteration < 0 ? 'warmup' : iteration + 1}: ${elapsed.toFixed(1)} ms; ${state.steps} steps; ${state.nextObjectId - 1} objects\n`)
    }
    const medianMs = [...durations].sort((a, b) => a - b)[Math.floor(durations.length / 2)]
    const pixelSha256 = createHash('sha256').update(Buffer.from(observation.images.flatMap(img => img.pixels))).digest('hex')
    results.workloads.push({ name: workload.name, durationsMs: durations, medianMs, pixelSha256, observation })
  }
  const compare = option('--compare', '')
  if (compare) {
    const baseline = JSON.parse(await readFile(compare, 'utf8'), decodeNumber)
    assert.deepEqual(results.environment, baseline.environment)
    assert.equal(results.mode, baseline.mode ?? 'headless')
    for (const result of results.workloads) {
      const before = baseline.workloads.find(w => w.name === result.name)
      // Compare complete buffers and all observed heap fields, not just checksums.
      assert.deepEqual(result.observation, before.observation, result.name)
      result.speedup = before.medianMs / result.medianMs
    }
  }
  const output = option('--output', '')
  if (output) await writeFile(output, `${JSON.stringify(results, encodeNumber)}\n`)
  console.log(JSON.stringify({ ...results, workloads: results.workloads.map(({ observation, ...result }) => ({ ...result, steps: observation.steps, objects: observation.nextObjectId - 1, imageBytes: observation.images.reduce((sum, image) => sum + image.pixels.length, 0) })) }, null, 2))
} finally {
  await server.close()
}
