import type { Program } from './types'

export const sampleProgram: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 240, y: 20 } },
    { id: 'input-n', type: 'input', text: 'n', position: { x: 240, y: 130 } },
    {
      id: 'init-total',
      type: 'assignment',
      text: 'total <- 0',
      position: { x: 240, y: 240 },
    },
    {
      id: 'while-n',
      type: 'while',
      text: 'n > 0',
      position: { x: 243, y: 360 },
    },
    {
      id: 'add-n',
      type: 'assignment',
      text: 'total <- total + n',
      position: { x: 20, y: 470 },
    },
    {
      id: 'dec-n',
      type: 'assignment',
      text: 'n <- n - 1',
      position: { x: 20, y: 580 },
    },
    {
      id: 'show-total',
      type: 'output',
      text: 'total',
      position: { x: 240, y: 590 },
    },
    { id: 'return', type: 'return', text: 'total', position: { x: 240, y: 710 } },
  ],
  edges: [
    { id: 'edge-main-input', source: 'main', target: 'input-n' },
    { id: 'edge-input-init', source: 'input-n', target: 'init-total' },
    { id: 'edge-init-while', source: 'init-total', target: 'while-n' },
    {
      id: 'edge-while-add',
      source: 'while-n',
      target: 'add-n',
      label: 'true',
    },
    { id: 'edge-add-dec', source: 'add-n', target: 'dec-n' },
    { id: 'edge-dec-while', source: 'dec-n', target: 'while-n' },
    {
      id: 'edge-while-output',
      source: 'while-n',
      target: 'show-total',
      label: 'false',
    },
    { id: 'edge-output-return', source: 'show-total', target: 'return' },
  ],
}
