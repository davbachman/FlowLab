# Saving and loading

[Documentation home](../README.md) · [Getting started](getting-started.md) · [Language reference](language-reference.md) · [Classes and objects](classes-and-objects.md) · [Imports and native libraries](imports-and-libraries.md)

## Contents

- [Start a new program](#start-a-new-program)
- [Save a program](#save-a-program)
- [Load a program](#load-a-program)
- [Programs folders and later imports](#programs-folders-and-later-imports)
- [What a file preserves](#what-a-file-preserves)

## Start a new program

File > New removes all blocks and wires while leaving the Imports list and input queue intact. Clear those panels separately when you want an entirely empty session.

## Save a program

File > Save exports the current program as FlowLab JSON.

- Browsers with folder access ask for a programs folder and filename, then reuse that folder for later exports and imports.
- Other browsers use a save-file picker or a normal JSON download.
- An exported program is also registered for later name-based imports in the current browser.

## Load a program

File > Load opens a complete FlowLab JSON program selected from the file picker. Saved Imports text and input queue values are restored before the loaded graph is validated.

Loading replaces the current canvas, so save the current program first if you need to keep it.

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
