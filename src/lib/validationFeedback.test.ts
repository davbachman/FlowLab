import { describe, expect, it } from 'vitest'
import { validationFeedbackForProgram } from './validationFeedback'
import { validateProgram } from './validation'
import type { Program } from './types'

const program: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    { id: 'while-n', type: 'while', text: 'n >', position: { x: 0, y: 100 } },
    { id: 'end', type: 'return', text: '0', position: { x: 0, y: 200 } },
  ],
  edges: [{ id: 'start-loop', source: 'main', target: 'while-n' }],
}

describe('actionable validation feedback', () => {
  it('explains an unfinished condition and targets its editable text', () => {
    const errors = validateProgram(program).errors
    const feedback = validationFeedbackForProgram(program, errors)
    expect(feedback.find((entry) => entry.originalMessage.includes('invalid text'))).toMatchObject({
      message: 'While: Add an expression after ">".',
      nodeId: 'while-n',
      field: 'text',
    })
  })

  it('targets wiring errors at the block without focusing its text field', () => {
    const [feedback] = validationFeedbackForProgram(program, [
      'While node "while-n" must have one true edge and one false edge.',
    ])
    expect(feedback).toMatchObject({
      nodeId: 'while-n',
      field: 'connections',
      message: 'While block needs one True connection and one False connection.',
    })
  })

  it('targets a malformed connection and its source block', () => {
    const [feedback] = validationFeedbackForProgram(program, [
      'Edge "start-loop" has a branch label, but only If, While, and For nodes may use true/false labels.',
    ])
    expect(feedback).toMatchObject({ edgeId: 'start-loop', nodeId: 'main', field: 'connections' })
    expect(feedback.message).toMatch(/^This connection/)
  })

  it('targets imports and leaves global errors untargeted', () => {
    const feedback = validationFeedbackForProgram(program, [
      'Import "missing": File not found.',
      'Program must have at least one Return node.',
    ])
    expect(feedback[0].field).toBe('imports')
    expect(feedback[1].nodeId).toBeUndefined()
    expect(feedback[1].field).toBeUndefined()
  })

  it('uses the failing Process line when explaining a missing operand', () => {
    const processProgram: Program = {
      ...program,
      nodes: [{ id: 'process', type: 'process', text: 'x <- 2\ny <- x +', position: { x: 0, y: 0 } }],
    }
    const [feedback] = validationFeedbackForProgram(processProgram, [
      'Process node "process" has invalid text: Line 2: Expected expression',
    ])
    expect(feedback).toMatchObject({
      nodeId: 'process', field: 'text', lineNumber: 2,
      message: 'Process: Line 2: Add an expression after "+".',
    })
  })

  it('targets declarations named in validation messages', () => {
    const declaredProgram: Program = {
      ...program,
      nodes: [...program.nodes, { id: 'sqrt-function', type: 'function', text: 'sqrt', position: { x: 300, y: 0 } }],
    }
    const [feedback] = validationFeedbackForProgram(declaredProgram, ['Function name "sqrt" is reserved for a built-in.'])
    expect(feedback).toMatchObject({ nodeId: 'sqrt-function', field: 'text' })
  })

  it('explains unterminated text and preserves the exact diagnostic for details', () => {
    const outputProgram: Program = {
      ...program,
      nodes: [{ id: 'out', type: 'output', text: '"Hello', position: { x: 0, y: 0 } }],
    }
    const original = 'Output node "out" has invalid text: Unterminated string literal'
    const [feedback] = validationFeedbackForProgram(outputProgram, [original])
    expect(feedback.message).toBe('Output: Close the quoted text with a matching quotation mark.')
    expect(feedback.originalMessage).toBe(original)
  })
})
