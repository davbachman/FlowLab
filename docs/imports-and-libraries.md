# Imports and native libraries

[Documentation home](../README.md) · [Getting started](getting-started.md) · [Language reference](language-reference.md) · [Classes and objects](classes-and-objects.md) · [Saving and loading](saving-and-loading.md)

## Contents

- [Add imports](#add-imports)
- [Resolve JSON imports](#resolve-json-imports)
- [Handle name conflicts](#handle-name-conflicts)
- [Math library](#math-library)
- [Text library](#text-library)
- [Image library](#image-library)
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

Angles passed to trigonometric functions and returned by inverse trigonometric functions are measured in radians. The inputs to `asin` and `acos` must be from -1 through 1, and logarithms require positive inputs.

## Text library

Enter `text` in Imports to enable:

- `text_from_url(url)` loads a browser-readable URL and returns its contents as a String. The server must allow the browser request, including any required cross-origin permissions.
- `split_words(text)` splits a String on whitespace and returns a List of words.
- `chr(code)` returns the one-character String for an integer Unicode code point from 0 through 1,114,111.
- `ord(character)` returns the integer Unicode code point for a String containing exactly one Unicode character.

Calling `text_from_url()` temporarily shows the loading state while the browser fetches the text.

## Image library

Enter `image` in Imports to enable opaque Image values and the Image runtime panel.

| Call | Result or effect |
| --- | --- |
| `imread(url)` | Loads a browser-readable image URL and returns a new Image. |
| `imsave(image, filename)` | Downloads the current image pixels as a PNG. A missing `.png` suffix is added. |
| `imshow(image)` | Displays the image in the Image panel and returns the same Image. |
| `image_from_pixels(rows)` | Creates an Image from a rectangular list of pixel rows. |
| `image_to_pixels(image)` | Returns the pixels as rows of `[red, green, blue, alpha]` lists. |
| `imsize(image)` | Returns `[width, height]`. |
| `get_pixel(image, x, y)` | Returns one `[red, green, blue, alpha]` pixel. |
| `set_pixel(image, x, y, color)` | Changes one pixel and returns the same Image. |

Pixel coordinates are zero-based: `(0, 0)` is the upper-left corner, `x` increases to the right, and `y` increases downward. Color channels must be integers from 0 through 255. `image_from_pixels` and `set_pixel` accept RGB lists such as `[255, 0, 0]` or RGBA lists such as `[255, 0, 0, 128]`; omitted alpha defaults to 255. `image_to_pixels` and `get_pixel` always return RGBA.

Images have identity and are shown in Variables as labels such as `Image #1 (640 × 480)`. Assignment creates an alias, so after `copy <- photo`, calling `set_pixel(copy, ...)` also changes `photo`. Use `image_to_pixels` followed by `image_from_pixels` when a separate Image is needed.

`imread` pauses execution while the browser downloads and decodes the file. The server must allow the browser request, including any required cross-origin permissions. An Image may contain at most 16,777,216 pixels. The Image panel remains empty until `imshow` is called.

Example:

```text
photo <- imread("https://example.edu/photo.png")
size <- imsize(photo)
set_pixel(photo, 0, 0, [255, 0, 0])
imshow(photo)
imsave(photo, "edited-photo.png")
```

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
