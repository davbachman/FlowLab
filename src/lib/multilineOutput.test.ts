import { describe, expect, it } from 'vitest'
import { answerAskExecution, completeTextLoadExecution, createExecution, runExecution, stepExecution } from './interpreter'
import { validateProgram } from './validation'
import { validationFeedbackForProgram } from './validationFeedback'
import type { Program } from './types'

function outputProgram(text: string): Program {
  return {
    version: 1,
    nodes: [
      { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
      { id: 'show', type: 'output', text, position: { x: 0, y: 100 } },
      { id: 'end', type: 'return', text: '0', position: { x: 0, y: 200 } },
    ],
    edges: [{ id: 'start', source: 'main', target: 'show' }, { id: 'end', source: 'show', target: 'end' }],
  }
}

describe('multiline Output blocks', () => {
  it('prints one expression per nonblank line in a single step, including intentional empty strings', () => {
    const program = outputProgram(' "before" \r\n\n2 + 3\n""')
    const before = stepExecution(createExecution(program, []))
    const after = stepExecution(before)
    expect(after.status).toBe('running')
    expect(after.currentNodeId).toBe('end')
    expect(after.steps).toBe(before.steps + 1)
    expect(after.output).toEqual(['before', '5', ''])
    expect(before.output).toEqual([])
  })

  it('prints function-call results in order without repeating earlier lines', () => {
    const program = outputProgram('"before"\nhelper(4)\n"after"')
    program.nodes.push(
      { id: 'helper', type: 'function', text: 'helper', position: { x: 300, y: 0 } },
      { id: 'arg', type: 'input', text: 'x', position: { x: 300, y: 100 } },
      { id: 'inside', type: 'output', text: '"inside"', position: { x: 300, y: 200 } },
      { id: 'result', type: 'return', text: 'x * 2', position: { x: 300, y: 300 } },
    )
    program.edges.push(
      { id: 'arg', source: 'helper', target: 'arg' },
      { id: 'inside', source: 'arg', target: 'inside' },
      { id: 'result', source: 'inside', target: 'result' },
    )
    const state = runExecution(createExecution(program, []))
    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['before', 'inside', '8', 'after'])
  })

  it('resumes separately at each ask without reprinting completed lines', () => {
    let state = runExecution(createExecution(outputProgram('"before"\nask()\nask()\n"after"'), []))
    expect(state.status).toBe('asking')
    expect(state.output).toEqual(['before'])
    state = runExecution(answerAskExecution(state, '42'))
    expect(state.status).toBe('asking')
    expect(state.output).toEqual(['before', '42'])
    state = runExecution(answerAskExecution(state, '7'))
    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['before', '42', '7', 'after'])
  })

  it('resumes a loaded text expression without repeating earlier output', () => {
    const program = outputProgram('"before"\ntext_from_url("https://example.test/text")\n"after"')
    let state = runExecution(createExecution(program, [], { nativeLibraries: ['text'] }))
    expect(state.status).toBe('loading')
    expect(state.output).toEqual(['before'])
    state = runExecution(completeTextLoadExecution(state, 'loaded'))
    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['before', 'loaded', 'after'])
  })

  it('resumes object representation methods independently on each output line', () => {
    const program = outputProgram('item\nitem\n"after"')
    program.nodes.push(
      { id: 'box', type: 'class', text: 'Box', position: { x: 300, y: 0 } },
      { id: 'repr', type: 'method', text: '__repr__', position: { x: 300, y: 100 } },
      { id: 'repr-result', type: 'return', text: 'ask()', position: { x: 300, y: 200 } },
      { id: 'make', type: 'process', text: 'item <- Box()', position: { x: 0, y: 50 } },
    )
    program.edges[0] = { id: 'start', source: 'main', target: 'make' }
    program.edges.push(
      { id: 'show', source: 'make', target: 'show' },
      { id: 'repr', source: 'box', target: 'repr' },
      { id: 'repr-result', source: 'repr', target: 'repr-result' },
    )
    let state = runExecution(createExecution(program, []))
    expect(state.status).toBe('asking')
    state = runExecution(answerAskExecution(state, 'first'))
    expect(state.status).toBe('asking')
    expect(state.output).toEqual(['first'])
    state = runExecution(answerAskExecution(state, 'second'))
    expect(state.status).toBe('halted')
    expect(state.output).toEqual(['first', 'second', 'after'])
  })

  it('preserves earlier output and identifies the line of a runtime error', () => {
    const state = runExecution(createExecution(outputProgram('"before"\n\n1 / 0'), []))
    expect(state.status).toBe('error')
    expect(state.output).toEqual(['before'])
    expect(state.error).toMatch(/Output node "show", line 3:/)
  })

  it('validates each expression with line numbers and reports missing function calls', () => {
    const malformed = outputProgram('"before"\n\nx +')
    const feedback = validationFeedbackForProgram(malformed, validateProgram(malformed).errors)
    expect(feedback.find((issue) => issue.field === 'text')).toMatchObject({ nodeId: 'show', lineNumber: 3 })
    expect(validateProgram(outputProgram('"before"\n\nmissing()')).errors.join('\n')).toMatch(/missing Function "missing" on line 3/)
    expect(validateProgram(outputProgram(' \n\t')).valid).toBe(false)
  })

  it('handles many expressions without recursive stack growth', () => {
    const state = runExecution(createExecution(outputProgram(Array(2000).fill('1').join('\n')), []))
    expect(state.status).toBe('halted')
    expect(state.output).toHaveLength(2000)
  })
})
