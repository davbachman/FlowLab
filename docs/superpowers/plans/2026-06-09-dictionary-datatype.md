# Dictionary Datatype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add FlowLab dictionaries with primitive keys, literal syntax, lookup, indexed assignment, `For` key iteration, deep equality, truthiness, queued input parsing, display formatting, validation, and documentation.

**Architecture:** Add an ordered-entry runtime dictionary model so `1`, `"1"`, and `True` remain distinct keys while preserving insertion order for display and `For` loops. Put shared runtime-value helpers in `src/lib/runtimeValues.ts`, then let `src/lib/expression.ts` own syntax/evaluation and `src/lib/interpreter.ts` own assignment, loop, and input-queue behavior.

**Tech Stack:** TypeScript, React/Vite, Vitest, existing FlowLab parser/interpreter modules.

---

## Current Workspace Note

`/Users/davidbachman/Documents/FlowLab` currently reports `fatal: not a git repository`. Skip commit steps while that remains true. At each checkpoint, run `git status --short`; if the project has been restored as a Git repository, commit the files listed for that task.

## File Structure

- Create `src/lib/runtimeValues.ts`: dictionary guards, dictionary key helpers, dictionary get/set, stringification, truthiness, and deep equality.
- Modify `src/lib/types.ts`: add `DictionaryKey`, `RuntimeDictionary`, and extend `RuntimeValue`.
- Modify `src/lib/expression.ts`: add dictionary tokens, AST node, parser methods, call-name traversal, evaluation, indexing, and re-export runtime value helpers.
- Modify `src/lib/expression.test.ts`: test dictionary literals, formatting, truthiness, equality, lookups, and errors.
- Modify `src/lib/interpreter.ts`: support dictionary indexed assignment, dictionary `For` iteration, and dictionary queued input parsing.
- Modify `src/lib/interpreter.test.ts`: test dictionary indexed assignment, `For` key iteration, and queued dictionary input.
- Modify `src/lib/validation.test.ts`: test validation acceptance and malformed dictionary rejection through existing validation.
- Modify `README.md`: document the new datatype and syntax.

---

### Task 1: Runtime Model and Dictionary Literal Evaluation

**Files:**
- Modify: `src/lib/types.ts:12-14`
- Create: `src/lib/runtimeValues.ts`
- Modify: `src/lib/expression.ts:1-740`
- Test: `src/lib/expression.test.ts`
- Test: `src/lib/validation.test.ts`

- [ ] **Step 1: Write failing expression tests for dictionary literals, stringification, truthiness, and equality**

Replace the expression import in `src/lib/expression.test.ts` with:

```ts
import { evaluateExpression, stringifyValue } from './expression'
```

Add this type import to `src/lib/expression.test.ts`:

```ts
import type { RuntimeDictionary } from './types'
```

Add this helper near the top of `src/lib/expression.test.ts`, after imports:

```ts
function dictionary(entries: RuntimeDictionary['entries']): RuntimeDictionary {
  return { kind: 'dictionary', entries }
}
```

Add these tests inside `describe('evaluateExpression', () => { ... })`:

```ts
  it('supports dictionary literals with primitive keys and nested values', () => {
    expect(
      evaluateExpression('{"name": "Ada", 1: "one", True: [2, {"x": 3}]}', {}),
    ).toEqual(
      dictionary([
        { key: 'name', value: 'Ada' },
        { key: 1, value: 'one' },
        {
          key: true,
          value: [
            2,
            dictionary([{ key: 'x', value: 3 }]),
          ],
        },
      ]),
    )
  })

  it('keeps type-distinct dictionary keys and lets later duplicate keys win', () => {
    expect(evaluateExpression('{1: "number", "1": "string", 1: "updated"}', {})).toEqual(
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
    expect(evaluateExpression('{"a": 1, 2: [True]} = {2: [True], "a": 1}', {})).toBe(
      true,
    )
    expect(evaluateExpression('{"a": 1} = {"a": 2}', {})).toBe(false)
    expect(evaluateExpression('{1: "number"} = {"1": "number"}', {})).toBe(false)
  })
```

- [ ] **Step 2: Write failing validation tests for dictionary expression syntax**

Add these tests inside `describe('validateProgram', () => { ... })` in `src/lib/validation.test.ts`:

