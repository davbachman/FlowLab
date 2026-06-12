import { describe, expect, it } from 'vitest'
import {
  displayFlowLabFileName,
  resolveFlowLabImports,
} from './imports'
import type { Program } from './types'

const helperProgram: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    { id: 'main-end', type: 'return', text: '0', position: { x: 0, y: 100 } },
    {
      id: 'helper',
      type: 'function',
      text: 'helper',
      position: { x: 320, y: 0 },
    },
    {
      id: 'helper-return',
      type: 'return',
      text: '1',
      position: { x: 320, y: 100 },
    },
  ],
  edges: [
    { id: 'e1', source: 'main', target: 'main-end' },
    { id: 'e2', source: 'helper', target: 'helper-return' },
  ],
}

describe('imports', () => {
  it('resolves turtle as a native library without loading a JSON file', async () => {
    const resolution = await resolveFlowLabImports('turtle')

    expect(resolution.errors).toEqual([])
    expect(resolution.files).toEqual([])
    expect(resolution.nativeLibraries).toEqual([
      {
        name: 'turtle',
        functionNames: [
          'backward',
          'clear',
          'color',
          'forward',
          'home',
          'left',
          'pendown',
          'penup',
          'right',
        ],
      },
    ])
  })

  it('resolves text as a native library without loading a JSON file', async () => {
    const resolution = await resolveFlowLabImports('text')

    expect(resolution.errors).toEqual([])
    expect(resolution.files).toEqual([])
    expect(resolution.nativeLibraries).toEqual([
      {
        name: 'text',
        functionNames: ['text_from_url', 'split_words'],
      },
    ])
  })

  it('resolves turtle alongside normal FlowLab JSON imports', async () => {
    const directoryHandle = {
      getFileHandle: (name: string) => {
        if (name !== 'helpers.json') {
          return Promise.reject(new DOMException('Missing file', 'NotFoundError'))
        }

        return Promise.resolve({
          getFile: () =>
            Promise.resolve(
              new File([JSON.stringify(helperProgram)], name, {
                type: 'application/json',
              }),
            ),
        })
      },
    }

    const resolution = await resolveFlowLabImports('turtle, helpers', {
      directoryHandle,
    })

    expect(resolution.errors).toEqual([])
    expect(resolution.nativeLibraries.map((library) => library.name)).toEqual([
      'turtle',
    ])
    expect(resolution.files.map((file) => file.name)).toEqual(['helpers'])
  })

  it('keeps regular JSON display names unchanged', () => {
    expect(displayFlowLabFileName('helpers.json')).toBe('helpers')
  })
})
