import { imported, libraryA, libraryB, mutating, procedural, program, recursive } from './programs'

const effects = program([
  ['main', 'function', 'main'], ['init', 'process', 'b <- Box(0, 0)\nalias <- b\ni <- 0\nresults <- []'],
  ['loop', 'while', 'i < 3'],
  ['body', 'process', 'value <- b.value + b.bump() + rand() + ask()\nitems <- [[i], {"value": [i]}]\nresults <- results + [[value, items]]\ni <- i + 1'],
  ['show', 'output', 'b\n[b, alias]\nresults'],
  ['end', 'return', '[alias.value, alias.calls, b = alias]'],
  ['class', 'class', 'Box'], ['fields', 'input', 'value\ncalls'],
  ['bump', 'method', 'bump'], ['change', 'process', 'self.value <- self.value + 1'], ['result', 'return', 'self.value'],
  ['repr', 'method', '__repr__'], ['count', 'process', 'self.calls <- self.calls + 1'],
  ['repr-result', 'return', '"Box(" + self.value + ", " + self.calls + ")"'],
], [['main', 'init'], ['init', 'loop'], ['loop', 'body', 'true'], ['body', 'loop'], ['loop', 'show', 'false'], ['show', 'end'],
  ['class', 'fields'], ['class', 'bump'], ['bump', 'change'], ['change', 'result'], ['class', 'repr'], ['repr', 'count'], ['count', 'repr-result']])

const operators = program([
  ['main', 'function', 'main'], ['init', 'process', 'a <- NumberBox(2, 0)\nb <- NumberBox(3, 0)\ni <- 0\nvalues <- []'],
  ['loop', 'while', 'i < 3'], ['body', 'process', 'values <- values + [(a * b + a).value, a != b, -a]\ni <- i + 1'],
  ['show', 'output', 'a\nb\nvalues'], ['end', 'return', '[a.calls, b.calls, a.value]'],
  ['class', 'class', 'NumberBox(value, calls)'],
  ['mul', 'method', '__mul__'], ['mul-input', 'input', 'other'],
  ['mul-count', 'process', 'self.calls <- self.calls + 1'], ['mul-result', 'return', 'NumberBox(self.value * other.value, 0)'],
  ['add', 'method', '__add__'], ['add-input', 'input', 'other'],
  ['add-count', 'process', 'self.calls <- self.calls + 1'], ['add-result', 'return', 'NumberBox(self.value + other.value, 0)'],
  ['eq', 'method', '__eq__'], ['eq-input', 'input', 'other'], ['eq-result', 'return', 'self.value = other.value'],
  ['neg', 'method', '__neg__'], ['neg-count', 'process', 'self.calls <- self.calls + 1'], ['neg-result', 'return', '-self.value'],
  ['repr', 'method', '__repr__'], ['repr-count', 'process', 'self.calls <- self.calls + 1'], ['repr-result', 'return', '"value=" + self.value'],
], [['main', 'init'], ['init', 'loop'], ['loop', 'body', 'true'], ['body', 'loop'], ['loop', 'show', 'false'], ['show', 'end'],
  ['class', 'mul'], ['mul', 'mul-input'], ['mul-input', 'mul-count'], ['mul-count', 'mul-result'],
  ['class', 'add'], ['add', 'add-input'], ['add-input', 'add-count'], ['add-count', 'add-result'],
  ['class', 'eq'], ['eq', 'eq-input'], ['eq-input', 'eq-result'],
  ['class', 'neg'], ['neg', 'neg-count'], ['neg-count', 'neg-result'],
  ['class', 'repr'], ['repr', 'repr-count'], ['repr-count', 'repr-result']])

function small(source: typeof procedural, from: string, to: string) {
  const p = structuredClone(source)
  p.nodes = p.nodes.map(n => ({ ...n, text: n.text.replace(from, to) }))
  return p
}

