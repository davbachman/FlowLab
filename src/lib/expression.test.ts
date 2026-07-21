import { describe, expect, it } from 'vitest'
import {
  evaluateExpression,
  findExpressionCallNames,
  parseCallExpression,
  stringifyValue,
} from './expression'
import {
  isRuntimeObject,
  toBoolean,
  valuesEqual,
} from './runtimeValues'
import {
  parseAssignment,
  parseClassDeclaration,
  parseMethodDeclaration,
} from './statements'
import type { RuntimeDictionary, RuntimeObject } from './types'

function dictionary(entries: RuntimeDictionary['entries']): RuntimeDictionary {
  return { kind: 'dictionary', entries }
}

function object(className: string, id: number): RuntimeObject {
  return { kind: 'object', className, id }
}

describe('evaluateExpression', () => {
  it('uses arithmetic precedence and parentheses', () => {
    expect(evaluateExpression('2 + 3 * 4', {})).toBe(14)
    expect(evaluateExpression('(2 + 3) * 4', {})).toBe(20)
  })

  it('supports variables and subtraction', () => {
    expect(evaluateExpression('x + y - 1', { x: 14, y: 2 })).toBe(15)
  })

  it('supports sqrt and rand numeric functions', () => {
    expect(evaluateExpression('sqrt(9)', {})).toBe(3)

    const value = evaluateExpression('rand()', {})

    expect(typeof value).toBe('number')
    expect(value as number).toBeGreaterThanOrEqual(0)
    expect(value as number).toBeLessThan(1)
  })

  it('lets the runtime preserve rand values by expression site', () => {
    const visitedSites: number[] = []

    expect(
      evaluateExpression('rand()', {}, {
        random: (siteId) => {
          visitedSites.push(siteId)
          return 0.25
        },
      }),
    ).toBe(0.25)
    expect(visitedSites).toEqual([0])
  })

  it('supports string literals and concatenation', () => {
    expect(evaluateExpression('"Hello, " + name', { name: 'Ada' })).toBe(
      'Hello, Ada',
    )
  })

  it('supports list literals and zero-based list indexing', () => {
    expect(evaluateExpression('[1, 2, 3][2]', {})).toBe(3)
    expect(evaluateExpression('L[2] = 3', { L: [1, 2, 3] })).toBe(true)
    expect(evaluateExpression('L[0] + L[2]', { L: [1, 2, 3] })).toBe(4)
  })

  it('uses addition to concatenate lists', () => {
    expect(evaluateExpression('[1, 2] + [3, 4]', {})).toEqual([1, 2, 3, 4])
    expect(evaluateExpression('L + [4]', { L: [1, 2, 3] })).toEqual([
      1,
      2,
      3,
      4,
    ])
  })

  it('supports dictionary literals with primitive keys and nested values', () => {
    expect(
      evaluateExpression('{"name": "Ada", 1: "one", True: [2, {"x": 3}]}', {}),
    ).toEqual(
      dictionary([
        { key: 'name', value: 'Ada' },
        { key: 1, value: 'one' },
        {
          key: true,
          value: [2, dictionary([{ key: 'x', value: 3 }])],
        },
      ]),
    )
  })

  it('keeps type-distinct dictionary keys and lets later duplicate keys win', () => {
    expect(
      evaluateExpression('{1: "number", "1": "string", 1: "updated"}', {}),
    ).toEqual(
      dictionary([
        { key: 1, value: 'updated' },
        { key: '1', value: 'string' },
      ]),
    )
  })

  it('stringifies dictionary values in FlowLab syntax', () => {
    expect(
      stringifyValue(
        dictionary([
          { key: 'name', value: 'Ada' },
          { key: 1, value: 'one' },
          { key: true, value: [2, dictionary([{ key: 'x', value: 3 }])] },
        ]),
      ),
    ).toBe('{"name": "Ada", 1: "one", True: [2, {"x": 3}]}')
  })

  it('uses dictionary emptiness in truth tests', () => {
    expect(evaluateExpression('not {}', {})).toBe(true)
    expect(evaluateExpression('{"x": 0} and True', {})).toBe(true)
  })

  it('compares dictionaries deeply without depending on entry order', () => {
    expect(
      evaluateExpression('{"a": 1, 2: [True]} = {2: [True], "a": 1}', {}),
    ).toBe(true)
    expect(evaluateExpression('{"a": 1} = {"a": 2}', {})).toBe(false)
    expect(evaluateExpression('{1: "number"} = {"1": "number"}', {})).toBe(
      false,
    )
  })

  it('looks up dictionary values with type-distinct primitive keys', () => {
    const value = dictionary([
      { key: '1', value: 'string' },
      { key: 1, value: 'number' },
      { key: true, value: 'boolean' },
    ])

    expect(evaluateExpression('D["1"]', { D: value })).toBe('string')
    expect(evaluateExpression('D[1]', { D: value })).toBe('number')
    expect(evaluateExpression('D[True]', { D: value })).toBe('boolean')
  })

  it('reports missing and invalid dictionary keys clearly', () => {
    const value = dictionary([{ key: 'name', value: 'Ada' }])

    expect(() => evaluateExpression('D["missing"]', { D: value })).toThrow(
      /Dictionary key "missing" does not exist/,
    )
    expect(() => evaluateExpression('D[[1]]', { D: value })).toThrow(
      /Dictionary keys must be strings, numbers, or booleans/,
    )
  })

  it('rejects removed mod and exponentiation operators', () => {
    expect(() => evaluateExpression('10 mod 3', {})).toThrow(
      /Unexpected token "mod"/,
    )
    expect(() => evaluateExpression('2**3', {})).toThrow(
      /Unexpected token "\*"/,
    )
  })

  it('treats removed built-in names as ordinary unknown calls', () => {
    expect(() => evaluateExpression('abs(-4)', {})).toThrow(
      /Unknown function "abs"/,
    )
    expect(() => evaluateExpression('len(S)', { S: 'cat' })).toThrow(
      /Unknown function "len"/,
    )
  })

  it('passes multiple evaluated arguments to custom function calls', () => {
    const result = evaluateExpression(
      `helper([1, 2, 3], 'hello', n + 1)`,
      { n: 6 },
      {
        callFunction: (name, args) => {
          expect(name).toBe('helper')
          expect(args).toEqual([[1, 2, 3], 'hello', 7])
          return 15
        },
      },
    )

    expect(result).toBe(15)
  })

  it('reads object members through the evaluation context', () => {
    const point = object('Point', 1)

    expect(
      evaluateExpression('p.x + p.y', { p: point }, {
        getMember: (target, member) => {
          expect(target).toBe(point)
          return member === 'x' ? 4 : 7
        },
      }),
    ).toBe(11)
  })

  it('supports chained member access and member access on method results', () => {
    const wrapper = object('Wrapper', 1)
    const point = object('Point', 2)
    const getMember = (target: RuntimeObject, member: string) => {
      if (target.id === wrapper.id && member === 'point') {
        return point
      }

      if (target.id === point.id && member === 'x') {
        return 9
      }

      throw new Error('Unexpected member')
    }

    expect(
      evaluateExpression('wrapper.point.x', { wrapper }, { getMember }),
    ).toBe(9)
    expect(
      evaluateExpression('wrapper.getPoint().x', { wrapper }, {
        getMember,
        callMethod: (target, method, args) => {
          expect(target).toBe(wrapper)
          expect(method).toBe('getPoint')
          expect(args).toEqual([])
          return point
        },
      }),
    ).toBe(9)
  })

  it('calls object methods with an evaluated receiver and arguments', () => {
    const point = object('Point', 3)

    expect(
      evaluateExpression('p.move(dx + 1, -2)', { p: point, dx: 4 }, {
        callMethod: (target, method, args) => {
          expect(target).toBe(point)
          expect(method).toBe('move')
          expect(args).toEqual([5, -2])
          return target
        },
      }),
    ).toBe(point)
  })

  it('reports member access and method calls on non-objects clearly', () => {
    expect(() => evaluateExpression('n.x', { n: 1 })).toThrow(
      /Member access requires an object/,
    )
    expect(() => evaluateExpression('n.move()', { n: 1 })).toThrow(
      /Method call requires an object/,
    )
  })

  it('rejects language keywords in Class fields and Method names', () => {
    expect(() => parseClassDeclaration('and(value)')).toThrow(/non-reserved/i)
    expect(() => parseClassDeclaration('Point(or)')).toThrow(/valid name/i)
    expect(() => parseMethodDeclaration('Point.not')).toThrow(/non-reserved/i)
  })

  it('supports zero-based string indexing', () => {
    expect(evaluateExpression('S[1]', { S: 'cat' })).toBe('a')
    expect(evaluateExpression('S[2] = "t"', { S: 'cat' })).toBe(true)
  })

  it('supports numeric comparisons', () => {
    expect(evaluateExpression('x <= 10', { x: 10 })).toBe(true)
    expect(evaluateExpression('x != 10', { x: 10 })).toBe(false)
  })

  it('supports and, or, and not logical operators', () => {
    expect(evaluateExpression('x > 0 and y > 0', { x: 3, y: 4 })).toBe(true)
    expect(evaluateExpression('x > 0 and y > 0', { x: 3, y: 0 })).toBe(false)
    expect(evaluateExpression('x > 0 or y > 0', { x: 0, y: 4 })).toBe(true)
    expect(evaluateExpression('not x < 10', { x: 12 })).toBe(true)
  })

  it('supports True and False boolean constants', () => {
    expect(evaluateExpression('True', {})).toBe(true)
    expect(evaluateExpression('False', {})).toBe(false)
    expect(evaluateExpression('True and not False', {})).toBe(true)
  })

  it('gives and higher precedence than or', () => {
    expect(evaluateExpression('0 or 1 and 0', {})).toBe(false)
    expect(evaluateExpression('(0 or 1) and 0', {})).toBe(false)
    expect(evaluateExpression('1 or 0 and 0', {})).toBe(true)
  })

  it('throws clear runtime errors', () => {
    expect(() => evaluateExpression('missing + 1', {})).toThrow(
      /Undefined variable "missing"/,
    )
    expect(() => evaluateExpression('10 / 0', {})).toThrow(/Division by zero/)
    expect(() => evaluateExpression('L["x"]', { L: [1, 2, 3] })).toThrow(
      /Index must be a number/,
    )
    expect(() => evaluateExpression('L[3]', { L: [1, 2, 3] })).toThrow(
      /Index 3 is out of range/,
    )
    expect(() => evaluateExpression('sqrt(-1)', {})).toThrow(
      /sqrt requires a nonnegative number/,
    )
    expect(() => evaluateExpression('rand(1)', {})).toThrow(
      /rand requires no arguments/,
    )
  })
})

