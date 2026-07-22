# FlowLab

[Open the app](https://davbachman.github.io/FlowLab/)

Created by David Bachman with GPT 5.5 and GPT 5.6 sol. To learn more about David see [https://pzacad.pitzer.edu/~dbachman/](https://pzacad.pitzer.edu/~dbachman/), and subscribe to his AI podcast *Entropy Bonus* at [https://profbachman.substack.com/](https://profbachman.substack.com/).

## Brief description

FlowLab is a browser-based flowchart programming environment for building, validating, stepping through, and running visual programs with functions, classes, objects, loops, input queues, and output.

## Features

- Flowchart blocks for Function, Class, Method, Return, Assignment, Call, Input, Output, If, While, and For, with conventional parallelograms for Input and Output.
- Editable Function names. Execution starts at the `main` Function.
- Multiple disjoint function flowcharts on the same canvas.
- Class declarations with ordered fields, expandable method handles, positional object construction, field access, field assignment, and methods.
- Python-style special methods for custom object output, comparisons, and arithmetic.
- Expandable object values in the Variables panel, including stable class-and-identity labels such as `Point #1`.
- Function calls inside block expressions, such as `x <- helper(5)`.
- Function calls pass their arguments as the called function's local input queue.
- Interactive input with `ask()`, such as `x <- ask()`.
- Native text loading and word splitting with the `text` import.
- Native turtle graphics with nine drawing commands, step-by-step rendering, and a pannable, zoomable drawing panel.
- Random numbers with `rand()`, which returns a number from 0 up to but not including 1.
- Step-through execution enters called function and method flowcharts and shows the active flow's input queue.
- Imports panel for listing FlowLab JSON files and using their non-`main` functions, Classes, and Methods.
- Import conflict handling across Functions, Classes, Methods, native libraries, and ordered JSON imports.
- Validation for graph shape, function names, call targets, branch labels, function body ownership, and malformed block text.
- Input queue editor for queued runtime input.
- Variables and output panels for inspecting execution state.
- Current-node highlighting while stepping.
- Canvas editing with window selection, selected-block dragging, copy, paste, undo, delete, clear, pan, zoom, and fit view.
- Right-click comments stored and displayed inside blocks.
- Resizable runtime sidebar and a responsive layout that stacks on narrow screens.
- A compact menu toolbar for app information, file actions, and examples.
- JSON import and export for FlowLab programs.

## Editor workflow

- The **FlowLab** menu contains **About** and **Instructions**; Instructions opens this GitHub README in a separate tab. The **File** menu contains **New**, **Save**, and **Import**. The **Examples** menu contains **Basic** and **Object**.
- FlowLab starts with a blank canvas. Select a block in the left palette, then click the canvas to place it. Edit the text directly inside any block.
- Drag between block handles to make wires. Function and Method roots begin executable flows. Class handles attach Methods. If, While, and For diamonds use either side for the `true` or loop-body branch and the bottom for the `false` or exit branch; FlowLab labels those wires and routes loop-back wires automatically.
- Left-click selects one block. Shift-, Ctrl-, or Cmd-click extends the selection, and left-drag on empty canvas makes a selection window. Drag any selected block to move the selection.
- Use Ctrl/Cmd+C to copy selected blocks and their internal wires, Ctrl/Cmd+V to paste, and Ctrl/Cmd+Z to undo. Backspace or Delete removes selected blocks or wires.
- Right-click a block to add, edit, or remove a comment. Comments appear inside the block and are preserved when the program is exported.
- Right-drag or scroll to pan the main canvas. Use the canvas controls or pinch gestures to zoom, and use **Fit View** to frame the whole program.
- **Examples > Basic** loads the queued-input loop example and fills the input queue with `3`. **Examples > Object** loads and auto-fits a `Point` Class with `move` and `__repr__` Methods. **File > New** removes all blocks and wires while leaving the Imports list and input queue intact.
- The left palette and right runtime sidebar scroll independently. On desktop, drag the divider at the sidebar's left edge to resize it; on narrow screens the workspace stacks vertically.

## Running and inspecting programs

- A valid program has exactly one Function named `main` and at least one Return block. Every executable block must belong to exactly one Function or Method flow. Functions and Methods need one executable outgoing wire, Return has no outgoing wire, and each If, While, or For block needs one `true` and one `false` exit.
- **Reset** creates a fresh execution at `main` without advancing it. **Step** executes one visible block at a time and continues the current execution. **Run** starts fresh and continues until the program returns, waits for input, pauses for a text load, or reports an error; text loads and `ask()` submissions resume Run automatically.
- The input queue contains one value per nonblank line. FlowLab parses numbers, `True`/`False`, quoted strings, lists, and dictionaries; other text is an unquoted String. Input blocks consume the active flow's queue in order and execution shows `Waiting` if the queue is empty.
- Function and Method arguments form a local input queue for that call. Place Input blocks at the start of the called flow to bind those arguments in order. The sidebar switches to that active queue while stepping inside the call.
- `ask()` opens an input dialog and parses the submitted value with the same rules as the input queue; unlike the queue, it can also submit an empty String. `text_from_url()` temporarily shows the loading state while the browser fetches the text.
- The Console reports execution status, executed-block count, and the active Flow name. It also shows runtime errors, Output lines, current variables, expandable object fields, and stable object identities such as `Point #1`. Long multiline variable previews are shortened in the sidebar.
- FlowLab stops runaway execution with an error after 1,000,000 executed blocks or 100 active nested calls.

## Imports, saving, and loading

- Enter imports one per line or comma-separated; the `.json` suffix is optional. The panel reports loading progress, resolved files and native libraries, available Classes and Functions, conflicts, and errors.
- A JSON import contributes its non-`main` Functions and its Classes with the Methods attached to those Classes. The current canvas wins any shared Function-or-Class name. Among JSON imports, the first listed Function or Class to claim a name wins, and only a winning imported Class contributes its Methods. A current-canvas Method wins over an imported Method with the same qualified name.
- FlowLab Functions and Classes also take priority over same-named native-library functions. This lets a program deliberately replace an imported command.
- JSON names are resolved from the chosen programs folder first, then from programs previously imported or exported in this browser, and finally from a URL or relative path the browser can fetch. Import a file once if the browser cannot otherwise find it by name.
- **File > Import** loads a complete FlowLab JSON program. Saved Imports text and input queue values are restored before the imported graph is validated.
- **File > Save** exports block positions and text, wires, comments, the Imports list, and the input queue. Browsers with folder access ask for a programs folder and filename, then reuse that folder for later exports and imports. Other browsers use a save-file picker or a normal JSON download.

## Native libraries

### Text

Enter `text` in Imports to enable:

- `text_from_url(url)`, which loads a browser-readable URL and returns its contents as a String. The server must allow the browser request, including any required cross-origin permissions.
- `split_words(text)`, which splits a String on whitespace and returns a List of words.

### Turtle

Enter `turtle` in Imports to show the Turtle drawing panel and enable these calls:

| Call | Effect |
| --- | --- |
| `forward(distance)` | Move forward by a finite Number. |
| `backward(distance)` | Move backward by a finite Number. |
| `left(degrees)` | Turn left by a finite Number of degrees. |
| `right(degrees)` | Turn right by a finite Number of degrees. |
| `penup()` | Move without drawing. |
| `pendown()` | Resume drawing. |
| `color(text)` | Set the line color from a String. |
| `home()` | Draw or move to `(0, 0)` and face right. |
| `clear()` | Erase drawn segments without moving or turning the turtle. |

The turtle starts at `(0, 0)`, facing right, with its pen down. Put commands in Call blocks to use them for their drawing side effects; if used in a larger expression they return `0`. Step mode updates the drawing one command at a time. Right-drag the Turtle panel to pan it, use Ctrl+wheel or a trackpad pinch to zoom, or pinch with two touch pointers.

## Data types and operations

| Data type | Literals and values | Allowed operations |
| --- | --- | --- |
| Number | Integers and decimals, such as `3`, `-2`, `4.5` | Arithmetic `+`, `-`, `*`, `/`; unary `-`; comparisons `<`, `<=`, `>`, `>=`, `=`, `==`, `!=`; built-ins `sqrt(number)` and `rand()`; truth tests where zero is false |
| String | Single- or double-quoted text, such as `"cat"` or `'hello'`; supports escapes like `\n`, `\t`, `\"`, `\'`, and `\\` | Concatenation with `+`; zero-based indexing like `S[0]`; equality and inequality with `=`, `==`, `!=`; truth tests where non-empty strings are true; For iteration over characters |
| Boolean | `True` and `False` | Logical `and`, `or`, `not`; equality and inequality; assignment, output, Return values, If conditions, and While conditions |
| List | Bracket literals, such as `[1, 2, 3]`, `["a", True]`, and nested lists | Concatenation with `+` when both operands are lists; zero-based indexing like `L[0]`; indexed assignment like `L[i] <- value`; deep equality and inequality; truth tests where non-empty lists are true; For iteration over elements |
| Dictionary | Brace literals with primitive keys, such as `{"name": "Ada"}`, `{1: "one", "1": "string"}`, and `{True: [2, 3]}` | Lookup like `D["name"]`; indexed assignment like `D[key] <- value` creates or overwrites keys; deep, order-independent equality and inequality; truth tests where non-empty dictionaries are true; For iteration over keys in insertion order |
| Object | Construct an instance from a Class declaration, such as `p <- Point(2, 3)` for `Point(x, y)` | Field access such as `p.x`; field assignment such as `p.x <- 10`; method calls such as `p.move(5, -1)`; always true in truth tests; identity equality by default; customizable output, comparisons, and arithmetic through special methods |
| Function result | Any single value returned by a Return block | Use returned values in expressions, assignments, output, branch conditions, loops, list elements, and other function call arguments |

## Expression and statement syntax

- Parentheses control grouping. From highest to lowest, the main operator precedence is postfix calls/indexing/member access, unary `-`, `*` and `/`, `+` and `-`, comparisons, `not`, `and`, then `or`. Logical `and` and `or` short-circuit and return a Boolean.
- False values are `False`, zero, and empty Strings, Lists, and Dictionaries. Objects and other nonempty values are true.
- `+` adds two Numbers, concatenates two Lists, and otherwise concatenates the basic String forms of its operands. Object operands follow the `__add__` rules below; concatenation never calls `__repr__` implicitly.
- String and List indexes are zero-based nonnegative integers. Dictionary lookup keys are Strings, Numbers, or Booleans.
- Assignment blocks use `name <- expression`, `name[indexOrKey] <- expression`, or `object.field <- expression`.
- Input blocks name one variable that receives the next value from the active input queue.
- Output blocks evaluate and display an expression. Return evaluates an expression, ends the current Function or Method, and sends the value back to its caller; Return from `main` halts the program.
- If and While blocks contain truth-tested expressions. While bodies must wire back to the While diamond to repeat.
- For blocks use `item in iterable`. Their `true` branch runs once for each String character, List item, or Dictionary key, and their `false` branch runs after exhaustion. Loop bodies must wire back to the For diamond. Dictionaries iterate keys in insertion order; use `D[item]` to read each value.
- Call blocks must contain one standalone Function or Method call, such as `helper(1)` or `p.move(2, 3)`. They run it for side effects and discard its return value. Calls used inside other block expressions keep their return value.
- Custom Function calls use normal notation, such as `helper(1, "text", [2, 3])`. Built-ins are `sqrt(nonnegativeNumber)`, `rand()`, and `ask()`; `rand()` returns a Number from 0 up to but not including 1.
- Names must start with a letter or underscore and may contain letters, digits, and underscores. The language words `and`, `or`, `not`, `True`, and `False` cannot be used as names. `sqrt`, `rand`, and `ask` cannot be redefined as Functions or Classes.
- Dictionary literal keys are String, Number, or Boolean literals. Those key types remain distinct, so `1`, `"1"`, and `True` may coexist. A later duplicate literal key replaces the earlier value. `D[key]` accepts an expression of one of those primitive types, and `D[key] <- value` creates or overwrites an entry.

## Classes and objects

- A Class block declares a class name and its ordered fields with `ClassName(field1, field2)`, for example `Point(x, y)`. Zero-field declarations such as `Marker()` are also valid. Function and Class names share one callable namespace, and `self` cannot be a field name.
- Calling the class name constructs an object and initializes the fields positionally. For example, `p <- Point(2, 3)` creates a `Point` whose `x` is `2` and `y` is `3`.
- To add a method, connect the Class block's dashed `+ method` handle to the top handle of a Method block. The Class block grows a named handle for every attached method and keeps a new `+ method` handle available.
- A Method block contains only the method name, for example `move`, because its incoming Class connection determines which class it belongs to. Connect the Method block's outgoing handle to the first step of the method just as you would for a Function.
- Inside a method, declared fields can be read and written by bare name. For example, a `Point.move` flow can read the arguments `dx` and `dy` with Input blocks, then use `x <- x + dx` and `y <- y + dy`.
- Bare List and Dictionary fields support indexed assignment inside a Method, such as `items[i] <- value`. A bare field that contains an object can also be the target of a member assignment.
- Local names take priority over field names. An Input, loop variable, or existing local with the same name shadows that field; use `self.x` to refer to the field explicitly when disambiguation is needed.
- `self` is always the object that received the call and cannot be replaced by an Input, Assignment, or For block. It remains available when a method needs the whole receiver, such as `Return self`, or explicit field access such as `self.x`.
- Call methods with dot notation in expressions or Call blocks, such as `moved <- p.move(5, -1)` or `p.move(5, -1)`. Member access can chain through objects and method results, such as `wrapper.point.x` or `wrapper.get_point().x`.
- Assigning an object to another variable creates an alias, not a copy: after `q <- p`, both variables display the same identity, such as `Point #1`, and changes through either name are shared.
- Without `__eq__`, object equality is based on identity. `p == q` is true when both variables refer to the same instance; two separately constructed objects are unequal even when all of their fields contain equal values.

### Special methods (dunder methods)

Special methods are ordinary Method blocks attached to a Class, but FlowLab also calls them for the corresponding operation. Their names are exact and case-sensitive. The left palette includes a collapsed **Special methods** quick reference.

| Attached Method | Input blocks | Required return | Automatic use |
| --- | --- | --- | --- |
| `__repr__` | None | String | Formatting objects in Output, recursively through lists, dictionaries, and structural object fields |
| `__eq__` | Exactly one, connected directly after the Method | Boolean | `=` and `==` |
| `__ne__` | Exactly one, connected directly after the Method | Boolean | `!=`; when absent, FlowLab negates `__eq__` instead |
| `__lt__` | Exactly one, connected directly after the Method | Boolean | `<` |
| `__le__` | Exactly one, connected directly after the Method | Boolean | `<=` |
| `__gt__` | Exactly one, connected directly after the Method | Boolean | `>` |
| `__ge__` | Exactly one, connected directly after the Method | Boolean | `>=` |
| `__add__` | Exactly one, connected directly after the Method | Any FlowLab value | `+` |
| `__sub__` | Exactly one, connected directly after the Method | Any FlowLab value | `-` |
| `__mul__` | Exactly one, connected directly after the Method | Any FlowLab value | `*` |
| `__truediv__` | Exactly one, connected directly after the Method | Any FlowLab value | `/` |
| `__neg__` | None | Any FlowLab value | Unary `-`, as in `-p` |

- Binary operators use only the left object's special method and pass the right value through the Method's single Input block. Reflected right-side methods are not supported. Missing equality methods fall back to identity; missing ordered-comparison or arithmetic methods produce an error.
- Special comparison dispatch applies only when an object is a direct operand. Lists and dictionaries retain their deep container equality, with nested objects compared by identity rather than by calling their comparison special methods.
- Special methods can be called explicitly, such as `p.__repr__()` or `p.__add__(q)`, with the same Input and return contracts. String concatenation does not invoke `__repr__`; write `"point: " + p.__repr__()` explicitly.
- Keep special methods side-effect-free because operators and Output invoke them implicitly. When stepping a program, FlowLab enters the special Method's flow just as it does for an explicit method call.
- Directly re-entering the same special method on the same receiver is rejected as recursion. A special method may call a different special method, so `__le__` can compose `__lt__` and `__eq__`.
- The Variables panel never calls `__repr__` or another special method. It remains a passive diagnostic view showing stable class-and-identity labels and expandable fields.
- A Class without `__repr__` uses structural Output such as `Point #1 {x: 2, y: 3}`.

Use the Flow status while stepping to see whether execution is in `main`, a function, or a qualified method such as `Point.move` or `Point.__add__`.

The first class release intentionally omits inheritance, access modifiers and private members, static members, same-name method overloads, reflected and in-place operators, custom constructors, and fields that were not declared in the Class block.

## Instructions for use

1. Add a Function block named `main`, executable step blocks, and at least one Return. Connect the flow and resolve every item shown under Validation.
2. Add other Functions as separate flowcharts. For a Class, connect each Method from the Class block's `+ method` handle, then connect the Method's bottom handle to its executable flow.
3. Enter any queued Input values and imports before starting. The **Examples** menu provides two complete working programs to explore.
4. Press **Reset** and then **Step** to follow execution block by block, or press **Run** to restart and execute continuously.
5. Inspect Status, Steps, Flow, Variables, Output, and the Turtle drawing when enabled. Correct any runtime error shown in the Console.
6. Use **File > Save** to preserve the graph, comments, Imports list, and input queue, or **File > Import** to reopen a saved JSON program.
