import {
  CORE_FUNCTION_NAMES,
  isBuiltInFunctionName,
} from './expression'
import { IMAGE_FUNCTION_NAMES, IMAGE_LIBRARY_NAME } from './image'
import type { ImportResolution } from './imports'
import { isVariableName } from './statements'
import { TEXT_FUNCTION_NAMES, TEXT_LIBRARY_NAME } from './text'
import { TURTLE_COMMAND_NAMES, TURTLE_LIBRARY_NAME } from './turtle'
import type { Program } from './types'

export interface FunctionReferenceEntry {
  name: string
  signature: string
  description: string
}

export interface FunctionReferenceSection {
  id: string
  title: string
  availability: string
  functions: FunctionReferenceEntry[]
}

export interface LibraryReferenceEntry {
  id: string
  name: string
  description: string
  imported: boolean
}

interface NativeLibraryReference {
  name: string
  title: string
  description: string
  functions: FunctionReferenceEntry[]
}

type FunctionDetails<Names extends readonly string[]> = Record<
  Names[number],
  Omit<FunctionReferenceEntry, 'name'>
>

function referenceEntries<Names extends readonly string[]>(
  names: Names,
  details: FunctionDetails<Names>,
): FunctionReferenceEntry[] {
  return names.map((name) => {
    const functionName = name as Names[number]
    return { name: functionName, ...details[functionName] }
  })
}

const CORE_FUNCTION_DETAILS = {
  sqrt: {
    signature: 'sqrt(number)',
    description: 'Returns the square root of a nonnegative Number.',
  },
  exp: {
    signature: 'exp(number)',
    description: 'Returns e raised to the given Number.',
  },
  log: {
    signature: 'log(number)',
    description: 'Returns the natural logarithm of a positive Number.',
  },
  log10: {
    signature: 'log10(number)',
    description: 'Returns the base-10 logarithm of a positive Number.',
  },
  sin: {
    signature: 'sin(radians)',
    description: 'Returns the sine of an angle measured in radians.',
  },
  cos: {
    signature: 'cos(radians)',
    description: 'Returns the cosine of an angle measured in radians.',
  },
  tan: {
    signature: 'tan(radians)',
    description: 'Returns the tangent of an angle measured in radians.',
  },
  asin: {
    signature: 'asin(number)',
    description: 'Returns an angle in radians whose sine is the given Number.',
  },
  acos: {
    signature: 'acos(number)',
    description: 'Returns an angle in radians whose cosine is the given Number.',
  },
  atan: {
    signature: 'atan(number)',
    description: 'Returns an angle in radians whose tangent is the given Number.',
  },
  atan2: {
    signature: 'atan2(y, x)',
    description: 'Returns the angle in radians from the positive x-axis to (x, y).',
  },
  rand: {
    signature: 'rand()',
    description: 'Returns a random Number from 0 up to, but not including, 1.',
  },
  ask: {
    signature: 'ask()',
    description: 'Opens an input dialog and returns the parsed value.',
  },
} satisfies FunctionDetails<typeof CORE_FUNCTION_NAMES>

const TEXT_FUNCTION_DETAILS = {
  text_from_url: {
    signature: 'text_from_url(url)',
    description: 'Loads a browser-readable URL and returns its text as a String.',
  },
  split_words: {
    signature: 'split_words(text)',
    description: 'Splits a String on whitespace and returns a List of words.',
  },
} satisfies FunctionDetails<typeof TEXT_FUNCTION_NAMES>

const IMAGE_FUNCTION_DETAILS = {
  get_pixel: {
    signature: 'get_pixel(image, x, y)',
    description: 'Returns one pixel as a red, green, blue, alpha List.',
  },
  image_from_pixels: {
    signature: 'image_from_pixels(rows)',
    description: 'Creates an Image from rectangular rows of RGB or RGBA pixels.',
  },
  image_to_pixels: {
    signature: 'image_to_pixels(image)',
    description: 'Returns every Image pixel as rows of RGBA Lists.',
  },
  imread: {
    signature: 'imread(url)',
    description: 'Loads a browser-readable image URL and returns a new Image.',
  },
  imsave: {
    signature: 'imsave(image, filename)',
    description: 'Downloads the Image pixels as a PNG file.',
  },
  imshow: {
    signature: 'imshow(image)',
    description: 'Displays an Image in the Image panel and returns it.',
  },
  imsize: {
    signature: 'imsize(image)',
    description: 'Returns the Image dimensions as [width, height].',
  },
  set_pixel: {
    signature: 'set_pixel(image, x, y, color)',
    description: 'Changes one RGB or RGBA pixel and returns the same Image.',
  },
} satisfies FunctionDetails<typeof IMAGE_FUNCTION_NAMES>

