# FlowLab

[Open the FlowLab app](https://davbachman.github.io/FlowLab/)

FlowLab is a browser-based flowchart programming environment for building, validating, stepping through, and running visual programs with functions, classes, objects, loops, input queues, output, math and text utilities, image processing, and turtle graphics.

Created by David Bachman with GPT 5.5 and GPT 5.6 sol. Learn more about David at [Pitzer College](https://pzacad.pitzer.edu/~dbachman/) and subscribe to his AI podcast, [*Entropy Bonus*](https://profbachman.substack.com/).

## Quick start

1. Double-click an empty part of the canvas and choose Function. The block appears at that location with its text field ready for typing. Name it `main` and press Enter to finish editing and deselect it.
2. Add executable blocks below it. Use Process blocks for assignments and function calls, Input blocks to read values, and Output blocks to display results.
3. Connect the blocks with wires and add a Return block to finish the flow.
4. Resolve every item shown under Validation.
5. Press Step to inspect execution one block at a time, or Run to execute from the current position until completion, a breakpoint, or an input wait. Run hides debugger details and skips their computation for speed; Step and Auto Step show them. Restart resets execution to the beginning.

See [Getting started](docs/getting-started.md) for the complete editor and execution walkthrough.

## Create and edit blocks

- Double-click empty canvas to open quick add. Click a block name, or type one and press Enter, to place it immediately where you double-clicked. Use ↑/↓ to choose a suggestion, Tab to complete its name, and Escape to cancel. Matching is case-insensitive; Call blocks are also available here.
- To place a block from the left palette, select its type, move the preview into position, and click the canvas. Every newly placed block focuses its empty text field automatically, including blocks created from wires. Press Enter in a block's text field to finish editing and deselect the block.
- Process, Input, and Output blocks start with one empty line and expand vertically as you type. Use Shift+Enter to add another line. Each nonblank line is handled in order:

  | Block | What each line does |
  | --- | --- |
  | Process | Runs an assignment such as `x <- 5`, or a standalone function or method call. Process blocks replace Assignment blocks. |
  | Input | Assigns the next value from the active flow's input queue to the named variable. Function and Method arguments supply that call's local queue. |
  | Output | Evaluates an expression and prints its value in the Output drawer. Use `""` to print an empty line. |

- Use `^` for exponents in expressions, such as `squared <- x^2` or `root <- x^0.5`, with no library import needed. Powers group right to left: `2^3^2` is `512`. See the [expression rules](docs/language-reference.md#expression-rules) for precedence and numeric limits.
- Drag an executable output wire onto empty canvas to choose a new block that is placed and connected immediately. Double-click an existing wire to insert a Process, Call, Input, or Output block; the same command is available under **Edit > Insert block on selected wire**.
- Double-click a block outside its text field, buttons, or connection handles to edit its comment. Enter saves the comment and closes the dialog; Shift+Enter adds a line. Clear the comment and save to remove it.
- Use the Collapse/Expand button on a Function, Method, or Class to hide or restore its contents. A Class hides its init Inputs, attached Methods, and their flows. Expanding the Class restores each Method's previous collapsed or expanded state. Moving a collapsed block moves its hidden contents with it, and these settings are saved with the document.
- Use the left sidebar's Build tab for blocks, validation, and imports, and its Notes tab for document notes. Notes are saved with the program and included in draft recovery.

## Classes and attributes

1. Give a Class block a plain name such as `Point`.
2. To accept constructor arguments, drag a wire from the Class's **init** connection onto empty canvas. This creates an Input block with its text field ready for typing. Enter one attribute name per line, such as `x` and `y`, using Shift+Enter between them. You can also chain single-line Input blocks. Init contains only Input blocks and needs no Return.
3. Drag a wire from **+ method** onto empty canvas to create and attach a Method block with its text field focused. Name the method, connect its executable flow, and finish that flow with a Return. Use Input blocks in the method's flow to receive method arguments.

With init inputs `x` and `y`, a Process statement such as `p <- Point(2, 3)` creates an instance with attributes `p.x` and `p.y`. The init connection can also remain unconnected; construct that class with `Point()`.

Inside a Method, use `self.x <- value` to create or update an attribute on the current instance, even if it was not declared through init. Read it with `self.x`. Bare names such as `x` refer only to method arguments or local variables; `x <- value` always assigns a local variable. See [Classes and objects](docs/classes-and-objects.md) for methods, object identity, and special methods.

## Included examples

| Example | What it demonstrates |
| --- | --- |
| Basic | Queued input, a While loop, arithmetic, and output. |
| Process Basics | Several related assignments collected in one multiline Process block. |
| Number Guess | `rand()`, `ask()`, Process calls, and conditional branches. |
| List Statistics | List iteration, aggregation, comparisons, and a dictionary result. |
| Dictionary Inventory | Dictionary creation, updates, lookup, and key iteration. |
| Object | A `Point` class with init Input attributes, instance methods, and `__repr__`. |
| Bank Account Class | Init attributes, object state, method arguments, branching, and object output. |
| Turtle Polygon | A For loop, calculated turn angles, and native turtle calls. |

Choose a program from the Examples menu to load its complete, editable flowchart.

Open **FlowLab > Reference** inside the app to look up available functions and see which libraries are imported. **FlowLab > Instructions** opens this documentation.

## Highlights

- Visual canvas editing with selection, wiring, comments, horizontal block resizing, copy/paste, undo/redo, pan, zoom, and fit view.
- Expandable multiline Process, Input, and Output blocks, plus commands for combining, splitting, and cleaning up Process flows.
- Functions, optional class init inputs, objects, methods, dynamic instance attributes, recursion, and Python-style special methods.
- Numbers, strings, booleans, lists, dictionaries, and expandable object values.
- Interruptible Run, Restart, Step, adjustable Auto Step, and breakpoints, with arrival-wire highlighting for every block, branch results, changed variables, call-stack breadcrumbs, and active-flow input.
- A resizable Output drawer that opens for results and runtime errors independently of the sidebar, plus a separately scrolling variable list.
- Clickable validation issues, connected block insertion, and a canvas-first tabbed layout on smaller screens.
- Automatic local draft recovery, visible save status, and support for reopening unfinished programs.
- File > Clear empties the current canvas while retaining imports and settings, with Undo to restore it.
- Imports from FlowLab JSON programs plus native math, text, image, and turtle libraries.
- JSON loading and saving, including block positions and widths, Function/Method/Class collapse states, comments, document notes, imports, and queued input.
- An in-app function reference that updates with your imports, plus draggable and expandable image and turtle panels.

## Documentation

| Guide | Contents |
| --- | --- |
| [Getting started](docs/getting-started.md) | Block placement and editing, multiline blocks, comments, function lookup, validation, execution controls, input, notes, layout, and keyboard shortcuts. |
| [Language reference](docs/language-reference.md) | Data types, expressions, assignments, calls, control flow, and built-ins. |
| [Classes and objects](docs/classes-and-objects.md) | Class names, optional init Inputs, `self` attributes, methods, identity, and special methods. |
| [Imports and native libraries](docs/imports-and-libraries.md) | JSON program imports plus the `math`, `text`, `image`, and `turtle` libraries. |
| [Saving and loading](docs/saving-and-loading.md) | New and Clear, JSON files, save status, draft recovery, and programs folders. |

## License

See [LICENSE](LICENSE).
