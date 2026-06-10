import { describe, expect, it } from 'vitest'
import {
  TURTLE_COMMAND_NAMES,
  initialTurtleState,
  runTurtleCommand,
} from './turtle'

describe('turtle runtime', () => {
  it('moves with Python turtle coordinates and records pen-down segments', () => {
    let state = initialTurtleState()

    state = runTurtleCommand(state, 'forward', [100])
    state = runTurtleCommand(state, 'left', [90])
    state = runTurtleCommand(state, 'forward', [50])

    expect(state.x).toBeCloseTo(100)
    expect(state.y).toBeCloseTo(50)
    expect(state.heading).toBeCloseTo(90)
    expect(state.segments).toEqual([
      { x1: 0, y1: 0, x2: 100, y2: 0, color: '#101828' },
      { x1: 100, y1: 0, x2: 100, y2: 50, color: '#101828' },
    ])
  })

  it('supports pen state, colors, home, and clear', () => {
    let state = initialTurtleState()

    state = runTurtleCommand(state, 'color', ['red'])
    state = runTurtleCommand(state, 'penup', [])
    state = runTurtleCommand(state, 'backward', [20])
    state = runTurtleCommand(state, 'pendown', [])
    state = runTurtleCommand(state, 'right', [90])
    state = runTurtleCommand(state, 'forward', [10])
    state = runTurtleCommand(state, 'home', [])

    expect(state.segments).toEqual([
      { x1: -20, y1: 0, x2: -20, y2: -10, color: 'red' },
      { x1: -20, y1: -10, x2: 0, y2: 0, color: 'red' },
    ])

    state = runTurtleCommand(state, 'clear', [])

    expect(state.segments).toEqual([])
    expect(state.x).toBe(0)
    expect(state.y).toBe(0)
    expect(state.heading).toBe(0)
    expect(state.penDown).toBe(true)
  })

  it('rejects invalid turtle command arguments', () => {
    const state = initialTurtleState()

    expect(() => runTurtleCommand(state, 'forward', ['10'])).toThrow(
      /forward requires exactly one finite number/i,
    )
    expect(() => runTurtleCommand(state, 'color', [1])).toThrow(
      /color requires exactly one string/i,
    )
    expect(() => runTurtleCommand(state, 'penup', [1])).toThrow(
      /penup requires no arguments/i,
    )
  })

  it('exposes the v1 turtle command registry', () => {
    expect(TURTLE_COMMAND_NAMES).toEqual([
      'backward',
      'clear',
      'color',
      'forward',
      'home',
      'left',
      'pendown',
      'penup',
      'right',
    ])
  })

  it('rejects removed two-letter turtle commands', () => {
    const state = initialTurtleState()

    expect(TURTLE_COMMAND_NAMES).not.toContain('fd')
    expect(() => runTurtleCommand(state, 'fd', [10])).toThrow(
      /Unknown turtle command "fd"/,
    )
  })
})