```ts
  it('accepts dictionary literals in expressions', () => {
    const program = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'set-total'
          ? {
              ...node,
              text: 'D <- {"name": "Ada", 1: [True, {"nested": 3}]}',
            }
          : node,
      ),
    }

    expect(validateProgram(program).errors).toEqual([])
  })

  it('rejects malformed dictionary literals', () => {
    const program = {
      ...validLinearProgram,
      nodes: validLinearProgram.nodes.map((node) =>
        node.id === 'set-total'
          ? { ...node, text: 'D <- {"name" "Ada"}' }
          : node,
      ),
    }

    expect(validateProgram(program).errors.join('\n')).toMatch(
      /Assignment node "set-total" has invalid text/i,
    )
  })

  it('accepts dictionary indexed assignment targets and For iteration', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set-dictionary',
          type: 'assignment',
          text: 'D <- {"name": "Ada"}',
          position: { x: 0, y: 100 },
        },
        {
          id: 'update',
          type: 'assignment',
          text: 'D["name"] <- "Grace"',
          position: { x: 0, y: 200 },
        },
        {
          id: 'for',
          type: 'for',
          text: 'key in D',
          position: { x: 0, y: 300 },
        },
        {
          id: 'show',
          type: 'output',
          text: 'D[key]',
          position: { x: -120, y: 400 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 500 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'set-dictionary' },
        { id: 'e2', source: 'set-dictionary', target: 'update' },
        { id: 'e3', source: 'update', target: 'for' },
        { id: 'e4', source: 'for', target: 'show', label: 'true' },
        { id: 'e5', source: 'show', target: 'for' },
        { id: 'e6', source: 'for', target: 'end', label: 'false' },
      ],
    }

    expect(validateProgram(program).errors).toEqual([])
  })
```

- [ ] **Step 3: Run tests to verify they fail for missing dictionary support**

Run:

```bash
npm test -- src/lib/expression.test.ts src/lib/validation.test.ts
```

Expected: FAIL. Representative failures should include `Unexpected character "{"`, missing `RuntimeDictionary`, or TypeScript errors showing the dictionary type/helper does not exist yet.

- [ ] **Step 4: Extend runtime types**

Replace lines 12-14 in `src/lib/types.ts` with these definitions:

```ts
export type BranchLabel = 'true' | 'false'
export type DictionaryKey = number | string | boolean

export interface RuntimeDictionary {
  kind: 'dictionary'
  entries: Array<{ key: DictionaryKey; value: RuntimeValue }>
}

export type RuntimeValue = number | string | boolean | RuntimeValue[] | RuntimeDictionary
export type Environment = Record<string, RuntimeValue>
```

- [ ] **Step 5: Add shared runtime value helpers**

Create `src/lib/runtimeValues.ts`:

```ts
import type { DictionaryKey, RuntimeDictionary, RuntimeValue } from './types'

export function isRuntimeDictionary(
  value: RuntimeValue,
): value is RuntimeDictionary {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    value.kind === 'dictionary'
  )
}

export function isDictionaryKey(value: RuntimeValue): value is DictionaryKey {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

export function dictionaryKeysEqual(
  left: DictionaryKey,
  right: DictionaryKey,
): boolean {
  return typeof left === typeof right && left === right
}

export function findDictionaryEntryIndex(
  dictionary: RuntimeDictionary,
  key: DictionaryKey,
): number {
  return dictionary.entries.findIndex((entry) =>
    dictionaryKeysEqual(entry.key, key),
  )
}

export function getDictionaryValue(
  dictionary: RuntimeDictionary,
  key: DictionaryKey,
): RuntimeValue {
  const index = findDictionaryEntryIndex(dictionary, key)

  if (index === -1) {
    throw new Error(`Dictionary key ${stringifyDictionaryKey(key)} does not exist`)
  }

  return dictionary.entries[index].value
}

export function setDictionaryValue(
  dictionary: RuntimeDictionary,
  key: DictionaryKey,
  value: RuntimeValue,
): RuntimeDictionary {
  const index = findDictionaryEntryIndex(dictionary, key)

  if (index === -1) {
    return {
      kind: 'dictionary',
      entries: [...dictionary.entries, { key, value }],
    }
  }

  return {
    kind: 'dictionary',
    entries: dictionary.entries.map((entry, entryIndex) =>
      entryIndex === index ? { key: entry.key, value } : entry,
    ),
  }
}

export function toBoolean(value: RuntimeValue): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length > 0
  }

  return value.entries.length > 0
}

export function stringifyValue(value: RuntimeValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(stringifyNestedValue).join(', ')}]`
  }

  if (isRuntimeDictionary(value)) {
    return `{${value.entries
      .map(
        (entry) =>
          `${stringifyDictionaryKey(entry.key)}: ${stringifyNestedValue(entry.value)}`,
      )
      .join(', ')}}`
  }

  if (typeof value === 'boolean') {
    return value ? 'True' : 'False'
  }

  return String(value)
}

