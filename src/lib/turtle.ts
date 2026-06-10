import type { RuntimeValue } from './types'

export const TURTLE_LIBRARY_NAME = 'turtle'
export const DEFAULT_TURTLE_COLOR = '#101828'

export const TURTLE_COMMAND_NAMES = [
  'backward',
  'clear',
  'color',
  'forward',
  'home',
  'left',
  'pendown',
  'penup',
  'right',
] as const

export type TurtleCommandName = (typeof TURTLE_COMMAND_NAMES)[number]

export interface TurtleSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

export interface TurtleState {
  x: number
  y: number
  heading: number
  penDown: boolean
  color: string
  segments: TurtleSegment[]
}

const TURTLE_COMMAND_SET = new Set<string>(TURTLE_COMMAND_NAMES)

export function initialTurtleState(): TurtleState {
  return {
    x: 0,
    y: 0,
    heading: 0,
    penDown: true,
    color: DEFAULT_TURTLE_COLOR,
    segments: [],
  }
}

export function isTurtleCommandName(name: string): name is TurtleCommandName {
  return TURTLE_COMMAND_SET.has(name)
}

export function runTurtleCommand(
  state: TurtleState,
  name: string,
  args: RuntimeValue[],
): TurtleState {
  if (!isTurtleCommandName(name)) {
    throw new Error(`Unknown turtle command "${name}"`)
  }

  switch (name) {
    case 'forward':
      return moveTurtle(state, requireSingleNumber(name, args))
    case 'backward':
      return moveTurtle(state, -requireSingleNumber(name, args))
    case 'left':
      return turnTurtle(state, requireSingleNumber(name, args))
    case 'right':
      return turnTurtle(state, -requireSingleNumber(name, args))
    case 'penup':
      requireNoArguments(name, args)
      return { ...state, penDown: false }
    case 'pendown':
      requireNoArguments(name, args)
      return { ...state, penDown: true }
    case 'color':
      return { ...state, color: requireSingleString(name, args) }
    case 'home':
      requireNoArguments(name, args)
      return { ...moveTurtleTo(state, 0, 0), heading: 0 }
    case 'clear':
      requireNoArguments(name, args)
      return { ...state, segments: [] }
  }
}

function moveTurtle(state: TurtleState, distance: number): TurtleState {
  const radians = (state.heading * Math.PI) / 180
  const nextX = cleanCoordinate(state.x + Math.cos(radians) * distance)
  const nextY = cleanCoordinate(state.y + Math.sin(radians) * distance)

  return moveTurtleTo(state, nextX, nextY)
}

function moveTurtleTo(
  state: TurtleState,
  nextX: number,
  nextY: number,
): TurtleState {
  const segment = {
    x1: state.x,
    y1: state.y,
    x2: nextX,
    y2: nextY,
    color: state.color,
  }

  return {
    ...state,
    x: nextX,
    y: nextY,
    segments: state.penDown ? [...state.segments, segment] : state.segments,
  }
}

function turnTurtle(state: TurtleState, degrees: number): TurtleState {
  return { ...state, heading: normalizeHeading(state.heading + degrees) }
}

function normalizeHeading(heading: number): number {
  const normalized = heading % 360
  return cleanCoordinate(normalized < 0 ? normalized + 360 : normalized)
}

function cleanCoordinate(value: number): number {
  const rounded = Math.round(value * 1e10) / 1e10
  return Math.abs(rounded) < 1e-10 ? 0 : rounded
}

function requireSingleNumber(name: string, args: RuntimeValue[]): number {
  if (args.length !== 1 || typeof args[0] !== 'number' || !Number.isFinite(args[0])) {
    throw new Error(`${name} requires exactly one finite number`)
  }

  return args[0]
}

function requireSingleString(name: string, args: RuntimeValue[]): string {
  if (args.length !== 1 || typeof args[0] !== 'string') {
    throw new Error(`${name} requires exactly one string`)
  }

  return args[0]
}

function requireNoArguments(name: string, args: RuntimeValue[]): void {
  if (args.length !== 0) {
    throw new Error(`${name} requires no arguments`)
  }
}
