# FlowLab

[Open the FlowLab app](https://davbachman.github.io/FlowLab/)

FlowLab is a browser-based flowchart programming environment for building, validating, stepping through, and running visual programs with functions, classes, objects, loops, input queues, output, math and text utilities, image processing, and turtle graphics.

Created by David Bachman with GPT 5.5 and GPT 5.6 sol. Learn more about David at [Pitzer College](https://pzacad.pitzer.edu/~dbachman/) and subscribe to his AI podcast, [*Entropy Bonus*](https://profbachman.substack.com/).

## Quick start

1. Select a Function block in the left palette, place it on the canvas, and name it `main`.
2. Add executable blocks below it. Use a Process block to keep several related assignments and function calls together.
3. Connect the blocks with wires and add a Return block to finish the flow.
4. Resolve every item shown under Validation.
5. Press Step to inspect execution one block at a time, or Run to execute from the current position until completion, a breakpoint, or an input wait. Restart resets execution to the beginning.

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

Open **FlowLab > Reference** inside the app to look up available functions and see which libraries are imported. **FlowLab > Instructions** opens this documentation.

## Highlights

- Visual canvas editing with selection, wiring, comments, horizontal block resizing, copy/paste, undo/redo, pan, zoom, and fit view.
- Multiline Process blocks plus commands for combining, splitting, and deterministically cleaning up flowcharts.
- Functions, classes, objects, methods, fields, recursion, and Python-style special methods.
- Numbers, strings, booleans, lists, dictionaries, and expandable object values.
- Interruptible Run, Restart, Step, adjustable Auto Step, and breakpoints, with arrival-wire highlighting for every block, branch results, changed variables, call-stack breadcrumbs, and active-flow input.
- Clickable validation issues, connected block insertion, and a canvas-first tabbed layout on smaller screens.
- Automatic local draft recovery, visible save status, and support for reopening unfinished programs.
- File > Clear empties the current canvas while retaining imports and settings, with Undo to restore it.
- Imports from FlowLab JSON programs plus native math, text, image, and turtle libraries.
- JSON loading and saving, including block positions and widths, comments, imports, and queued input.
- An in-app function reference that updates with your imports, plus draggable and expandable image and turtle panels.

## Documentation

| Guide | Contents |
| --- | --- |
| [Getting started](docs/getting-started.md) | Canvas workflow, Process blocks, function lookup, validation, execution controls, input, layout, and keyboard shortcuts. |
| [Language reference](docs/language-reference.md) | Data types, expressions, assignments, calls, control flow, and built-ins. |
| [Classes and objects](docs/classes-and-objects.md) | Declarations, fields, methods, identity, and special methods. |
| [Imports and native libraries](docs/imports-and-libraries.md) | JSON program imports plus the `math`, `text`, `image`, and `turtle` libraries. |
| [Saving and loading](docs/saving-and-loading.md) | New and Clear, JSON files, save status, draft recovery, and programs folders. |

## License

See [LICENSE](LICENSE).
