# Language reference

[Documentation home](../README.md) · [Getting started](getting-started.md) · [Classes and objects](classes-and-objects.md) · [Imports and native libraries](imports-and-libraries.md) · [Saving and loading](saving-and-loading.md)

## Contents

- [Data types and operations](#data-types-and-operations)
- [Expression rules](#expression-rules)
- [Assignment and Process syntax](#assignment-and-process-syntax)
- [Input, output, and return](#input-output-and-return)
- [Conditions and loops](#conditions-and-loops)
- [Calls and built-ins](#calls-and-built-ins)
- [Names and dictionary keys](#names-and-dictionary-keys)

## Data types and operations

| Data type | Literals and values | Allowed operations |
| --- | --- | --- |
| Number | Integers and decimals, such as `3`, `-2`, `4.5` | Arithmetic `+`, `-`, `*`, `/`; unary `-`; comparisons `<`, `<=`, `>`, `>=`, `=`, `==`, `!=`; built-ins `sqrt(number)` and `rand()`; truth tests where zero is false |
| String | Single- or double-quoted text, such as `"cat"` or `'hello'`; supports escapes like `\n`, `\t`, `\"`, `\'`, and `\\` | Concatenation with `+`; zero-based indexing like `S[0]`; equality and inequality with `=`, `==`, `!=`; truth tests where non-empty strings are true; For iteration over characters |
| Boolean | `True` and `False` | Logical `and`, `or`, `not`; equality and inequality; assignment, output, Return values, If conditions, and While conditions |
| List | Bracket literals, such as `[1, 2, 3]`, `["a", True]`, and nested lists | Concatenation with `+` when both operands are lists; zero-based indexing like `L[0]`; indexed assignment like `L[i] <- value`; deep equality and inequality; truth tests where non-empty lists are true; For iteration over elements |
| Dictionary | Brace literals with primitive keys, such as `{"name": "Ada"}`, `{1: "one", "1": "string"}`, and `{True: [2, 3]}` | Lookup like `D["name"]`; indexed assignment like `D[key] <- value` creates or overwrites keys; deep, order-independent equality and inequality; truth tests where non-empty dictionaries are true; For iteration over keys in insertion order |
| Object | Construct an instance from a Class declaration, such as `p <- Point(2, 3)` for `Point(x, y)` | Field access such as `p.x`; field assignment such as `p.x <- 10`; method calls such as `p.move(5, -1)`; always true in truth tests; identity equality by default; customizable output, comparisons, and arithmetic through special methods |
| Image | Returned by `imread(...)` or `image_from_pixels(...)` after importing `image` | Opaque, identity-based value with dimensions and RGBA pixels; use the [image library](imports-and-libraries.md#image-library) to inspect, change, display, or save it |
| Function result | Any single value returned by a Return block | Use returned values in expressions, assignments, output, branch conditions, loops, list elements, and other function-call arguments |

## Expression rules

- Parentheses control grouping.
- From highest to lowest, the main operator precedence is postfix calls/indexing/member access, unary `-`, `*` and `/`, `+` and `-`, comparisons, `not`, `and`, then `or`.
- Logical `and` and `or` short-circuit and return a Boolean.
- False values are `False`, zero, and empty Strings, Lists, and Dictionaries. Objects and Images are always true; other nonempty values are true.
- `+` adds two Numbers, concatenates two Lists, and otherwise concatenates the basic String forms of its operands. Object operands follow the `__add__` rules in [Classes and objects](classes-and-objects.md); concatenation never calls `__repr__` implicitly.
- String and List indexes are zero-based nonnegative integers. Dictionary lookup keys are Strings, Numbers, or Booleans.

## Assignment and Process syntax

Assignment blocks contain one of these forms:

- `name <- expression`
- `name[indexOrKey] <- expression`
- `object.field <- expression`

A Process block accepts multiple assignments and standalone calls, one per nonblank line. For example:

```text
total <- price * quantity
items[0] <- total
account.balance <- total
helper(total)
```

Each Process line follows the same grammar as an Assignment or Call block. Lines execute in order, and errors include the source line number. Process blocks cannot contain Input, Output, Return, If, While, or For statements; those remain separate visual blocks.

## Input, output, and return

- Input blocks name one variable that receives the next value from the active input queue.
- Output blocks evaluate and display an expression.
- Return evaluates an expression, ends the current Function or Method, and sends the value back to its caller.
- Return from `main` halts the program.

## Conditions and loops

- If and While blocks contain truth-tested expressions.
- While bodies must wire back to the While diamond to repeat.
- For blocks use `item in iterable`.
- A For block's `true` branch runs once for each String character, List item, or Dictionary key. Its `false` branch runs after exhaustion.
- For loop bodies must wire back to the For diamond.
- Dictionaries iterate keys in insertion order; use `D[item]` to read each value.

## Calls and built-ins

- Call blocks contain one standalone Function or Method call, such as `helper(1)` or `p.move(2, 3)`. They run it for side effects and discard its return value.
- Standalone calls may also appear as individual lines in a Process block.
- Calls used inside other block expressions keep their return value.
- Custom Function calls use normal notation, such as `helper(1, "text", [2, 3])`.
- `sqrt(nonnegativeNumber)` returns the square root of a Number.
- `rand()` returns a Number from 0 up to but not including 1.
- `ask()` opens an input dialog and returns the parsed value.

## Names and dictionary keys

- Names must start with a letter or underscore and may contain letters, digits, and underscores.
- The language words `and`, `or`, `not`, `True`, and `False` cannot be used as names.
- `sqrt`, `rand`, and `ask` cannot be redefined as Functions or Classes.
- Dictionary literal keys are String, Number, or Boolean literals. Those key types remain distinct, so `1`, `"1"`, and `True` may coexist.
- A later duplicate literal key replaces the earlier value.
- `D[key]` accepts an expression of one of the three primitive key types, and `D[key] <- value` creates or overwrites an entry.

---

[← Getting started](getting-started.md) · [Next: Classes and objects →](classes-and-objects.md)
