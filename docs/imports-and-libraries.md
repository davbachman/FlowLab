# Imports and native libraries

[Documentation home](../README.md) · [Getting started](getting-started.md) · [Language reference](language-reference.md) · [Classes and objects](classes-and-objects.md) · [Saving and loading](saving-and-loading.md)

## Contents

- [Add imports](#add-imports)
- [Resolve JSON imports](#resolve-json-imports)
- [Handle name conflicts](#handle-name-conflicts)
- [Text library](#text-library)
- [Turtle library](#turtle-library)

## Add imports

- Enter imports in the Imports panel one per line or comma-separated. The `.json` suffix is optional for FlowLab program files.
- The panel reports loading progress, resolved files and native libraries, available Classes and Functions, conflicts, and errors.
- A JSON import contributes its non-`main` Functions and its Classes with the Methods attached to those Classes.

## Resolve JSON imports

FlowLab resolves JSON names in this order:

1. The chosen programs folder.
2. Programs previously imported or exported in this browser.
3. A URL or relative path the browser can fetch.

Import a file once if the browser cannot otherwise find it by name. See [Saving and loading](saving-and-loading.md) for the programs-folder workflow.

## Handle name conflicts

- The current canvas wins any shared Function-or-Class name.
- Among JSON imports, the first listed Function or Class to claim a name wins.
- Only a winning imported Class contributes its Methods.
- A current-canvas Method wins over an imported Method with the same qualified name.
- FlowLab Functions and Classes take priority over same-named native-library functions, allowing a program to deliberately replace an imported command.

## Text library

Enter `text` in Imports to enable:

- `text_from_url(url)` loads a browser-readable URL and returns its contents as a String. The server must allow the browser request, including any required cross-origin permissions.
- `split_words(text)` splits a String on whitespace and returns a List of words.

Calling `text_from_url()` temporarily shows the loading state while the browser fetches the text.

## Turtle library

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

The turtle starts at `(0, 0)`, facing right, with its pen down. Put commands in Call blocks or Process lines to use them for their drawing side effects; if used in a larger expression they return `0`.

Step mode updates the drawing as each containing Call or Process block executes. Right-drag the Turtle panel to pan it, use Ctrl+wheel or a trackpad pinch to zoom, or pinch with two touch pointers.

---

[← Classes and objects](classes-and-objects.md) · [Next: Saving and loading →](saving-and-loading.md)