export function valuesEqual(left: RuntimeValue, right: RuntimeValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false
    }

    return (
      left.length === right.length &&
      left.every((leftItem, index) => valuesEqual(leftItem, right[index]))
    )
  }

  if (isRuntimeDictionary(left) || isRuntimeDictionary(right)) {
    if (!isRuntimeDictionary(left) || !isRuntimeDictionary(right)) {
      return false
    }

    return (
      left.entries.length === right.entries.length &&
      left.entries.every((leftEntry) => {
        const rightIndex = findDictionaryEntryIndex(right, leftEntry.key)
        return (
          rightIndex !== -1 &&
          valuesEqual(leftEntry.value, right.entries[rightIndex].value)
        )
      })
    )
  }

  return left === right
}

function stringifyNestedValue(value: RuntimeValue): string {
  if (typeof value === 'string') {
    return `"${value}"`
  }

  return stringifyValue(value)
}

function stringifyDictionaryKey(key: DictionaryKey): string {
  if (typeof key === 'string') {
    return `"${key}"`
  }

  if (typeof key === 'boolean') {
    return key ? 'True' : 'False'
  }

  return String(key)
}
```

- [ ] **Step 6: Update expression imports, token types, and AST types**

In `src/lib/expression.ts`, replace the first import and local helper exports with:

```ts
import {
  getDictionaryValue,
  isDictionaryKey,
  isRuntimeDictionary,
  setDictionaryValue,
  stringifyValue,
  toBoolean,
  valuesEqual,
} from './runtimeValues'
import type { DictionaryKey, Environment, RuntimeDictionary, RuntimeValue } from './types'

export { stringifyValue, toBoolean } from './runtimeValues'
```

Replace the `TokenType` union with:

```ts
type TokenType =
  | 'number'
  | 'string'
  | 'identifier'
  | 'operator'
  | 'leftParen'
  | 'rightParen'
  | 'leftBracket'
  | 'rightBracket'
  | 'leftBrace'
  | 'rightBrace'
  | 'colon'
  | 'comma'
  | 'eof'
```

Replace the `Expression` union with:

```ts
type Expression =
  | { kind: 'literal'; value: RuntimeValue }
  | { kind: 'variable'; name: string }
  | { kind: 'list'; items: Expression[] }
  | {
      kind: 'dictionary'
      entries: Array<{ key: DictionaryKey; value: Expression }>
    }
  | { kind: 'index'; target: Expression; index: Expression }
  | { kind: 'call'; name: string; arguments: Expression[] }
  | { kind: 'unary'; operator: '-' | 'not'; right: Expression }
  | { kind: 'binary'; operator: string; left: Expression; right: Expression }
```

Delete the old local `toBoolean`, `stringifyValue`, `stringifyListItem`, and `valuesEqual` functions from `src/lib/expression.ts`; the file will now use the imported versions.

- [ ] **Step 7: Add dictionary tokenization**

In `tokenize`, after the existing `]` branch and before the comma branch, add:

```ts
    if (char === '{') {
      tokens.push({ type: 'leftBrace', value: char })
      index += 1
      continue
    }

    if (char === '}') {
      tokens.push({ type: 'rightBrace', value: char })
      index += 1
      continue
    }

    if (char === ':') {
      tokens.push({ type: 'colon', value: char })
      index += 1
      continue
    }
```

- [ ] **Step 8: Add dictionary parsing**

In `Parser.primary`, after the list literal branch, add:

```ts
    if (token.type === 'leftBrace') {
      return { kind: 'dictionary', entries: this.dictionaryEntries() }
    }
