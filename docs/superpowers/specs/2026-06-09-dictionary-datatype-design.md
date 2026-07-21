# Dictionary Datatype Design

## Goal

Add dictionaries as a first-class FlowLab runtime datatype so users can store values by primitive keys, read them in expressions, update them with indexed assignment, pass them through functions, inspect them in panels, and import/export programs that use them.

## Project Context

FlowLab is a Vite/React flowchart programming environment. The language surface is concentrated in these files:

- `src/lib/types.ts`: runtime value union and program types.
- `src/lib/expression.ts`: tokenizer, parser, evaluator, truthiness, stringification, and deep equality.
- `src/lib/statements.ts`: assignment and `For` statement parsing.
- `src/lib/interpreter.ts`: node execution, indexed assignment, `For` iteration, queued input parsing, and function-call input queues.
- `src/lib/validation.ts`: validates node text by parsing statements and expressions.
- `README.md`: user-facing datatype and syntax documentation.

Existing datatypes are numbers, strings, booleans, lists, and function results. Lists already support literals, indexing, indexed assignment, deep equality, truth tests, and `For` iteration.

## Syntax

Dictionaries use brace literals with comma-separated key/value entries:

```text
{}
{"name": "Ada"}
{"name": "Ada", 1: "one", True: [2, 3]}
```

Dictionary literal keys may be string, number, or boolean literals. Dictionary values may be any `RuntimeValue`, including nested lists and dictionaries. Arbitrary key expressions are allowed in indexing and indexed assignment, but not in literal key positions.

Dictionary indexing reuses the existing postfix syntax:

```text
D["name"]
D[1]
D[True]
```

Indexed assignment reuses the existing assignment target syntax:

```text
D["name"] <- "Grace"
D[1] <- "uno"
D[False] <- [0, 1]
```

## Runtime Model

Dictionaries should not be represented as plain JavaScript objects because primitive keys must remain type-distinct. These keys are different and may coexist:

```text
1
"1"
True
```

Represent dictionaries as ordered entries:

```ts
export type DictionaryKey = number | string | boolean
export interface RuntimeDictionary {
  kind: 'dictionary'
  entries: Array<{ key: DictionaryKey; value: RuntimeValue }>
}
export type RuntimeValue =
  | number
  | string
  | boolean
  | RuntimeValue[]
  | RuntimeDictionary
```

Insertion order is semantic for display and `For` iteration. Updating an existing key preserves that key's existing position. Assigning a missing key appends a new entry.

Duplicate keys in one dictionary literal follow assignment semantics: the last value wins and the key keeps the position from its first occurrence.

## Semantics

Dictionary lookup:

- `D[key]` evaluates `D`, then evaluates `key`.
- The target must be a dictionary when using a non-number primitive key.
- A dictionary key must be string, number, or boolean.
- A missing dictionary key raises a clear runtime error.
- Existing list/string indexing behavior remains unchanged.

Dictionary assignment:

- `D[key] <- value` evaluates the value expression first, consistent with current list indexed assignment.
- Then it evaluates the key expression.
- The target variable must exist and hold either a list or dictionary.
- For lists, existing numeric index behavior stays unchanged.
- For dictionaries, string, number, and boolean keys are accepted.
- Existing keys are overwritten.
- Missing keys are created and appended.

Truthiness:

- Empty dictionaries are false.
- Non-empty dictionaries are true.

Equality:

- `=` and `==` perform deep equality.
- Dictionaries are equal when they have the same keys and deeply equal values for each key.
- Entry order should not affect equality.
- Key type matters, so `1` and `"1"` are distinct.

Operations:

- `+` does not merge dictionaries.
- Numeric comparisons still require numbers.
- Lists may contain dictionaries, and dictionaries may contain lists or dictionaries.

For loops:

- `item in D` iterates dictionary keys in insertion order.
- The loop variable receives each primitive key.
- Users read values with `D[item]`.
- Existing string and list iteration behavior stays unchanged.

Queued input and ask:

- Queue lines and `ask()` answers that are dictionary literals should parse to dictionaries.
- Existing number, boolean, list, quoted-string, and raw-string input behavior stays unchanged.

Output and variable formatting:

- Dictionaries stringify in FlowLab syntax:

```text
{"name": "Ada", 1: "one", True: [2, 3]}
```

- String keys and string values are quoted.
- Number and boolean keys use existing literal spelling.

## Validation and Errors

Validation should accept dictionary syntax anywhere an expression is accepted: Assignment values, Output, If, While, Return, Call arguments, For iterable expressions, list elements, and dictionary values.

Validation should reject malformed dictionary literals with parser errors surfaced through existing invalid node text messages.

Runtime errors should be specific:

- Missing dictionary key, for example `Dictionary key "name" does not exist`.
- Invalid dictionary key type, for example `Dictionary keys must be strings, numbers, or booleans`.
- Indexed assignment to a non-list/non-dictionary variable, for example `Indexed assignment target "D" must be a list or dictionary`.

## Testing

Add tests before implementation for:

- Dictionary literals with string, number, and boolean keys.
- Lookup with type-distinct keys.
- Nested dictionaries and lists.
- Missing key errors.
- Invalid dictionary key errors.
- Deep equality independent of entry order.
- Truthiness in conditions.
- Indexed assignment that overwrites and creates dictionary keys.
- `For key in D` iteration over keys in insertion order.
- Queued input parsing for dictionary literals.
- Existing list, string, numeric, boolean, function-call, and import behavior still passing.

Run at least:

```bash
npm test -- src/lib/expression.test.ts src/lib/interpreter.test.ts src/lib/validation.test.ts
npm test
npm run build
```

## Out of Scope

This first pass will not add helper functions such as `keys(D)`, `values(D)`, `has(D, key)`, or key deletion. It will not add dictionary merge with `+`, multi-variable `For` loops, or object-style dot access.
