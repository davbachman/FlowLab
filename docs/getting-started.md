# Getting started

[Documentation home](../README.md) · [Language reference](language-reference.md) · [Classes and objects](classes-and-objects.md) · [Imports and native libraries](imports-and-libraries.md) · [Saving and loading](saving-and-loading.md)

## Contents

- [Build your first program](#build-your-first-program)
- [Work with the canvas](#work-with-the-canvas)
- [Use Process blocks](#use-process-blocks)
- [Look up functions](#look-up-functions)
- [Validate a program](#validate-a-program)
- [Run and inspect a program](#run-and-inspect-a-program)
- [Use input](#use-input)
- [Menus and layout](#menus-and-layout)
- [Keyboard shortcuts](#keyboard-shortcuts)

## Build your first program

1. Select a Function block in the left palette, click the canvas to place it, and edit its text to `main`.
2. Add executable blocks for the work the program should perform. FlowLab provides Return, Process, Assignment, Call, Input, Output, If, While, and For blocks.
3. Connect the Function block to the first executable block, wire each path through the program, and finish with at least one Return.
4. Resolve every item in the Validation panel.
5. Enter any imports or queued input values the program needs.
6. Press Step to inspect the flow one block at a time, use Auto Step to watch it at a selected speed, or press Run to execute from the current position until completion, a breakpoint, or an input wait. Restart prepares a fresh execution at `main`.

The Examples menu contains eight complete programs that can be edited and run as tutorials or starting points.

Choosing an example replaces the current canvas with a separate draft, supplies the example's input queue, and adds any required libraries to your existing imports. Use Undo to return to the previous canvas, or File > Recover draft to reopen its recovery copy.

## Work with the canvas

- FlowLab starts with a blank canvas unless you reopen a saved browser draft. The palette groups blocks into **Definitions** (Function, Class, Method), **Steps** (Return, Process, Input, Output), and **Control Flow** (If, While, For). Select a block, move its preview into position, then click the canvas to place it. Edit the text directly inside any placed block.
- Double-click an empty part of the canvas to open quick add. Type a block name, use ↑/↓ to choose a suggestion, Tab to complete its name, and Enter to start placement; then click the canvas to place it. Matching is case-insensitive. Assignment and Call are available here even though the palette uses Process for both. Escape cancels the chooser or placement.
- Drag between block handles to make wires. Function and Method roots begin executable flows. Class handles attach Methods. Drag an executable output into empty canvas to choose a new block that is placed and connected automatically. This chooser also offers Return, If, While, and For; complete any additional branches yourself.
- Double-click a wire to insert a Process, Assignment, Call, Input, or Output block. You can also select a wire and choose **Edit → Insert block on selected wire**. The existing continuation and branch direction are preserved. Insertion avoids overlapping other blocks and can be undone in one action. Press Escape to cancel without changing the wire.
- Multiple wires may enter an executable block. Starting a new wire from an occupied output replaces that output's old wire; `true` and `false` branch outputs are replaced independently, while Class Method attachments accumulate.
- If, While, and For diamonds use either side for the `true` or loop-body branch and the bottom for the `false` or exit branch. FlowLab labels those wires and routes loop-back wires automatically.
- Left-click selects one block. Shift-, Ctrl-, or Cmd-click extends the selection, and left-drag on empty canvas makes a selection window. Drag any selected block to move the selection.
- Select a block and drag either blue grip at its left or right edge to expand its width for long code. Width changes can be undone and are preserved when the program is saved.
- Use Ctrl/Cmd+C to copy selected blocks and their internal wires, Ctrl/Cmd+V to paste, Ctrl/Cmd+Z to undo, and Shift+Ctrl/Cmd+Z to redo. Pasted blocks retain their text, comments, and widths and appear offset from the originals. Backspace or Delete removes selected blocks or wires; deleting a block also removes its connected wires.
- Right-click a block to add, edit, or remove a comment. Comments appear inside the block and are preserved when the program is saved.
- Right-drag to pan the main canvas. Use the mouse wheel, pinch gestures, or the canvas controls to zoom, and use Fit View to frame the whole program.

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

Choose Edit > Clean up code to safely merge short, adjacent Process blocks and arrange the complete flowchart. Cleanup keeps branches, loop backs, Functions, Classes, and Methods in distinct visual lanes; it is applied as one undoable change and leaves unsafe or malformed Process pairs separate. Use this command before pressing Restart or running the program, or after execution completes or encounters an error.

## Look up functions

Open **FlowLab > Reference** to see the functions currently available to your program, including core built-ins, functions on the canvas, imported FlowLab functions, and imported native-library functions. Entries show call syntax and short descriptions; user-defined functions use `name(…)`, so inspect their Input blocks for argument order.

The library list shows all four native libraries and marks which are imported, along with loaded FlowLab files. Native-library functions appear in the function list only after you import their library. Open **Imports** in the left sidebar to change the list. The **Special methods** reference below the palette lists the supported object methods and their expected Input counts. See [Classes and objects](classes-and-objects.md) and [Imports and native libraries](imports-and-libraries.md) for complete examples.

## Validate a program

- A valid program has exactly one Function named `main` and at least one Return block.
- Every executable block must belong to exactly one Function or Method flow.
- Functions and Methods need one executable outgoing wire. Return has no outgoing wire.
- Each If, While, or For block needs one `true` and one `false` exit.
- Validation also checks graph shape, names, call targets, branch labels, function-body ownership, and malformed block text.
- Click a validation issue to select and frame its block. Text issues focus the code field, including the affected Process line; import issues open the Imports editor. Text errors are also marked in the block's text field. Programs with validation errors can still be edited and saved, but cannot run.

## Run and inspect a program

- Restart clears the prior execution's variables and output and prepares a fresh execution at `main` without advancing it. The status becomes Ready and the main execution button shows Run.
- The input queue remains editable immediately after Restart. If execution is waiting at an Input block, add one or more values to the queue and choose Step, Auto Step, or Run to resume from that block.
- Step executes one visible block at a time and continues the current execution. Function and method calls enter the called flowchart.
- Auto Step repeatedly steps at the speed selected beneath the controls, from 1 to 10 steps per second. You can change the speed while it runs. Use Pause to preserve the current position.
- Run executes from the current position until completion, a breakpoint, or an input wait. The button stays labeled Run after stepping or pausing. Use Restart to reset execution to the beginning. Stop pauses a longer run while preserving its position, variables, and output. A successful return from `main` shows Completed.
- Select or hover over a block and use its breakpoint button to pause before that block executes. Run and Auto Step honor breakpoints. A breakpoint at `main` pauses before the first step. Pressing Run from a breakpoint executes that block once; loops can hit the breakpoint again on a later visit.
- Use Shift+Cmd/Ctrl+R to Restart, Shift+Space to Step, and Shift+Enter to Run. The same commands are available from the Run menu.
- Text/image loads and `ask()` submissions resume in the execution mode that started them. Stopping an execution prevents it from automatically continuing through subsequent blocks.
- Editing block code, moving or deleting blocks, changing wires, or changing imports resets execution. Selecting blocks and panning or zooming the canvas lets you inspect the program without restarting it.
- The Console reports execution status, executed-block count, and the active Flow name. The call-stack breadcrumb shows nested function and method calls, including recursion. The Console also shows runtime errors, Output lines, current variables, expandable object fields, and stable identities such as `Point #1`.
- The current node and the wire used to reach it are highlighted while stepping. The amber wire moves after every block and remains visible while waiting for input or after completion. Restart clears it. Variables changed by the most recent step are highlighted, and branch feedback shows the evaluated condition and result, such as `n > 0 → True`, along with the selected wire.
- Long multiline variable previews are shortened in the sidebar. Imported `image` and `turtle` libraries add draggable visual panels to the runtime sidebar. Drag either panel by its heading to reposition it, or double-click its canvas to enlarge it over the app. Use Close or Escape to return to the sidebar. Run, Step, and Restart keyboard shortcuts also work while a canvas is enlarged.
- FlowLab stops runaway execution after 1,000,000 executed blocks or 100 active nested calls.

## Use input

- The input queue contains one value per nonblank line.
- FlowLab parses numbers, `True`/`False`, quoted strings, lists, and dictionaries. Other text becomes an unquoted String.
- Input blocks consume the active flow's queue in order. Execution shows `Waiting` when that queue is empty.
- Function and Method arguments form a local input queue for that call. Place Input blocks at the start of the called flow to bind those arguments in order.
- The sidebar switches to the active queue while stepping inside a call.
- The input queue is editable before execution, immediately after Restart, after completion or an error, and when execution is waiting for queued input. During other active execution states it shows the active queue as read-only. Values typed while waiting in `main` are retained for the next Restart; a called function's queue belongs to that invocation.
- `ask()` opens an input dialog and parses the submitted value with the same rules as the input queue. A blank submission returns an empty String; in the queue, use `""` because blank lines are skipped.

## Menus and layout

- The FlowLab menu contains About, Reference, and Instructions. Reference opens the in-app function guide; Instructions opens the documentation in a separate tab.
- The File menu contains New, Clear, Save, Load, and Recover draft. New opens a separate blank FlowLab tab. Clear removes all blocks and wires from the current canvas while keeping its imports, input queue, document name, and settings. Use Undo to restore the cleared canvas. See [Saving and loading](saving-and-loading.md).
- The Edit menu contains Undo, Redo, Copy, Paste, Combine into Process, Split Process, Insert block on selected wire, and Clean up code.
- The Run menu duplicates Restart, Step, Auto Step/Pause, Run, and Stop from the Console.
- The Examples menu contains the eight programs summarized on the [documentation home page](../README.md).
- The left palette and right runtime sidebar scroll independently. On desktop, drag either sidebar divider to resize it, or focus the divider and use Left/Right arrow keys. Use the header buttons to hide either sidebar. On screens up to 1100 pixels wide, **Blocks**, **Canvas**, and **Console** tabs give each panel the full workspace. Canvas opens first and keeps Run, Step, and Restart/Stop visible; Console has the full controls, including Auto Step and its speed slider. Selecting a block in Blocks returns to Canvas for placement.
- Unused Imports starts collapsed; open its heading to enter libraries or programs. Special methods remains a collapsed reference.

## Keyboard shortcuts

Use Cmd on macOS and Ctrl on Windows/Linux for the shortcuts below. While typing in a text field, Copy, Paste, Undo, and Redo act on the text; use the Edit menu to apply those actions to the canvas instead.

| Action | Shortcut |
| --- | --- |
| Copy selected blocks and their internal wires | Cmd/Ctrl+C |
| Paste blocks | Cmd/Ctrl+V |
| Undo a canvas edit | Cmd/Ctrl+Z |
| Redo a canvas edit | Cmd/Ctrl+Shift+Z |
| Delete selected blocks or wires | Backspace or Delete |
| Run from the current position | Shift+Enter |
| Step once | Shift+Space |
| Restart at `main` | Cmd/Ctrl+Shift+R |
| Cancel block placement or quick add; close an enlarged canvas | Escape |

With a menu button focused, Up/Down opens the menu. Up/Down moves between available items, Home/End jumps to the first/last item, and Escape closes the menu and returns focus to its button.

---

[← Documentation home](../README.md) · [Next: Language reference →](language-reference.md)
