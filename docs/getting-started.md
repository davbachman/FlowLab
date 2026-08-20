# Getting started

[Documentation home](../README.md) · [Language reference](language-reference.md) · [Classes and objects](classes-and-objects.md) · [Imports and native libraries](imports-and-libraries.md) · [Saving and loading](saving-and-loading.md)

## Contents

- [Build your first program](#build-your-first-program)
- [Work with the canvas](#work-with-the-canvas)
- [Use Process blocks](#use-process-blocks)
- [Validate a program](#validate-a-program)
- [Run and inspect a program](#run-and-inspect-a-program)
- [Use input](#use-input)
- [Menus and layout](#menus-and-layout)

## Build your first program

1. Select a Function block in the left palette, click the canvas to place it, and edit its text to `main`.
2. Add executable blocks for the work the program should perform. FlowLab provides Return, Process, Assignment, Call, Input, Output, If, While, and For blocks.
3. Connect the Function block to the first executable block, wire each path through the program, and finish with at least one Return.
4. Resolve every item in the Validation panel.
5. Enter any imports or queued input values the program needs.
6. Press Reset and Step to inspect the flow one block at a time, use Auto Step to watch it at a selected speed, or press Run to restart and execute immediately.

The Examples menu contains eight complete programs that can be edited and run as tutorials or starting points.

## Work with the canvas

- FlowLab starts with a blank canvas. Select a block in the left palette, then click the canvas to place it. Edit the text directly inside any block.
- Drag between block handles to make wires. Function and Method roots begin executable flows. Class handles attach Methods.
- Multiple wires may enter an executable block. Starting a new wire from an occupied output replaces that output's old wire; `true` and `false` branch outputs are replaced independently, while Class Method attachments accumulate.
- If, While, and For diamonds use either side for the `true` or loop-body branch and the bottom for the `false` or exit branch. FlowLab labels those wires and routes loop-back wires automatically.
- Left-click selects one block. Shift-, Ctrl-, or Cmd-click extends the selection, and left-drag on empty canvas makes a selection window. Drag any selected block to move the selection.
- Select a block and drag either blue grip at its left or right edge to expand its width for long code. Width changes can be undone and are preserved when the program is saved.
- Use Ctrl/Cmd+C to copy selected blocks and their internal wires, Ctrl/Cmd+V to paste, and Ctrl/Cmd+Z to undo. Backspace or Delete removes selected blocks or wires.
- Right-click a block to add, edit, or remove a comment. Comments appear inside the block and are preserved when the program is saved.
- Right-drag or scroll to pan the main canvas. Use the canvas controls or pinch gestures to zoom, and use Fit View to frame the whole program.

## Use Process blocks

A Process block holds one or more assignments and standalone function or method calls. Put one statement on each nonblank line:

```text
width <- 8
height <- 5
area <- width * height
record(area)
```

Statements run from top to bottom before execution follows the Process block's outgoing wire. A syntax, validation, or runtime error identifies the relevant Process line.

To condense an existing flow:

1. Select one straight-line chain containing Assignment, Call, or Process blocks.
2. Choose Edit > Combine into Process.
3. Edit the resulting multiline block if needed.

Choose Edit > Split Process while exactly one Process block is selected to turn its lines back into individual Assignment and Call blocks. Existing Assignment and Call blocks remain supported for programs where separate visual steps are clearer.

## Validate a program

- A valid program has exactly one Function named `main` and at least one Return block.
- Every executable block must belong to exactly one Function or Method flow.
- Functions and Methods need one executable outgoing wire. Return has no outgoing wire.
- Each If, While, or For block needs one `true` and one `false` exit.
- Validation also checks graph shape, names, call targets, branch labels, function-body ownership, and malformed block text.

## Run and inspect a program

- Reset creates a fresh execution at `main` without advancing it.
- Step executes one visible block at a time and continues the current execution. Function and method calls enter the called flowchart.
- Auto Step repeatedly steps at the speed selected beneath the controls. Use Pause to preserve the current position.
- Run starts fresh and continues immediately until the program returns, waits for input, pauses for a text or image load, or reports an error.
- Text/image loads and `ask()` submissions resume Run or Auto Step in the mode that started them.
- The Console reports execution status, executed-block count, and the active Flow name. It also shows runtime errors, Output lines, current variables, expandable object fields, and stable identities such as `Point #1`.
- The current node is highlighted while stepping. Long multiline variable previews are shortened in the sidebar. Imported `image` and `turtle` libraries add their visual panels to the runtime sidebar.
- FlowLab stops runaway execution after 1,000,000 executed blocks or 100 active nested calls.

## Use input

- The input queue contains one value per nonblank line.
- FlowLab parses numbers, `True`/`False`, quoted strings, lists, and dictionaries. Other text becomes an unquoted String.
- Input blocks consume the active flow's queue in order. Execution shows `Waiting` when that queue is empty.
- Function and Method arguments form a local input queue for that call. Place Input blocks at the start of the called flow to bind those arguments in order.
- The sidebar switches to the active queue while stepping inside a call.
- `ask()` opens an input dialog and parses the submitted value with the same rules as the input queue; unlike the queue, it can also submit an empty String.

## Menus and layout

- The FlowLab menu contains About and Instructions. Instructions opens the documentation in a separate tab.
- The File menu contains New, Save, and Load. See [Saving and loading](saving-and-loading.md).
- The Edit menu contains Combine into Process and Split Process.
- The Examples menu contains the eight programs summarized on the [documentation home page](../README.md).
- The left palette and right runtime sidebar scroll independently. On desktop, drag the divider at the sidebar's left edge to resize it; on narrow screens the workspace stacks vertically.

---

[← Documentation home](../README.md) · [Next: Language reference →](language-reference.md)