const TURTLE_FUNCTION_DETAILS = {
  backward: {
    signature: 'backward(distance)',
    description: 'Moves backward by a finite Number.',
  },
  clear: {
    signature: 'clear()',
    description: 'Erases all drawn lines without moving or turning the turtle.',
  },
  color: {
    signature: 'color(text)',
    description: 'Sets the drawing color from a String.',
  },
  forward: {
    signature: 'forward(distance)',
    description: 'Moves forward by a finite Number.',
  },
  home: {
    signature: 'home()',
    description: 'Moves to (0, 0) and faces right.',
  },
  left: {
    signature: 'left(degrees)',
    description: 'Turns left by a finite Number of degrees.',
  },
  pendown: {
    signature: 'pendown()',
    description: 'Resumes drawing while the turtle moves.',
  },
  penup: {
    signature: 'penup()',
    description: 'Moves the turtle without drawing.',
  },
  right: {
    signature: 'right(degrees)',
    description: 'Turns right by a finite Number of degrees.',
  },
} satisfies FunctionDetails<typeof TURTLE_COMMAND_NAMES>

const CORE_FUNCTION_REFERENCE: FunctionReferenceSection = {
  id: 'core',
  title: 'Core',
  availability: 'Always available.',
  functions: referenceEntries(CORE_FUNCTION_NAMES, CORE_FUNCTION_DETAILS),
}

const NATIVE_LIBRARY_REFERENCES: NativeLibraryReference[] = [
  {
    name: TEXT_LIBRARY_NAME,
    title: 'Text',
    description: 'Loads text from URLs and splits text into words.',
    functions: referenceEntries(TEXT_FUNCTION_NAMES, TEXT_FUNCTION_DETAILS),
  },
  {
    name: IMAGE_LIBRARY_NAME,
    title: 'Image',
    description: 'Loads, saves, displays, and edits raster images.',
    functions: referenceEntries(IMAGE_FUNCTION_NAMES, IMAGE_FUNCTION_DETAILS),
  },
  {
    name: TURTLE_LIBRARY_NAME,
    title: 'Turtle',
    description: 'Draws line graphics by moving and turning a turtle.',
    functions: referenceEntries(TURTLE_COMMAND_NAMES, TURTLE_FUNCTION_DETAILS),
  },
]

export function availableFunctionReferenceSections(
  program: Program,
  importResolution: ImportResolution,
  availableImportedFunctionNames: readonly string[],
): FunctionReferenceSection[] {
  const sections: FunctionReferenceSection[] = [CORE_FUNCTION_REFERENCE]
  const currentFunctionNames = [
    ...new Set(
      program.nodes
        .filter((node) => node.type === 'function')
        .map((node) => node.text.trim())
        .filter(
          (name) =>
            name !== 'main' &&
            isVariableName(name) &&
            !isBuiltInFunctionName(name),
        ),
    ),
  ].sort((left, right) => left.localeCompare(right))

  if (currentFunctionNames.length) {
    sections.push({
      id: 'current-program',
      title: 'This program',
      availability: 'Defined on the current canvas.',
      functions: userFunctionEntries(
        currentFunctionNames,
        'Defined in the current program.',
      ),
    })
  }

  const remainingImportedNames = new Set(availableImportedFunctionNames)
  const importedNativeNames = new Set(
    importResolution.nativeLibraries.map((library) => library.name),
  )

  for (const library of NATIVE_LIBRARY_REFERENCES) {
    if (!importedNativeNames.has(library.name)) {
      continue
    }

    const functions = library.functions.filter((entry) => {
      if (!remainingImportedNames.has(entry.name)) {
        return false
      }

      remainingImportedNames.delete(entry.name)
      return true
    })

    if (functions.length) {
      sections.push({
        id: library.name,
        title: library.title,
        availability: `Available from the imported ${library.name} library.`,
        functions,
      })
    }
  }

  for (const [fileIndex, file] of importResolution.files.entries()) {
    const names: string[] = []

    for (const node of file.program.nodes) {
      const name = node.text.trim()
      if (
        node.type !== 'function' ||
        name === 'main' ||
        !remainingImportedNames.has(name)
      ) {
        continue
      }

      remainingImportedNames.delete(name)
      names.push(name)
    }

    if (names.length) {
      sections.push({
        id: `flowlab-file-${fileIndex}`,
        title: file.name,
        availability: `Available from the imported ${file.name} FlowLab file.`,
        functions: userFunctionEntries(
          names.sort((left, right) => left.localeCompare(right)),
          'Imported FlowLab function.',
        ),
      })
    }
  }

  return sections
}

export function availableLibraryReferences(
  importResolution: ImportResolution,
): LibraryReferenceEntry[] {
  const importedNativeNames = new Set(
    importResolution.nativeLibraries.map((library) => library.name),
  )

  return [
    ...NATIVE_LIBRARY_REFERENCES.map((library) => ({
      id: `native-${library.name}`,
      name: library.name,
      description: library.description,
      imported: importedNativeNames.has(library.name),
    })),
    ...importResolution.files.map((file, index) => ({
      id: `flowlab-file-${index}`,
      name: file.name,
      description: 'User-defined FlowLab program file.',
      imported: true,
    })),
  ]
}

function userFunctionEntries(
  names: readonly string[],
  description: string,
): FunctionReferenceEntry[] {
  return names.map((name) => ({
    name,
    signature: `${name}(…)`,
    description,
  }))
}
