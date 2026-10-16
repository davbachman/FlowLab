import { describe, expect, it } from 'vitest'
import { answerAskExecution, createExecution, runExecution, stepExecution } from './interpreter'
import type { Program } from './types'
import { validateProgram } from './validation'

const program: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    { id: 'inputs', type: 'input', text: 'base\nexponent', position: { x: 0, y: 100 } },
    { id: 'power', type: 'process', text: 'result <- base ^ exponent', position: { x: 0, y: 200 } },
    { id: 'show', type: 'output', text: 'result\n-2^2\n2^3^2', position: { x: 0, y: 300 } },
    { id: 'end', type: 'return', text: 'result ^ 2', position: { x: 0, y: 400 } },
  ],
  edges: [
    { id: 'start', source: 'main', target: 'inputs' },
    { id: 'power', source: 'inputs', target: 'power' },
    { id: 'show', source: 'power', target: 'show' },
    { id: 'end', source: 'show', target: 'end' },
  ],
}

describe('exponentiation in flowcharts', () => {
  it.each(['Run', 'Step'])('validates and evaluates powers in Process, Output, and Return blocks with %s', mode => {
    expect(validateProgram(program)).toEqual({ valid: true, errors: [] })
    let state = createExecution(program, ['2', '3'])
    if (mode === 'Run') state = runExecution(state)
    else for (let step = 0; step < 10 && state.status !== 'halted'; step += 1) state = stepExecution(state)
    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['8', '-4', '512'])
    expect(state.returnValue).toBe(64)
  })

  it('resumes calls inside a chain of powers without losing operands or repeating prompts', () => {
    const askingProgram: Program = {
      ...program,
      nodes: program.nodes.filter(node => !['inputs', 'power'].includes(node.id)).map(node =>
        node.id === 'show' ? { ...node, text: 'ask() ^ ask() ^ ask()' }
          : node.id === 'end' ? { ...node, text: '0' } : node,
      ),
      edges: [{ id: 'start', source: 'main', target: 'show' }, { id: 'end', source: 'show', target: 'end' }],
    }
    expect(validateProgram(askingProgram).valid).toBe(true)
    let state = runExecution(createExecution(askingProgram, []))
    for (const answer of ['2', '3', '2']) {
      expect(state.status).toBe('asking')
      expect(state.output).toEqual([])
      state = runExecution(answerAskExecution(state, answer))
    }
    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['512'])
  })
})
