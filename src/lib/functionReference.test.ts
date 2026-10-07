import { describe, expect, it } from 'vitest'
import { availableFunctionReferenceSections } from './functionReference'
import { callableImportedFunctionNames, type ImportResolution } from './imports'
import type { Program } from './types'

function programWithFunction(comment?: string): Program {
  return {
    version: 1,
    nodes: [{ id: 'helper', type: 'function', text: ' helper ', comment, position: { x: 0, y: 0 } }],
    edges: [],
  }
}

describe('function docstrings in the reference', () => {
  it.each([undefined, '', ' \n\t ', '  Adds one.\n\nInput: x\nReturns: x + 1  '])(
    'uses comments with a fallback for empty docstrings: %j', (comment) => {
      const program = programWithFunction(comment)
      const imports: ImportResolution = { files: [{ name: 'helpers', program }], nativeLibraries: [], errors: [] }
      const local = availableFunctionReferenceSections(program, { ...imports, files: [] }, [])
      const imported = availableFunctionReferenceSections({ version: 1, nodes: [], edges: [] }, imports, ['helper'])
      expect(local.find((section) => section.id === 'current-program')?.functions[0].description)
        .toBe(comment?.trim() || 'Defined in the current program.')
      expect(imported.find((section) => section.id === 'flowlab-file-0')?.functions[0].description)
        .toBe(comment?.trim() || 'Imported FlowLab function.')
    },
  )

  it('uses the winning definition’s docstring when functions share a name', () => {
    const imports: ImportResolution = {
      files: [
        { name: 'first', program: programWithFunction('First library documentation') },
        { name: 'second', program: programWithFunction('Shadowed library documentation') },
      ],
      nativeLibraries: [], errors: [],
    }
    const empty: Program = { version: 1, nodes: [], edges: [] }
    const imported = availableFunctionReferenceSections(empty, imports, callableImportedFunctionNames(imports.files, empty))
    expect(imported.flatMap((section) => section.functions).filter((entry) => entry.name === 'helper'))
      .toEqual([{ name: 'helper', signature: 'helper(…)', description: 'First library documentation' }])
    const local = programWithFunction('Local documentation')
    const overridden = availableFunctionReferenceSections(local, imports, callableImportedFunctionNames(imports.files, local))
    expect(overridden.flatMap((section) => section.functions).filter((entry) => entry.name === 'helper'))
      .toEqual([{ name: 'helper', signature: 'helper(…)', description: 'Local documentation' }])
  })
})
