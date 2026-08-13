# FlowLab

[Open the FlowLab app](https://davbachman.github.io/FlowLab/)

FlowLab is a browser-based flowchart programming environment for building, validating, stepping through, and running visual programs with functions, classes, objects, loops, input queues, output, text utilities, image processing, and turtle graphics.

Created by David Bachman with GPT 5.5 and GPT 5.6 sol. Learn more about David at [Pitzer College](https://pzacad.pitzer.edu/~dbachman/) and subscribe to his AI podcast, [*Entropy Bonus*](https://profbachman.substack.com/).

## Quick start

1. Select a Function block in the left palette, place it on the canvas, and name it `main`.
2. Add executable blocks below it. Use a Process block to keep several related assignments and function calls together.
3. Connect the blocks with wires and add a Return block to finish the flow.
4. Resolve every item shown under Validation.
5. Press Reset and Step to inspect execution one block at a time, or Run to execute immediately.

See [Getting started](docs/getting-started.md) for the complete editor and execution walkthrough.

## Included examples

| Example | What it demonstrates |
| --- | --- |
| Basic | Queued input, a While loop, arithmetic, and output. |
| Process Basics | Several related assignments collected in one multiline Process block. |
| Number Guess | `rand()`, `ask()`, Process calls, and conditional branches. |
| List Statistics | List iteration, aggregation, comparisons, and a dictionary result. |
| Dictionary Inventory | Dictionary creation, updates, lookup, and key iteration. |
| Object | A `Point` class with fields, methods, and `__repr__`. |
| Bank Account Class | Object state, method arguments, branching, and object output. |
| Turtle Polygon | A For loop, calculated turn angles, and native turtle calls. |

Choose a program from the Examples menu to load its complete, editable flowchart.

## Highlights

- Visual canvas editing with selection, wiring, comments, copy/paste, undo, pan, zoom, and fit view.
- Multiline Process blocks plus commands for combining and splitting straight-line code.
- Functions, classes, objects, methods, fields, recursion, and Python-style special methods.
- Numbers, strings, booleans, lists, dictionaries, and expandable object values.
- Continuous and step-through execution with active-flow input, variables, output, and node highlighting.
- Imports from FlowLab JSON programs plus native text, image, and turtle libraries.
- JSON loading and saving, including block layout, comments, imports, and queued input.

## Documentation

| Guide | Contents |
| --- | --- |
| [Getting started](docs/getting-started.md) | Canvas workflow, Process blocks, validation, execution controls, input, and inspection. |
| [Language reference](docs/language-reference.md) | Data types, expressions, assignments, calls, control flow, and built-ins. |
| [Classes and objects](docs/classes-and-objects.md) | Declarations, fields, methods, identity, and special methods. |
| [Imports and native libraries](docs/imports-and-libraries.md) | JSON program imports plus the `text`, `image`, and `turtle` libraries. |
| [Saving and loading](docs/saving-and-loading.md) | New programs, JSON files, programs folders, and restored state. |

## License

See [LICENSE](LICENSE).