const loading = program([
  ['main', 'function', 'main'], ['end', 'return', '[rand(), text_from_url("https://example.com"), rand(), imload(), rand(), ask()]'],
], [['main', 'end']])
const queued = program([
  ['main', 'function', 'main'], ['input', 'input', 'a\nb\nc'], ['end', 'return', '[a, b, c]'],
], [['main', 'input'], ['input', 'end']])
const numeric = program([
  ['main', 'function', 'main'], ['end', 'return', '[-0, (-1)^3, 2^3^2, -7 % 3, False and ask(), True or ask(), [1, {"x": [2]}]]'],
], [['main', 'end']])

export const cellLibrary = program([
  ['cell', 'class', 'Cell(value)'], ['bump', 'method', 'bump'],
  ['bump-body', 'process', 'self.value <- self.value + 1\nself.dynamic <- [self, {"self": self}]'], ['bump-return', 'return', 'self.value'],
], [['cell', 'bump'], ['bump', 'bump-body'], ['bump-body', 'bump-return']])

export const references = program([
  ['main', 'function', 'main'],
  ['init', 'process', 'a <- Cell(1)\nb <- Cell(2)\nalias <- a\nnested <- [{"objects": [a, b, a]}]\na.peer <- b\nb.peer <- a\na.self <- a'],
  ['change', 'process', 'returned <- touch(alias)\nvalue <- a.bump()\nnew <- Cell(5)\nb.extra <- new'],
  ['load', 'process', 'answers <- [a.value, a.bump(), rand(), ask(), text_from_url("https://example.com"), imload()]'],
  ['show', 'output', 'a\nnested'],
  ['end', 'return', '[a.value, alias.value, nested[0]["objects"][0] = a, b.peer = a, a.peer = b, a.self = a, returned = a]'],
  ['touch', 'function', 'touch'], ['input', 'input', 'item'],
  ['touch-body', 'process', 'item.value <- item.value + 10'], ['touch-return', 'return', 'item'],
], [['main', 'init'], ['init', 'change'], ['change', 'load'], ['load', 'show'], ['show', 'end'],
  ['touch', 'input'], ['input', 'touch-body'], ['touch-body', 'touch-return']])

export const indexedResumption = program([
  ['main', 'function', 'main'], ['init', 'process', 'a <- Cell(1)\nitems <- [0]'],
  ['assign', 'assignment', 'items[rand() * 0 + ask()] <- a.bump()'], ['end', 'return', '[items, a.value]'],
], [['main', 'init'], ['init', 'assign'], ['assign', 'end']])

export const scenarios = [
  { name: 'procedural', program: procedural, inputs: ['20'], options: {} },
  { name: 'recursive', program: small(recursive, 'fib(16)', 'fib(5)'), inputs: [], options: {} },
  { name: 'mutating', program: small(mutating, '3000', '8'), inputs: [], options: {} },
  { name: 'imported-ids', program: small(imported, '2000', '5'), inputs: [], options: { importedPrograms: [libraryA, libraryB] } },
  { name: 'effects-ask-repr', program: effects, inputs: [], options: {} },
  { name: 'operators', program: operators, inputs: [], options: {} },
  { name: 'async-loads', program: loading, inputs: [], options: { nativeLibraries: ['text', 'image'] } },
  { name: 'partial-input', program: queued, inputs: ['1'], options: {} },
  { name: 'numeric-literals', program: numeric, inputs: [], options: {} },
  { name: 'object-references', program: references, inputs: [], options: { importedPrograms: [cellLibrary], nativeLibraries: ['text', 'image'] } },
  { name: 'indexed-resumption', program: indexedResumption, inputs: [], options: { importedPrograms: [cellLibrary] } },
  { name: 'process-error', program: program([
    ['main', 'function', 'main'], ['end', 'process', 'x <- 1\n\nx <- 1 / 0'], ['return', 'return', 'x'],
  ], [['main', 'end'], ['end', 'return']]), inputs: [], options: {} },
  { name: 'output-error', program: program([
    ['main', 'function', 'main'], ['output', 'output', '1\n\n1 / 0'], ['end', 'return', '0'],
  ], [['main', 'output'], ['output', 'end']]), inputs: [], options: {} },
  { name: 'step-limit', program: procedural, inputs: ['20'], options: { maxSteps: 7 } },
  { name: 'validation-error', program: program([['main', 'function', 'main']], []), inputs: [], options: {} },
]
