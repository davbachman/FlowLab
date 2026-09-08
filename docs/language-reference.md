# Language reference

[Documentation home](../README.md) · [Getting started](getting-started.md) · [Classes and objects](classes-and-objects.md) · [Imports and native libraries](imports-and-libraries.md) · [Saving and loading](saving-and-loading.md)

## Contents

- [Data types and operations](#data-types-and-operations)
- [Expression rules](#expression-rules)
- [Assignment and Process syntax](#assignment-and-process-syntax)
- [Input, output, and return](#input-output-and-return)
- [Conditions and loops](#conditions-and-loops)
- [Define and call Functions](#define-and-call-functions)
- [Calls and built-ins](#calls-and-built-ins)
- [Names and dictionary keys](#names-and-dictionary-keys)

## Data types and operations

| Data type | Literals and values | Allowed operations |
| --- | --- | --- |
| Number | Integers and decimals, such as `3`, `-2`, `4.5` | Arithmetic `+`, `-`, `*`, `/`, `//`, `%`; unary `-`; comparisons `<`, `<=`, `>`, `>=`, `=`, `==`, `!=`; core numeric functions and the imported [math library](imports-and-libraries.md#math-library); truth tests where zero is false |
| String | Single- or double-quoted text, such as `"cat"` or `'hello'`; supports escapes like `\n`, `\t`, `\"`, `\'`, and `\\` | Concatenation with `+`; zero-based indexing like `S[0]`; equality and inequality with `=`, `==`, `!=`; truth tests where non-empty strings are true; For iteration over characters |
| Boolean | `True` and `False` | Logical `and`, `or`, `not`; equality and inequality; assignment, output, Return values, If conditions, and While conditions |
| List | Bracket literals, such as `[1, 2, 3]`, `["a", True]`, and nested lists | Concatenation with `+` when both operands are lists; zero-based indexing like `L[0]`; indexed assignment like `L[i] <- value`; deep equality and inequality; truth tests where non-empty lists are true; For iteration over elements |
| Dictionary | Brace literals with primitive keys, such as `{"name": "Ada"}`, `{1: "one", "1": "string"}`, and `{True: [2, 3]}` | Lookup like `D["name"]`; indexed assignment like `D[key] <- value` creates or overwrites keys; deep, order-independent equality and inequality; truth tests where non-empty dictionaries are true; For iteration over keys in insertion order |
| Object | Construct an instance from a Class declaration, such as `p <- Point(2, 3)` for `Point(x, y)` | Field access such as `p.x`; field assignment such as `p.x <- 10`; method calls such as `p.move(5, -1)`; always true in truth tests; identity equality by default; customizable output, comparisons, and arithmetic through special methods |
| Image | Returned by `imread(...)` or `image_from_pixels(...)` after importing `image` | Opaque, identity-based value with dimensions and RGBA pixels; use the [image library](imports-and-libraries.md#image-library) to inspect, change, display, or save it |
| Function result | Any single value returned by a Return block | Use returned values in expressions, assignments, output, branch conditions, loops, list elements, and other function-call arguments |

## Expression rules

- Parentheses control grouping.
- From highest to lowest, the main operator precedence is postfix calls/indexing/member access, unary `-`, `*`, `/`, `//`, and `%`, `+` and `-`, comparisons, `not`, `and`, then `or`.
- Logical `and` and `or` short-circuit and return a Boolean.
- `=` and `==` both test equality; assignment uses `<-`. Values of different primitive types are unequal, so `1 = True` and `1 = "1"` are both `False`. Ordering comparisons (`<`, `<=`, `>`, `>=`) require Numbers, unless an Object supplies a special method.
- False values are `False`, zero, and empty Strings, Lists, and Dictionaries. Objects and Images are always true; other nonempty values are true.
- `+` adds two Numbers, concatenates two Lists, and otherwise concatenates the basic String forms of its operands. Object operands follow the `__add__` rules in [Classes and objects](classes-and-objects.md); concatenation never calls `__repr__` implicitly.
- `a // b` returns the floor of `a / b`. `a % b` returns the remainder with the same sign as `b`, so `a = (a // b) * b + (a % b)`.
- String and List indexes are zero-based nonnegative integers. Dictionary lookup keys are Strings, Numbers, or Booleans.
- Reads can be chained, such as `matrix[0][1]` or `person.address.city`. Reading a missing Dictionary key or an out-of-range String or List index raises an error.

## Assignment and Process syntax

Assignment blocks contain one of these forms:

- `name <- expression`
- `name[indexOrKey] <- expression`
- `object.field <- expression`

Assignment creates a variable or replaces its current value; no separate declaration or type annotation is needed. Indexed assignment replaces an existing List item or creates or replaces a Dictionary entry. It cannot change String characters or extend a List beyond its current length; append with `items <- items + [newItem]` instead. Assignment targets support one index or one field, so update a nested collection through a temporary variable and assign it back to its parent.

Assigning a List or Dictionary to another variable does not make subsequent indexed changes affect both variables. Object references retain their shared identity; see [Classes and objects](classes-and-objects.md).

A Process block accepts multiple assignments and standalone calls, one per nonblank line. For example:

```text
total <- price * quantity
items[0] <- total
account.balance <- total
helper(total)
```

Each Process line follows the same grammar as an Assignment or Call block. Lines execute in order, and errors include the source line number. Process blocks cannot contain Input, Output, Return, If, While, or For statements; those remain separate visual blocks.

Step normally executes all the lines in a Process block together. A Function or Method call enters the called flowchart, and execution resumes with the remaining Process lines after the call returns. Interactive calls such as `ask()` can also pause a Process partway through. Completed lines stay completed if a later line fails. See [Use Process blocks](getting-started.md#use-process-blocks) to combine, split, or clean up blocks in the editor.

## Input, output, and return

- Input blocks contain only a variable name, such as `answer`, which receives the next value from the active input queue. An empty queue pauses execution at that Input block; add values and use Step, Auto Step, or Run to resume.
- The queue contains one value per nonblank line. Numbers, `True`/`False`, quoted Strings, Lists, and Dictionaries are parsed as values. Other text stays a String: `2 + 3` is text, while `[2 + 3]` is a List containing `5`. Use `""` to queue an empty String.
- Output blocks contain an expression, such as `"Total: " + total`, and append its value to the Console output. Strings display without surrounding quotes; Strings nested in Lists or Dictionaries retain quotes. Object formatting is described in [Classes and objects](classes-and-objects.md).
- Return evaluates an expression, ends the current Function or Method, and sends the value back to its caller.
- Return from `main` halts the program.

## Conditions and loops

- If and While blocks contain truth-tested expressions.
- While bodies must wire back to the While diamond to repeat.
- For blocks use `item in iterable`.
- A For block's `true` branch runs once for each String character, List item, or Dictionary key. Its `false` branch runs after exhaustion.
- For loop bodies must wire back to the For diamond.
- Dictionaries iterate keys in insertion order; use `D[item]` to read each value.
- A For loop evaluates its iterable once when entered and keeps that sequence for the loop. Reassigning the iterable variable or adding Dictionary keys inside the body does not change the remaining iterations. Entering the loop again after it finishes evaluates the iterable afresh.

## Define and call Functions

A Function block contains its name only, such as `double`, and its outgoing wire begins that Function's body. Exactly one Function named `main` is the program's entry point. Define additional Functions as separate flows on the same canvas, or [import them from another program](imports-and-libraries.md).

Arguments become the called Function's input queue, in order. For example, build `Function: double → Input: number → Return: number * 2`, then use `result <- double(6)` in an Assignment or Process block to set `result` to `12`. For two arguments, put two Input blocks at the start of the called flow. A call with no arguments uses `helper()`.

Each call has its own variables and queue, including recursive calls. It cannot read the caller's local variables directly; pass the values it needs as arguments. Return restores the caller's variables and queue and resumes the expression containing the call. Output from called Functions appears in the same Console. Functions can return any supported value, including a List, Dictionary, or Object.

## Calls and built-ins

- Call blocks contain one standalone Function or Method call, such as `helper(1)` or `p.move(2, 3)`. They run it for side effects and discard its return value.
- Standalone calls may also appear as individual lines in a Process block.
- Calls used inside other block expressions keep their return value.
- Custom Function calls use normal notation, such as `helper(1, "text", [2, 3])`.
- `sqrt(nonnegativeNumber)` returns the square root of a Number.
- `rand()` returns a Number from 0 up to but not including 1.
- `ask()` opens an input dialog and returns the parsed value using the same rules as queued input. It consumes no queued value, and submitting blank input returns an empty String.
- Exponential, logarithmic, and trigonometric functions are available after importing the [math library](imports-and-libraries.md#math-library).
- **FlowLab → Reference** lists the core functions and functions from currently imported native libraries, with signatures and descriptions. The built-in functions available without an import are `sqrt`, `rand`, and `ask`.

## Names and dictionary keys

- Names are case-sensitive, must start with a letter or underscore, and may contain letters, digits, and underscores.
- The language words `and`, `or`, `not`, `True`, and `False` cannot be used as names.
- The core names `sqrt`, `rand`, and `ask` cannot be redefined as Functions or Classes.
- Dictionary literal keys are String, Number, or Boolean literals. Those key types remain distinct, so `1`, `"1"`, and `True` may coexist.
- A later duplicate literal key replaces the earlier value.
- `D[key]` accepts an expression of one of the three primitive key types, and `D[key] <- value` creates or overwrites an entry.

---

[← Getting started](getting-started.md) · [Next: Classes and objects →](classes-and-objects.md)