```

Add these methods to the `Parser` class after `listItems()`:

```ts
  private dictionaryEntries(): Array<{ key: DictionaryKey; value: Expression }> {
    const entries: Array<{ key: DictionaryKey; value: Expression }> = []

    if (this.peek().type === 'rightBrace') {
      this.advance()
      return entries
    }

    while (true) {
      const key = this.dictionaryKey()
      this.consume('colon', 'Expected ":"')
      const value = this.or()
      entries.push({ key, value })

      if (this.peek().type !== 'comma') {
        break
      }

      this.advance()
    }

    this.consume('rightBrace', 'Expected "}"')
    return entries
  }

  private dictionaryKey(): DictionaryKey {
    const token = this.advance()

    if (token.type === 'string') {
      return token.value
    }

    if (token.type === 'number') {
      return Number(token.value)
    }

    if (token.type === 'operator' && token.value === '-') {
      const number = this.consume('number', 'Expected dictionary key')
      return -Number(number.value)
    }

    if (token.type === 'identifier') {
      if (token.value === 'True') {
        return true
      }

      if (token.value === 'False') {
        return false
      }
    }

    throw new Error('Dictionary keys must be strings, numbers, or booleans')
  }
```

- [ ] **Step 9: Add dictionary traversal and evaluation**

In `collectCallNames`, add this case after the `list` case:

```ts
    case 'dictionary':
      for (const entry of expression.entries) {
        collectCallNames(entry.value, names)
      }
      return
```

In `evaluate`, add this case after the `list` case:

```ts
    case 'dictionary':
      return expression.entries.reduce<RuntimeDictionary>(
        (dictionary, entry) =>
          setDictionaryValue(
            dictionary,
            entry.key,
            evaluate(entry.value, environment, context),
          ),
        { kind: 'dictionary', entries: [] },
      )
```

- [ ] **Step 10: Run tests to verify Task 1 passes**

Run:

```bash
npm test -- src/lib/expression.test.ts src/lib/validation.test.ts
```

Expected: PASS for the newly added literal, stringification, truthiness, equality, and validation tests. Lookup-specific tests are not added yet.

- [ ] **Step 11: Checkpoint Task 1**

Run:

```bash
git status --short
```

Expected in the current workspace: `fatal: not a git repository`. If Git is available, commit:

```bash
git add src/lib/types.ts src/lib/runtimeValues.ts src/lib/expression.ts src/lib/expression.test.ts src/lib/validation.test.ts
git commit -m "feat: add dictionary literal runtime support"
```

---

### Task 2: Dictionary Lookup and Key Errors

**Files:**
- Modify: `src/lib/expression.ts:599-624`
- Test: `src/lib/expression.test.ts`

- [ ] **Step 1: Write failing tests for dictionary indexing**

Add these tests inside `describe('evaluateExpression', () => { ... })` in `src/lib/expression.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify lookup fails**

Run:

```bash
npm test -- src/lib/expression.test.ts
```

Expected: FAIL with `Indexing requires a list or string` or `Index must be a number` for dictionary lookups.

- [ ] **Step 3: Implement dictionary lookup**

Replace `evaluateIndex` in `src/lib/expression.ts` with:

```ts
function evaluateIndex(
  expression: Extract<Expression, { kind: 'index' }>,
  environment: Environment,
  context: ExpressionEvaluationContext,
): RuntimeValue {
  const target = evaluate(expression.target, environment, context)
  const indexValue = evaluate(expression.index, environment, context)

  if (typeof target === 'string') {
    const index = requireIndex(indexValue)
    if (index >= target.length) {
      throw new Error(`Index ${index} is out of range`)
    }

    return target[index]
  }

  if (Array.isArray(target)) {
    const index = requireIndex(indexValue)
    if (index >= target.length) {
      throw new Error(`Index ${index} is out of range`)
    }

    return target[index]
  }

  if (isRuntimeDictionary(target)) {
    if (!isDictionaryKey(indexValue)) {
      throw new Error('Dictionary keys must be strings, numbers, or booleans')
    }

    return getDictionaryValue(target, indexValue)
  }

  throw new Error('Indexing requires a list, string, or dictionary')
}
```

- [ ] **Step 4: Run tests to verify lookup passes**

Run:

