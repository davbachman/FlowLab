# Saving and loading

[Documentation home](../README.md) · [Getting started](getting-started.md) · [Language reference](language-reference.md) · [Classes and objects](classes-and-objects.md) · [Imports and native libraries](imports-and-libraries.md)

## Contents

- [Start a new program](#start-a-new-program)
- [Save a program](#save-a-program)
- [Load a program](#load-a-program)
- [Recover unfinished work](#recover-unfinished-work)
- [Programs folders and later imports](#programs-folders-and-later-imports)
- [What a file preserves](#what-a-file-preserves)

## Start a new program

File > New opens a blank FlowLab instance in a new browser tab and leaves the current program untouched. Each document has its own draft address, so work in one tab does not replace another tab's recovery copy.

File > Clear removes all blocks and wires from the current canvas while preserving its imports, input queue, document name, and settings. It keeps the same document and draft address. Use Edit > Undo to restore the cleared canvas.

## Save a program

File > Save exports the current program as FlowLab JSON.

You can save unfinished programs, including programs with validation errors. The **Unsaved changes** indicator beside the document name clears after a successful save and returns when you change the program, its layout, imports, or input queue. Automatic browser recovery keeps a separate copy and does not clear this indicator.

- Browsers with folder access ask for a programs folder and filename, then reuse that folder for later exports and imports.
- Other browsers use a save-file picker or a normal JSON download.
- An exported program is also registered for later name-based imports in the current browser.

## Load a program

File > Load opens a FlowLab JSON program selected from the file picker. Saved Imports text and input queue values are restored before the loaded graph is validated.

Unfinished programs open with their validation errors displayed. Click an error to select and frame the affected block or open the Imports field. Fix the errors before running the program. JSON that is malformed or cannot be safely displayed is rejected, leaving the current canvas in place.

Loading replaces the current canvas, so save the current program first if you need to keep it.

## Recover unfinished work

FlowLab automatically keeps a recovery copy in the current browser as you edit. Reloading or reopening the same document address restores its blocks, connections, imports, input queue, and filename, including unfinished edits.

Use **File > Recover draft** to find other documents stored in this browser and reopen one. **File > New** always opens a fresh, blank document.

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

---

[← Imports and native libraries](imports-and-libraries.md) · [Documentation home →](../README.md)
