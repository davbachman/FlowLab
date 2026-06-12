# FlowLab

[Open the app](https://davbachman.github.io/FlowLab/)

Created by David Bachman with GPT 5.5. To learn more about David see https://pzacad.pitzer.edu/~dbachman/, and subscribe to his AI podcast *Entropy Bonus* at https://profbachman.substack.com/.

## Brief description

FlowLab is a browser-based flowchart programming environment for building, validating, stepping through, and running visual programs with functions, loops, input queues, and output.

## Features

- Flowchart blocks for Function, Return, Assignment, Input, Output, If, While, and For.
- Editable Function names. Execution starts at the `main` Function.
- Multiple disjoint function flowcharts on the same canvas.
- Function calls inside block expressions, such as `x <- helper(5)`.
- Function calls pass their arguments as the called function's local input queue.
- Interactive input with `ask()`, such as `x <- ask()`.
- Native text loading and word splitting with the `text` import.
- Random numbers with `rand()`, which returns a number from 0 up to but not including 1.
- Step-through execution enters called function flowcharts and shows the active function input queue.
- Imports panel for listing FlowLab JSON files and calling non-`main` functions from those files.
- Import conflict handling: functions in the current canvas override imported functions with the same name.
- Validation for graph shape, function names, call targets, branch labels, function body ownership, and malformed block text.
- Input queue editor for queued runtime input.
- Variables and output panels for inspecting execution state.
- Current-node highlighting while stepping.
- Canvas editing with window selection, selected-block dragging, copy, paste, undo, delete, clear, pan, zoom, and fit view.
- JSON import and export for FlowLab programs.

## Data types and operations

| Data type | Literals and values | Allowed operations |
| --- | --- | --- |
| Number | Integers and decimals, such as `3`, `-2`, `4.5` | Arithmetic `+`, `-`, `*`, `/`; unary `-`; comparisons `<`, `<=`, `>`, `>=`, `=`, `==`, `!=`; built-ins `sqrt(number)` and `rand()` |
| String | Single- or double-quoted text, such as `"cat"` or `'hello'`; supports escapes like `\n`, `\t`, `\"`, `\'`, and `\\` | Concatenation with `+`; indexing like `S[0]`; equality and inequality with `=`, `==`, `!=`; truth tests where non-empty strings are true; For iteration over characters |
| Boolean | `True` and `False` | Logical `and`, `or`, `not`; equality and inequality; assignment, output, Return values, If conditions, and While conditions |
| List | Bracket literals, such as `[1, 2, 3]`, `["a", True]`, and nested lists | Concatenation with `+` when both operands are lists; indexing like `L[0]`; indexed assignment like `L[i] <- value`; deep equality and inequality; truth tests where non-empty lists are true; For iteration over elements |
| Dictionary | Brace literals with primitive keys, such as `{"name": "Ada"}`, `{1: "one", "1": "string"}`, and `{True: [2, 3]}` | Lookup like `D["name"]`; indexed assignment like `D[key] <- value` creates or overwrites keys; deep equality and inequality; truth tests where non-empty dictionaries are true; For iteration over keys |
| Function result | Any single value returned by a Return block | Use returned values in expressions, assignments, output, branch conditions, loops, list elements, and other function call arguments |

## Expression and statement syntax

- Assignment blocks use `name <- expression` or `name[indexOrKey] <- expression`.
- Input blocks name one variable that receives the next queued value.
- Output, If, While, and Return blocks contain expressions.
- For blocks use `item in iterable`, where the iterable is a string, list, or dictionary.
- Variable and function names must start with a letter or underscore and may contain letters, digits, and underscores.
- Built-in function calls are `sqrt(x)`, `rand()`, and `ask()`.
- Interactive input uses `ask()` inside expressions. It prompts for one value and parses the response like input queue values.
- Import `text` to use `text_from_url(url)`, which loads a URL as a string, and `split_words(text)`, which splits a string on whitespace and returns a list of words. URLs must be readable by the browser, including any required cross-origin permissions.
- Custom function calls use normal function notation, such as `helper(1, "text", [2, 3])`.
- Dictionary keys may be strings, numbers, or booleans. `D[key]` reads a value, and `D[key] <- value` creates or overwrites a key.
- For blocks over dictionaries iterate keys, so `item in D` assigns each key to `item`; use `D[item]` to read the value.

## Instructions for use

Add Function, Return, Assignment, Input, Output, If, While, and For blocks to the canvas, connect them with arrows, and edit each block's text directly. Use the input queue panel for queued input values, then press Reset, Step, or Run to execute from the `main` Function and inspect variables and output.