```bash
npm test -- src/lib/expression.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint Task 2**

Run:

```bash
git status --short
```

Expected in the current workspace: `fatal: not a git repository`. If Git is available, commit:

```bash
git add src/lib/expression.ts src/lib/expression.test.ts
git commit -m "feat: support dictionary lookup"
```

---

### Task 3: Indexed Assignment, For Iteration, and Queued Input

**Files:**
- Modify: `src/lib/interpreter.ts:44-60`
- Modify: `src/lib/interpreter.ts:520-545`
- Modify: `src/lib/interpreter.ts:1030-1124`
- Modify: `src/lib/interpreter.ts:1225-1258`
- Test: `src/lib/interpreter.test.ts`

- [ ] **Step 1: Update interpreter test imports**

Replace the existing type import from `./types` in `src/lib/interpreter.test.ts` with:

```ts
import type { Program, RuntimeDictionary } from './types'
```

Add this helper near the top of `src/lib/interpreter.test.ts`, after imports:

```ts
function dictionary(entries: RuntimeDictionary['entries']): RuntimeDictionary {
  return { kind: 'dictionary', entries }
}
```

- [ ] **Step 2: Write failing test for dictionary indexed assignment**

Add this test inside `describe('interpreter', () => { ... })`:

```ts
  it('creates and overwrites dictionary keys through indexed assignment targets', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set-dictionary',
          type: 'assignment',
          text: 'D <- {"count": 1}',
          position: { x: 0, y: 100 },
        },
        {
          id: 'overwrite',
          type: 'assignment',
          text: 'D["count"] <- D["count"] + 1',
          position: { x: 0, y: 200 },
        },
        {
          id: 'create',
          type: 'assignment',
          text: 'D[True] <- "yes"',
          position: { x: 0, y: 300 },
        },
        {
          id: 'output',
          type: 'output',
          text: 'D["count"] + ":" + D[True]',
          position: { x: 0, y: 400 },
        },
        { id: 'end', type: 'return', text: 'D', position: { x: 0, y: 500 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'set-dictionary' },
        { id: 'e2', source: 'set-dictionary', target: 'overwrite' },
        { id: 'e3', source: 'overwrite', target: 'create' },
        { id: 'e4', source: 'create', target: 'output' },
        { id: 'e5', source: 'output', target: 'end' },
      ],
    }

    const finalState = runExecution(createExecution(program, []))

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.D).toEqual(
      dictionary([
        { key: 'count', value: 2 },
        { key: true, value: 'yes' },
      ]),
    )
    expect(finalState.output).toEqual(['2:yes'])
    expect(finalState.returnValue).toEqual(finalState.environment.D)
  })
```

- [ ] **Step 3: Write failing test for dictionary For iteration**

Add this test inside `describe('interpreter', () => { ... })`:

```ts
  it('iterates over dictionary keys with For nodes in insertion order', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        {
          id: 'set-dictionary',
          type: 'assignment',
          text: 'D <- {"b": 2, "a": 3, 1: 4}',
          position: { x: 0, y: 100 },
        },
        {
          id: 'init-result',
          type: 'assignment',
          text: 'result <- ""',
          position: { x: 0, y: 200 },
        },
        {
          id: 'for',
          type: 'for',
          text: 'key in D',
          position: { x: 0, y: 300 },
        },
        {
          id: 'append',
          type: 'assignment',
          text: 'result <- result + key + ":" + D[key] + ";"',
          position: { x: -120, y: 400 },
        },
        {
          id: 'output',
          type: 'output',
          text: 'result',
          position: { x: 0, y: 500 },
        },
        { id: 'end', type: 'return', text: '0', position: { x: 0, y: 600 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'set-dictionary' },
        { id: 'e2', source: 'set-dictionary', target: 'init-result' },
        { id: 'e3', source: 'init-result', target: 'for' },
        { id: 'e4', source: 'for', target: 'append', label: 'true' },
        { id: 'e5', source: 'append', target: 'for' },
        { id: 'e6', source: 'for', target: 'output', label: 'false' },
        { id: 'e7', source: 'output', target: 'end' },
      ],
    }

    const finalState = runExecution(createExecution(program, []))

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.key).toBe(1)
    expect(finalState.environment.result).toBe('b:2;a:3;1:4;')
    expect(finalState.output).toEqual(['b:2;a:3;1:4;'])
  })