describe('object expression discovery', () => {
  it('accepts bare and method calls in Call nodes', () => {
    expect(parseCallExpression('helper(1)').name).toBe('helper')
    expect(parseCallExpression('p.move(1, 2)').name).toBe('move')
  })

  it('reports bare calls and constructors, but not method names', () => {
    expect(
      findExpressionCallNames('Point(helper()).move(other())'),
    ).toEqual(['Point', 'helper', 'other'])
  })
})

describe('class and method declarations', () => {
  it('parses classes with fields and zero-field classes', () => {
    expect(parseClassDeclaration(' Point ( x, y ) ')).toEqual({
      name: 'Point',
      fields: ['x', 'y'],
    })
    expect(parseClassDeclaration('Marker()')).toEqual({
      name: 'Marker',
      fields: [],
    })
  })

  it('requires valid, unique class fields', () => {
    expect(() => parseClassDeclaration('Point(x, 2y)')).toThrow(
      /field "2y" must be a valid name/,
    )
    expect(() => parseClassDeclaration('Point(x, x)')).toThrow(
      /duplicate field "x"/,
    )
    expect(() => parseClassDeclaration('Point')).toThrow(
      /Class must use the form/,
    )
  })

  it('parses qualified method declarations and rejects malformed ones', () => {
    expect(parseMethodDeclaration(' Point . move ')).toEqual({
      className: 'Point',
      methodName: 'move',
    })
    expect(() => parseMethodDeclaration('Point')).toThrow(
      /Method must use the form/,
    )
    expect(() => parseMethodDeclaration('Point.move.again')).toThrow(
      /Method must use the form/,
    )
  })
})

