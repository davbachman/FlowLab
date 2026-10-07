# Imports and native libraries

[Documentation home](../README.md) · [Getting started](getting-started.md) · [Language reference](language-reference.md) · [Classes and objects](classes-and-objects.md) · [Saving and loading](saving-and-loading.md)

## Contents

- [Add imports](#add-imports)
- [Look up available functions](#look-up-available-functions)
- [Resolve JSON imports](#resolve-json-imports)
- [Handle name conflicts](#handle-name-conflicts)
- [Math library](#math-library)
- [Text library](#text-library)
- [Image library](#image-library)
- [Turtle library](#turtle-library)

## Add imports

- Open the Imports heading in the Blocks sidebar and enter imports one per line or comma-separated, for example `math, text, helpers`. The `.json` suffix is optional for FlowLab program files. Native library names are case-insensitive; use the function names exactly as listed below.
- For a library saved on your computer, choose **Add library…** under Imports and select its FlowLab JSON file from Downloads or any other folder. FlowLab validates the file, adds its name to Imports, and makes its Functions and Classes available while keeping the current canvas and input queue. Select the file again to use an updated copy; its name is not added twice. Invalid files leave the current library unchanged. The names `math`, `text`, `image`, and `turtle` are reserved for built-in libraries, so use another filename for your own library.
- The panel reports loading progress, resolved files and native libraries, available Classes and Functions, conflicts, and errors.
- A JSON import contributes its non-`main` Functions and its Classes with the Methods attached to those Classes.
- Imported calls run as part of the calling block in Step and Auto Step. Their internal blocks, local variables, branches, and call stack stay hidden during execution, just like native library calls. Results, output, and runtime errors remain visible. Input requests still pause execution, and Stop can interrupt a long call. To step through a library's implementation, open its FlowLab file as the current program.

## Look up available functions

Choose **FlowLab → Reference** for an in-app list of available function signatures and descriptions. It groups the always-available core functions, functions defined on the current canvas, and functions from imported libraries and JSON files. The Available libraries section lists the four native libraries and resolved JSON imports, with their import status. Add a native library in Imports to see its functions in the reference.

A comment on a Function block serves as its docstring. Right-click the Function block and enter its description in **Block comment**. The reference displays that comment, preserving line breaks, for functions on the current canvas and functions imported from a saved library. Functions without a comment keep the default description. After editing a library’s comments, save it and reload the library to see the updated docstrings.

## Resolve JSON imports

FlowLab resolves JSON names in this order:

1. A file explicitly selected with **Add library…** in the current tab.
2. The chosen programs folder.
3. Programs previously added, loaded, or saved in this browser.
4. A URL or relative path the browser can fetch.

Downloading a program does not give FlowLab access to your Downloads folder. Use **Add library…** to select a file it cannot find by name. A copy is kept in browser storage when available; external edits to the file are picked up when you select it again. See [Saving and loading](saving-and-loading.md) for the programs-folder workflow.

Imported JSON must be a valid, complete FlowLab program, including its own `main` and Return, even though its `main` is not imported. Its saved Imports list is not resolved recursively. Each imported file is validated on its own, so calls to another file or a native library can prevent it from loading; its call targets must be defined in that file or be [core functions](language-reference.md#calls-and-built-ins).

## Handle name conflicts

- The current canvas wins any shared Function-or-Class name.
- Among JSON imports, the first listed Function or Class to claim a name wins.
- Only a winning imported Class contributes its Methods.
- A current-canvas Method wins over an imported Method with the same qualified name.
- FlowLab Functions and Classes take priority over same-named native-library functions, allowing a program to deliberately replace an imported command.

## Math library

Enter `math` in Imports to enable:

| Call | Result |
| --- | --- |
| `exp(number)` | Returns e raised to the given Number. |
| `log(number)` | Returns the natural logarithm of a positive Number. |
| `log10(number)` | Returns the base-10 logarithm of a positive Number. |
| `sin(radians)` | Returns the sine of an angle measured in radians. |
| `cos(radians)` | Returns the cosine of an angle measured in radians. |
| `tan(radians)` | Returns the tangent of an angle measured in radians. |
| `asin(number)` | Returns an angle in radians whose sine is the given Number. |
| `acos(number)` | Returns an angle in radians whose cosine is the given Number. |
| `atan(number)` | Returns an angle in radians whose tangent is the given Number. |
| `atan2(y, x)` | Returns the angle in radians from the positive x-axis to `(x, y)`. |

Angles passed to trigonometric functions and returned by inverse trigonometric functions are measured in radians. The inputs to `asin` and `acos` must be from -1 through 1, and logarithms require positive inputs. All arguments must be finite Numbers; `exp` reports an error if its result exceeds the supported Number range.

For a degree-based calculation, place these lines in a Process block after importing `math`:

```text
pi <- acos(-1)
angle <- 30 * pi / 180
height <- 10 * sin(angle)
```

## Text library

Enter `text` in Imports to enable:

- `text_from_url(url)` loads a browser-readable URL and returns its contents as a String. The server must allow the browser request, including any required cross-origin permissions.
- `split_words(text)` splits a String on whitespace and returns a List of words.
- `chr(code)` returns the one-character String for an integer Unicode code point from 0 through 1,114,111.
- `ord(character)` returns the integer Unicode code point for a String containing exactly one Unicode character.

Calling `text_from_url(url)` temporarily shows the loading state while the browser fetches the text. `split_words` ignores surrounding whitespace and returns `[]` for an empty or whitespace-only String. Unicode conversion counts code points: `ord("🙂")` is `128578`, while a letter followed by a separate combining accent contains two code points and is rejected.

Example Process block after importing `text`:

```text
words <- split_words("  red green blue  ")
letter <- chr(65)
code <- ord(letter)
```

The results are `["red", "green", "blue"]`, `"A"`, and `65`.

## Image library

Enter `image` in Imports to enable opaque Image values and the Image runtime panel.

| Call | Result or effect |
| --- | --- |
| `imload()` | Returns a new Image from a local file, prompting on the first use of each call. Reuses the choice across reruns while this program is open. Takes no arguments. |
| `imread(url)` | Loads a browser-readable image URL and returns a new Image. |
| `imsave(image, filename)` | Downloads the current image pixels as a PNG and returns the same Image. A missing `.png` suffix is added. |
| `imshow(image_or_rows)` | Displays an Image or rectangular pixel rows in the Image panel. Returns the existing Image, or a new Image when given rows. |
| `image_from_pixels(rows)` | Creates an Image from rectangular rows of grayscale values, RGB lists, or RGBA lists. |
| `image_to_pixels(image)` | Returns `pixels[row][col]`, with each pixel a `[red, green, blue, alpha]` list. |
| `imsize(image)` | Returns `[rows, columns]`. |
| `get_pixel(image, row, col)` | Returns the `[red, green, blue, alpha]` pixel at that row and column. |
| `set_pixel(image, row, col, color)` | Changes the pixel at that row and column and returns the same Image. |

All image functions use row, column order. Pixel indices are integers within the image bounds and are zero-based: `(0, 0)` is the upper-left corner, rows increase downward, and columns increase to the right. `imsize(image)` returns `[rows, columns]` (height, width), and `get_pixel(image, row, col)` matches `image_to_pixels(image)[row][col]`. Color channels must be integers from 0 through 255. `image_from_pixels` and `set_pixel` accept RGB lists such as `[255, 0, 0]` or RGBA lists such as `[255, 0, 0, 128]`; omitted alpha defaults to 255. `image_to_pixels` and `get_pixel` always return RGBA. Pixel rows must be nonempty and all have the same length.

`imshow` and `image_from_pixels` accept two kinds of nested lists:

- Grayscale: `rows[row][col]` is an integer from 0 through 255. Zero is black, 255 is white, and intermediate values are gray. Values use this fixed range and are never automatically rescaled.
- Color: `rows[row][col]` is an RGB or RGBA list, such as `[255, 0, 0, 128]`. Use square brackets for the three or four channels.

Do not mix scalar grayscale values and color lists in one image. Grayscale pixels become `[value, value, value, 255]`, so `get_pixel` and `image_to_pixels` still return RGBA. Converting or displaying rows copies their values; later edits to the original list do not change the Image. `imshow` accepts an existing Image as before.

These Process block calls display a grayscale image and then a color image:

```text
gray <- imshow([[0, 128, 255], [255, 128, 0]])
color <- imshow([[[255, 0, 0, 255], [0, 0, 255, 128]]])
imsave(color, "color.png")
```

Images have identity and are shown in Variables as labels such as `Image #1 (640 × 480)`. Assignment creates an alias, so after `copy <- photo`, calling `set_pixel(copy, ...)` also changes `photo`. Use `image_to_pixels` followed by `image_from_pixels` when a separate Image is needed.

`imload()` pauses execution at a Load image prompt the first time each call is reached. Choose a PNG or another browser-supported image file to resume with its decoded pixels; the file stays on your computer. Closing the file chooser leaves the prompt open so you can choose again. Cancel in the prompt (or Escape) ends the run with an image-loading cancellation message. An unreadable or oversized image produces an error at the calling block.

After a successful load, FlowLab remembers that call’s file for reruns, Restart, and repeated calls in loops. Each load starts from the original file pixels, so edits made during one run do not carry over. Separate `imload()` calls can remember different files. Choose **Forget selected images** in the Image panel while execution is idle to pick replacements on the next run. Reloading the page or opening another program clears the choices; image files are not included in saved program JSON. Changing or moving a load expression can also require a new choice.

`imread` pauses execution while the browser downloads and decodes the file. The server must allow the browser request, including any required cross-origin permissions. An Image may contain at most 16,777,216 pixels. The Image panel remains empty until `imshow` is called. Drag the panel by its heading to reposition it in the runtime sidebar, or double-click a displayed image to enlarge it over the app. Choose Close or press Escape to leave the enlarged view.

This Process block creates and edits a two-pixel image without downloading a source file:

```text
photo <- image_from_pixels([[[255, 0, 0], [0, 0, 255]]])
size <- imsize(photo)
set_pixel(photo, 0, 0, [0, 255, 0])
imshow(photo)
imsave(photo, "edited-photo.png")
```

`size` is `[1, 2]` (one row and two columns). To edit a saved picture, replace the first line with `photo <- imload()`. To load from the web, use `photo <- imread("your-image-url")` with a browser-readable image URL.

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
| `color(text)` | Set the line color from a browser color String, such as `"red"` or `"#008080"`. |
| `home()` | Draw or move to `(0, 0)` and face right. |
| `clear()` | Erase drawn segments without moving or turning the turtle. |

The turtle starts at `(0, 0)`, facing right, with its pen down. Positive `x` points right and positive `y` points up. Turtle turns use degrees, unlike the math library's radians. Put commands in Call blocks or Process lines to use them for their drawing side effects; if used in a larger expression they return `0`.

Step mode updates the drawing as each containing Call or Process block executes. Right-drag the Turtle canvas to pan it, use Ctrl+wheel or a trackpad pinch to zoom, or pinch with two touch pointers. Drag the panel by its heading to reposition it in the runtime sidebar, or double-click the canvas to enlarge it over the app. Choose Close or press Escape to leave the enlarged view.

The turtle's `clear()` command erases its drawing. **File → Clear** removes the flowchart's blocks and wires; it keeps the `turtle` import.

---

[← Classes and objects](classes-and-objects.md) · [Next: Saving and loading →](saving-and-loading.md)