```

- [ ] **Step 4: Write failing test for queued dictionary input**

Add this test inside `describe('interpreter', () => { ... })`:

```ts
  it('parses queued dictionary input and supports indexed output', () => {
    const program: Program = {
      version: 1,
      nodes: [
        { id: 'main', type: 'function', text: 'main', position: { x: 0, y: 0 } },
        { id: 'input', type: 'input', text: 'D', position: { x: 0, y: 100 } },
        {
          id: 'show',
          type: 'output',
          text: 'D["x"] + D[True]',
          position: { x: 0, y: 200 },
        },
        { id: 'end', type: 'return', text: 'D', position: { x: 0, y: 300 } },
      ],
      edges: [
        { id: 'e1', source: 'main', target: 'input' },
        { id: 'e2', source: 'input', target: 'show' },
        { id: 'e3', source: 'show', target: 'end' },
      ],
    }

    const finalState = runExecution(
      createExecution(program, ['{"x": 5, True: 7}']),
    )

    expect(finalState.status).toBe('halted')
    expect(finalState.environment.D).toEqual(
      dictionary([
        { key: 'x', value: 5 },
        { key: true, value: 7 },
      ]),
    )
    expect(finalState.output).toEqual(['12'])
  })
```

- [ ] **Step 5: Run tests to verify interpreter support fails**

Run:

```bash
npm test -- src/lib/interpreter.test.ts
```

Expected: FAIL. Representative failures should include `Indexed assignment target "D" must be a list`, `For loop iterable must be a string or list`, or queued input remaining a raw string.

- [ ] **Step 6: Update interpreter imports and result type name**

In `src/lib/interpreter.ts`, add this import after the existing expression import:

```ts
import {
  isDictionaryKey,
  isRuntimeDictionary,
  setDictionaryValue,
} from './runtimeValues'
```

Rename `AssignListElementResult` to `AssignIndexedElementResult`:

```ts
type AssignIndexedElementResult =
  | {
      status: 'complete'
      environment: Environment
      output: string[]
      turtle?: TurtleState
    }
  | {
      status: 'suspended'
      pendingNode: Extract<PendingNode, { kind: 'assignment' }>
      call: FunctionCallRequest
      turtle?: TurtleState
    }
  | {
      status: 'asking'
      pendingNode: Extract<PendingNode, { kind: 'assignment' }>
      ask: AskCallRequest
      turtle?: TurtleState
    }
```

- [ ] **Step 7: Route indexed assignments through a dictionary-aware helper**

In `executeAssignmentNode`, replace:

```ts
    const assignmentResult = assignListElement(
```

with:

```ts
    const assignmentResult = assignIndexedElement(
```

Replace the `assignListElement` function with:

```ts
function assignIndexedElement(
  state: ExecutionState,
  environment: Environment,
  target: Extract<AssignmentTarget, { kind: 'index' }>,
  value: RuntimeValue,
  pendingNode: Extract<PendingNode, { kind: 'assignment' }>,
  indexExpression: ExpressionProgress,
): AssignIndexedElementResult {
  const { variable } = target

  if (!Object.prototype.hasOwnProperty.call(environment, variable)) {
    throw new Error(`Undefined variable "${variable}"`)
  }

  const currentValue = environment[variable]

  if (!Array.isArray(currentValue) && !isRuntimeDictionary(currentValue)) {
    throw new Error(`Indexed assignment target "${variable}" must be a list or dictionary`)
  }

  const indexResult = evaluateProgramExpression(
    state,
    indexExpression,
    environment,
  )

  if (indexResult.status === 'suspended') {
    return {
      status: 'suspended',
      pendingNode,
      call: indexResult.call,
      turtle: indexResult.turtle,
    }
  }

  if (indexResult.status === 'asking') {
    return {
      status: 'asking',
      pendingNode,
      ask: indexResult.ask,
      turtle: indexResult.turtle,
    }
  }

  const { value: indexValue, output } = indexResult

  if (Array.isArray(currentValue)) {
    const index = requireListIndex(indexValue)

    if (index >= currentValue.length) {
      throw new Error(`Index ${index} is out of range`)
    }

    const nextValue = [...currentValue]
    nextValue[index] = value

    return {
      status: 'complete',
      environment: {
        ...environment,
        [variable]: nextValue,
      },
      output,
      turtle: indexResult.turtle,
    }
  }

  if (!isDictionaryKey(indexValue)) {
    throw new Error('Dictionary keys must be strings, numbers, or booleans')
  }

  return {
    status: 'complete',
    environment: {
      ...environment,
      [variable]: setDictionaryValue(currentValue, indexValue, value),
    },
    output,
    turtle: indexResult.turtle,
  }
}
```

- [ ] **Step 8: Support dictionary `For` iteration**

In `createForLoopFrame`, add this branch after the list branch:

```ts
  if (isRuntimeDictionary(iterable)) {
    return {
      variable: forLoop.variable,
      values: iterable.entries.map((entry) => entry.key),
      index: 0,
    }
  }
```

Replace the final error with:

```ts
  throw new Error('For loop iterable must be a string, list, or dictionary')
```

- [ ] **Step 9: Support queued dictionary input**

In `parseInputValue`, replace the bracketed-list block:

```ts
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const evaluated = evaluateExpression(trimmed, {})
    return Array.isArray(evaluated) ? evaluated : rawValue
  }
```

with:

```ts
  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    const evaluated = evaluateExpression(trimmed, {})
    return Array.isArray(evaluated) || isRuntimeDictionary(evaluated)
      ? evaluated
      : rawValue
  }