describe('member assignments', () => {
  it('parses object and self member targets', () => {
    expect(parseAssignment('p.x <- value + 1')).toEqual({
      target: { kind: 'member', variable: 'p', member: 'x' },
      expression: 'value + 1',
    })
    expect(parseAssignment('self.y <- 4')).toEqual({
      target: { kind: 'member', variable: 'self', member: 'y' },
      expression: '4',
    })
  })

  it('rejects chained member assignment targets clearly', () => {
    expect(() => parseAssignment('p.position.x <- 1')).toThrow(
      /single object member/,
    )
  })
})

describe('runtime object references', () => {
  it('uses stable identity for equality and always treats objects as true', () => {
    const point = object('Point', 1)
    const alias = object('Point', 1)
    const other = object('Point', 2)

    expect(valuesEqual(point, alias)).toBe(true)
    expect(valuesEqual(point, other)).toBe(false)
    expect(toBoolean(point)).toBe(true)
    expect(evaluateExpression('p = alias', { p: point, alias })).toBe(true)
  })

  it('guards and stringifies object references safely', () => {
    const point = object('Point', 17)

    expect(isRuntimeObject(point)).toBe(true)
    expect(isRuntimeObject(dictionary([]))).toBe(false)
    expect(stringifyValue(point)).toBe('Point #17')
    expect(stringifyValue([point])).toBe('[Point #17]')
  })
})
