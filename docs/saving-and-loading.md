# Saving and loading

[Documentation home](../README.md) · [Getting started](getting-started.md) · [Language reference](language-reference.md) · [Classes and objects](classes-and-objects.md) · [Imports and native libraries](imports-and-libraries.md)

## Contents

- [Start a new program](#start-a-new-program)
- [Clear the current canvas](#clear-the-current-canvas)
- [Save a program](#save-a-program)
- [Load a program](#load-a-program)
- [Recover unfinished work](#recover-unfinished-work)
- [Programs folders and later imports](#programs-folders-and-later-imports)
- [What a file preserves](#what-a-file-preserves)

## Start a new program

File > New opens a blank FlowLab instance in a new browser tab and leaves the current program untouched. Each document has its own draft address, so work in one tab does not replace another tab's recovery copy.

## Clear the current canvas

File > Clear removes all blocks and wires from the current canvas while preserving its imports, input queue, document name, and settings. It keeps the same document and draft address. Clear is disabled when the canvas is already empty.

Clearing stops the current execution. Use Edit > Undo to restore the blocks and wires, ready to run from the beginning; Redo clears them again. The cleared canvas is saved to browser recovery like any other edit.

## Save a program

File > Save exports the current program as FlowLab JSON.

You can save unfinished programs, including programs with validation errors. The **Unsaved changes** indicator beside the document name clears after a successful save and returns when you change the program, its layout, imports, or input queue. Automatic browser recovery keeps a separate copy and does not clear this indicator.

An untouched new document shows **Local draft** in the header. **Saved to file** means the document matches its last load or save; **Unsaved changes** means it has edits that have not been saved to a file. A separate **Recovery saved** message reports the browser recovery copy. Selecting blocks, changing the canvas view, and running the program do not by themselves make the saved program dirty.

- Browsers with folder access ask for a programs folder and filename, then reuse that folder for later exports and imports.
- Other browsers use a save-file picker or a normal JSON download.
- An exported program is also registered for later name-based imports in the current browser.
- Saving with a filename updates the document name shown in the header. FlowLab adds the `.json` extension when needed.

## Load a program

File > Load opens a FlowLab JSON program selected from the file picker. Saved Imports text and input queue values are restored before the loaded graph is validated.

Older files that omit Imports or the input queue retain the current values for those fields. Loading resets execution and fits the loaded graph into view. Use Undo to restore the previous graph and its document settings.

Unfinished programs open with their validation errors displayed. Click an error to select and frame the affected block or open the Imports field. Fix the errors before running the program. JSON that is malformed or cannot be safely displayed is rejected, leaving the current canvas in place.

Loading replaces the current canvas, so save the current program first if you need to keep it.

## Recover unfinished work

FlowLab automatically keeps a recovery copy in the current browser as you edit. Reloading or reopening the same document address restores its blocks, connections, imports, input queue, and filename, including unfinished edits.

Use **File > Recover draft** to find other documents stored in this browser, listed with their names and last-updated times, and reopen one. Switching to a loaded file, example, or recovered draft keeps a recovery copy of the previous work. **File > New** always opens a fresh, blank document.

Browser recovery is separate from a saved JSON file. It is specific to this browser and can be removed by clearing site data. Use **File > Save** for a portable copy you can keep or share. If browser storage is unavailable or full, FlowLab displays a message so you can save to a file.

## Programs folders and later imports

When the browser supports folder access, the first Save can establish a programs folder. FlowLab reuses that folder to resolve later program imports by name.

Import resolution also remembers programs previously imported or exported in the browser, then falls back to a URL or browser-readable relative path. See [Imports and native libraries](imports-and-libraries.md) for the full resolution and conflict rules.

## What a file preserves

FlowLab JSON saves:

- Block positions, widths, types, and text
- Wires and branch labels
- Block comments
- The Imports list
- The input queue

Files and browser recovery store the program, not a paused execution. Output, current variables, breakpoints, undo history, execution speed, and sidebar/canvas view settings are not saved in the JSON program; reopening it starts a fresh execution.

---

[← Imports and native libraries](imports-and-libraries.md) · [Documentation home →](../README.md)