```

- [ ] **Step 10: Run interpreter tests to verify Task 3 passes**

Run:

```bash
npm test -- src/lib/interpreter.test.ts
```

Expected: PASS.

- [ ] **Step 11: Checkpoint Task 3**

Run:

```bash
git status --short
```

Expected in the current workspace: `fatal: not a git repository`. If Git is available, commit:

```bash
git add src/lib/interpreter.ts src/lib/interpreter.test.ts
git commit -m "feat: support dictionary assignment and iteration"
```

---

### Task 4: Documentation and Validation Verification

**Files:**
- Modify: `README.md`
- Test: `src/lib/validation.test.ts`

- [ ] **Step 1: Run validation tests before editing docs**

Run:

```bash
npm test -- src/lib/validation.test.ts
```

Expected: PASS if Tasks 1-3 are complete. If it fails, fix the parser or validation expression-source handling before editing docs.

- [ ] **Step 2: Update README datatype table**

In `README.md`, add this row after the List row in the "Data types and operations" table:

```md
| Dictionary | Brace literals with primitive keys, such as `{"name": "Ada"}`, `{1: "one", "1": "string"}`, and `{True: [2, 3]}` | Lookup like `D["name"]`; indexed assignment like `D[key] <- value` creates or overwrites keys; deep equality and inequality; truth tests where non-empty dictionaries are true; For iteration over keys |
```

- [ ] **Step 3: Update README syntax bullets**

In `README.md`, replace:

```md
- Assignment blocks use `name <- expression` or `name[index] <- expression`.
```

with:

```md
- Assignment blocks use `name <- expression` or `name[indexOrKey] <- expression`.
```

After the list/function-call bullet section, add:

```md
- Dictionary keys may be strings, numbers, or booleans. `D[key]` reads a value, and `D[key] <- value` creates or overwrites a key.
- For blocks over dictionaries iterate keys, so `item in D` assigns each key to `item`; use `D[item]` to read the value.
```

- [ ] **Step 4: Run docs-adjacent tests**

Run:

```bash
npm test -- src/lib/validation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint Task 4**

Run:

```bash
git status --short
```

Expected in the current workspace: `fatal: not a git repository`. If Git is available, commit:

```bash
git add README.md src/lib/validation.test.ts
git commit -m "docs: document dictionary datatype"
```

---

### Task 5: Full Verification and Cleanup

**Files:**
- Modify only files needed to fix failures from verification.

- [ ] **Step 1: Run focused datatype tests**

Run:

```bash
npm test -- src/lib/expression.test.ts src/lib/interpreter.test.ts src/lib/validation.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the complete test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS with TypeScript and Vite build success.

- [ ] **Step 4: Fix any formatting or lint issues surfaced by TypeScript**

If `npm run build` or tests report TypeScript errors, make the smallest correction in the affected file and rerun:

```bash
npm test -- src/lib/expression.test.ts src/lib/interpreter.test.ts src/lib/validation.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Final checkpoint**

Run:

```bash
git status --short
```

Expected in the current workspace: `fatal: not a git repository`. If Git is available, commit any verification cleanup:

```bash
git add README.md src/lib/types.ts src/lib/runtimeValues.ts src/lib/expression.ts src/lib/expression.test.ts src/lib/interpreter.ts src/lib/interpreter.test.ts src/lib/validation.test.ts
git commit -m "feat: add dictionary datatype"
```
