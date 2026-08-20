import { describe, expect, it } from 'vitest'
import {
  callableImportedClassNames,
  callableImportedFunctionNames,
  displayFlowLabFileName,
  importWarnings,
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

const objectLibraryProgram: Program = {
  version: 1,
  nodes: [
    { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
    { id: 'main-end', type: 'return', text: '0', position: { x: 0, y: 100 } },
    { id: 'point', type: 'class', text: 'Point(x, y)', position: { x: 300, y: 0 } },
    { id: 'move', type: 'method', text: 'move', position: { x: 600, y: 0 } },
    { id: 'move-end', type: 'return', text: 'self', position: { x: 600, y: 100 } },
  ],
  edges: [
    { id: 'e1', source: 'main', target: 'main-end' },
    { id: 'point-move', source: 'point', target: 'move' },
    { id: 'm1', source: 'move', target: 'move-end' },
  ],
}

const pointFunctionProgram: Program = {
  ...helperProgram,
  nodes: helperProgram.nodes.map((node) =>
    node.id === 'helper' ? { ...node, text: 'Point' } : node,
  ),
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
        functionNames: ['text_from_url', 'split_words', 'chr', 'ord'],
      },
    ])
  })

  it('resolves image as a native library without loading a JSON file', async () => {
    const resolution = await resolveFlowLabImports('image')

    expect(resolution.errors).toEqual([])
    expect(resolution.files).toEqual([])
    expect(resolution.nativeLibraries).toEqual([
      {
        name: 'image',
        functionNames: [
          'get_pixel',
          'image_from_pixels',
          'image_to_pixels',
          'imread',
          'imsave',
          'imshow',
          'imsize',
          'set_pixel',
        ],
      },
    ])
  })

  it('resolves math as a native library without loading a JSON file', async () => {
    const resolution = await resolveFlowLabImports('math')

    expect(resolution.errors).toEqual([])
    expect(resolution.files).toEqual([])
    expect(resolution.nativeLibraries).toEqual([
      {
        name: 'math',
        functionNames: [
          'exp',
          'log',
          'log10',
          'sin',
          'cos',
          'tan',
          'asin',
          'acos',
          'atan',
          'atan2',
        ],
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

  it('loads imported programs containing Classes and Methods', async () => {
    const directoryHandle = {
      getFileHandle: (name: string) =>
        name === 'objects.json'
          ? Promise.resolve({
              getFile: () =>
                Promise.resolve(
                  new File([JSON.stringify(objectLibraryProgram)], name, {
                    type: 'application/json',
                  }),
                ),
            })
          : Promise.reject(new DOMException('Missing file', 'NotFoundError')),
    }

    const resolution = await resolveFlowLabImports('objects', { directoryHandle })
    expect(resolution.errors).toEqual([])
    expect(resolution.files[0]?.program).toEqual(objectLibraryProgram)
  })

  it('exposes imported Class constructors as callable names', () => {
    const files = [{ name: 'objects', program: objectLibraryProgram }]

    expect(callableImportedFunctionNames(files, helperProgram)).toContain('Point')
    expect(callableImportedClassNames(files, helperProgram)).toEqual(['Point'])
  })

  it('lets the first imported Function or Class claim a shared callable name', () => {
    const functionFirst = [
      { name: 'functions', program: pointFunctionProgram },
      { name: 'objects', program: objectLibraryProgram },
    ]
    const classFirst = [...functionFirst].reverse()

    expect(callableImportedFunctionNames(functionFirst, helperProgram)).toContain(
      'Point',
    )
    expect(callableImportedClassNames(functionFirst, helperProgram)).toEqual([])
    expect(callableImportedClassNames(classFirst, helperProgram)).toEqual([
      'Point',
    ])
  })

  it('does not report Methods from a file whose Class lost its callable name', () => {
    const warnings = importWarnings(
      [
        { name: 'functions', program: pointFunctionProgram },
        { name: 'objects', program: objectLibraryProgram },
      ],
      helperProgram,
    ).join('\n')

    expect(warnings).toMatch(
      /Class "Point" from "objects".*ignored.*"functions" already imports/i,
    )
    expect(warnings).not.toMatch(/Method "Point\.move"/i)
  })

  it('does not report Methods from a later file whose duplicate Class lost', () => {
    const warnings = importWarnings(
      [
        { name: 'first-objects', program: objectLibraryProgram },
        { name: 'second-objects', program: objectLibraryProgram },
      ],
      helperProgram,
    ).join('\n')

    expect(warnings).toMatch(
      /Class "Point" from "second-objects".*ignored.*"first-objects" already imports/i,
    )
    expect(warnings).not.toMatch(/Method "Point\.move"/i)
  })

  it('warns only for an imported Class when the current canvas owns its name', () => {
    const warnings = importWarnings(
      [{ name: 'objects', program: objectLibraryProgram }],
      objectLibraryProgram,
    ).join('\n')

    expect(warnings).toMatch(/Class "Point".*ignored.*current canvas/i)
    expect(warnings).not.toMatch(/Method "Point\.move"/i)
  })
})
