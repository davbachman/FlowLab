import type { BranchLabel, Program, ProgramNode } from '../../src/lib/types'

// Synthetic, public fixtures. No coursework, graders, or private examples.
export function program(
  nodes: Array<[string, ProgramNode['type'], string]>,
  edges: Array<[string, string, BranchLabel?]>,
): Program {
  return {
    version: 1,
    nodes: nodes.map(([id, type, text]) => ({ id, type, text, position: { x: 0, y: 0 } })),
    edges: edges.map(([source, target, label], index) => ({ id: `e${index}`, source, target, ...(label ? { label } : {}) })),
  }
}

export const procedural = program([
  ['main', 'function', 'main'], ['input', 'input', 'n'],
  ['init', 'process', 'i <- 0\ntotal <- 0'], ['loop', 'while', 'i < n'],
  ['body', 'process', 'total <- total + (i % 17) * 3 - 1\ni <- i + 1'],
  ['end', 'return', 'total'],
], [['main', 'input'], ['input', 'init'], ['init', 'loop'], ['loop', 'body', 'true'], ['body', 'loop'], ['loop', 'end', 'false']])

export const recursive = program([
  ['main', 'function', 'main'], ['end', 'return', 'fib(16)'],
  ['fib', 'function', 'fib'], ['input', 'input', 'n'], ['test', 'if', 'n < 2'],
  ['base', 'return', 'n'], ['recurse', 'return', 'fib(n - 1) + fib(n - 2)'],
], [['main', 'end'], ['fib', 'input'], ['input', 'test'], ['test', 'base', 'true'], ['test', 'recurse', 'false']])

export const mutating = program([
  ['main', 'function', 'main'], ['init', 'process', 'b <- Counter(0)\nalias <- b\ni <- 0'],
  ['loop', 'while', 'i < 3000'], ['body', 'process', 'b.add(1)\ni <- i + 1'],
  ['end', 'return', '[b = alias, alias.value]'],
  ['class', 'class', 'Counter'], ['fields', 'input', 'value'],
  ['method', 'method', 'add'], ['input', 'input', 'amount'],
  ['change', 'process', 'self.value <- self.value + amount'], ['result', 'return', 'self'],
], [['main', 'init'], ['init', 'loop'], ['loop', 'body', 'true'], ['body', 'loop'], ['loop', 'end', 'false'],
  ['class', 'fields'], ['class', 'method'], ['method', 'input'], ['input', 'change'], ['change', 'result']])

// Intentionally overlapping node/edge IDs in separate libraries and the consumer.
export const libraryA = program([
  ['main', 'function', 'helperA'], ['input', 'input', 'x'], ['end', 'return', 'x + 1'],
], [['main', 'input'], ['input', 'end']])
export const libraryB = program([
  ['main', 'function', 'helperB'], ['input', 'input', 'x'], ['end', 'return', 'helperA(x) * 2'],
], [['main', 'input'], ['input', 'end']])
export const imported = program([
  ['main', 'function', 'main'], ['init', 'process', 'i <- 0\ntotal <- 0'],
  ['loop', 'while', 'i < 2000'], ['body', 'process', 'total <- total + helperB(i)\ni <- i + 1'],
  ['end', 'return', 'total'],
], [['main', 'init'], ['init', 'loop'], ['loop', 'body', 'true'], ['body', 'loop'], ['loop', 'end', 'false']])

export const mandelbrot = program([
  ['main', 'function', 'main'], ['init', 'process', 'y <- 0\npixels <- []'],
  ['rows', 'while', 'y < 51'], ['row', 'process', 'x <- 0\nrow <- []'],
  ['columns', 'while', 'x < 51'],
  ['point', 'process', 'c <- Complex(-2 + x * 3 / 50, -1.5 + y * 3 / 50)\nz <- Complex(0, 0)\nn <- 0'],
  ['iterate', 'while', 'n < 30 and z.real * z.real + z.imag * z.imag <= 4'],
  ['orbit', 'process', 'z <- z * z + c\nn <- n + 1'],
  ['pixel', 'process', 'shade <- n * 255 // 30\nrow <- row + [[shade, shade, shade]]\nx <- x + 1'],
  ['next-row', 'process', 'pixels <- pixels + [row]\ny <- y + 1'],
  ['display', 'call', 'imshow(pixels)'], ['end', 'return', '0'],
  ['complex', 'class', 'Complex'], ['fields', 'input', 'real\nimag'],
  ['mul', 'method', '__mul__'], ['mul-input', 'input', 'other'],
  ['mul-result', 'return', 'Complex(self.real * other.real - self.imag * other.imag, self.real * other.imag + self.imag * other.real)'],
  ['add', 'method', '__add__'], ['add-input', 'input', 'other'],
  ['add-result', 'return', 'Complex(self.real + other.real, self.imag + other.imag)'],
], [['main', 'init'], ['init', 'rows'], ['rows', 'row', 'true'], ['rows', 'display', 'false'],
  ['row', 'columns'], ['columns', 'point', 'true'], ['columns', 'next-row', 'false'],
  ['point', 'iterate'], ['iterate', 'orbit', 'true'], ['iterate', 'pixel', 'false'], ['orbit', 'iterate'],
  ['pixel', 'columns'], ['next-row', 'rows'], ['display', 'end'], ['complex', 'fields'],
  ['complex', 'mul'], ['mul', 'mul-input'], ['mul-input', 'mul-result'],
  ['complex', 'add'], ['add', 'add-input'], ['add-input', 'add-result']])

export const workloads = [
  { name: 'procedural', program: procedural, inputs: ['20000'], options: {} },
  { name: 'recursive', program: recursive, inputs: [], options: {} },
  { name: 'mutating-object', program: mutating, inputs: [], options: {} },
  { name: 'imported-library', program: imported, inputs: [], options: { importedPrograms: [libraryA, libraryB] } },
  { name: 'mandelbrot-51x51-30', program: mandelbrot, inputs: [], options: { nativeLibraries: ['image'] } },
]
