import {
  bankAccountProgram,
  dictionaryInventoryProgram,
  listStatisticsProgram,
  numberGuessProgram,
  processBasicsProgram,
  turtlePolygonProgram,
} from './additionalSamplePrograms'
import { objectSampleProgram } from './objectSampleProgram'
import { sampleProgram } from './sampleProgram'
import type { Program } from './types'

export interface FlowLabExample {
  id:
    | 'basic'
    | 'process-basics'
    | 'number-guess'
    | 'list-statistics'
    | 'dictionary-inventory'
    | 'object'
    | 'bank-account'
    | 'turtle-polygon'
  label: string
  program: Program
  inputQueue: string
  requiredImports: string[]
  message: string
}

export const FLOWLAB_EXAMPLES: FlowLabExample[] = [
  {
    id: 'basic',
    label: 'Basic',
    program: sampleProgram,
    inputQueue: '3',
    requiredImports: [],
    message: 'Sample program loaded.',
  },
  {
    id: 'process-basics',
    label: 'Process Basics',
    program: processBasicsProgram,
    inputQueue: '',
    requiredImports: [],
    message: 'Process Basics sample loaded.',
  },
  {
    id: 'number-guess',
    label: 'Number Guess',
    program: numberGuessProgram,
    inputQueue: '',
    requiredImports: [],
    message: 'Number Guess sample loaded. Run it and enter a number from 0 to 1.',
  },
  {
    id: 'list-statistics',
    label: 'List Statistics',
    program: listStatisticsProgram,
    inputQueue: '',
    requiredImports: [],
    message: 'List Statistics sample loaded.',
  },
  {
    id: 'dictionary-inventory',
    label: 'Dictionary Inventory',
    program: dictionaryInventoryProgram,
    inputQueue: '',
    requiredImports: [],
    message: 'Dictionary Inventory sample loaded.',
  },
  {
    id: 'object',
    label: 'Object',
    program: objectSampleProgram,
    inputQueue: '',
    requiredImports: [],
    message: 'Object sample loaded.',
  },
  {
    id: 'bank-account',
    label: 'Bank Account Class',
    program: bankAccountProgram,
    inputQueue: '',
    requiredImports: [],
    message: 'Bank Account Class sample loaded.',
  },
  {
    id: 'turtle-polygon',
    label: 'Turtle Polygon',
    program: turtlePolygonProgram,
    inputQueue: '',
    requiredImports: ['turtle'],
    message: 'Turtle Polygon sample loaded.',
  },
]
