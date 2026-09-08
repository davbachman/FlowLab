# Classes and objects

[Documentation home](../README.md) · [Getting started](getting-started.md) · [Language reference](language-reference.md) · [Imports and native libraries](imports-and-libraries.md) · [Saving and loading](saving-and-loading.md)

## Contents

- [Declare a class](#declare-a-class)
- [Attach and run methods](#attach-and-run-methods)
- [Work with fields and self](#work-with-fields-and-self)
- [Object identity and equality](#object-identity-and-equality)
- [Special methods](#special-methods)
- [Current limitations](#current-limitations)

## Declare a class

- A Class block declares a class name and its ordered fields with `ClassName(field1, field2)`, for example `Point(x, y)`.
- Zero-field declarations such as `Marker()` are valid.
- Class names and field names follow the [language's naming rules](language-reference.md#names-and-dictionary-keys). Field names must be unique, and `self` cannot be a field name. Function and Class names share one callable namespace.
- A Class is a declaration outside the executable flow: it has no incoming wire and connects only to its Methods. Construct objects from an expression in `main` or another Function or Method.
- Calling the class name constructs a new object and initializes the fields positionally. Supply exactly one argument per declared field. For example, `p <- Point(2, 3)` creates a `Point` whose `x` is `2` and `y` is `3`; `Marker()` takes no arguments.
- Fields may contain any FlowLab value, including Lists, Dictionaries, Images, or other objects.

## Attach and run methods

- Connect a Class block's dashed `+ method` handle to the top handle of a Method block.
- The Class block grows a named handle for every attached method and keeps a new `+ method` handle available.
- A Method block contains only the method name, for example `move`, because its incoming Class connection determines which class it belongs to.
- Each Method belongs to exactly one Class. Method names must be unique within that Class; different Classes may both have a Method named `move`.
- Connect the Method block's outgoing handle to the first executable step just as you would for a Function.
- Put Input blocks at the start of the method's flow to receive call arguments in order. For `p.move(5, -1)`, connect Method `move` to Input `dx`, then Input `dy`; these receive `5` and `-1`. The receiver `self` is supplied automatically and needs no Input block.
- End the method with a Return block containing a value expression. Return `self` to return the updated receiver, an expression such as `Point(x + dx, y + dy)` to return a new object, or `0` when there is no useful result.
- Call methods with dot notation in expressions, Call blocks, or Process lines, such as `moved <- p.move(5, -1)` or `p.move(5, -1)`.
- An assignment keeps the returned value; a standalone call in a Call or Process block discards it. Changes to the object's fields remain in either case.
- Member access can chain through objects and method results, such as `wrapper.point.x` or `wrapper.get_point().x`.
- Classes and their attached Methods can also come from [imported FlowLab files](imports-and-libraries.md#add-imports).

## Work with fields and self

- Inside a method, declared fields can be read and written by bare name.
- From any flow, read a declared field with `p.x` and write it with `p.x <- 10`. Reading or assigning an undeclared field is an error.
- For example, a `Point.move` flow can read `dx` and `dy` with Input blocks, then execute `x <- x + dx` and `y <- y + dy` in Assignment or Process blocks.
- Bare List and Dictionary fields support indexed assignment inside a Method, such as `items[i] <- value`.
- A bare field that contains an object can also be the target of a member assignment.
- Local names take priority over field names. An Input, loop variable, or existing local with the same name shadows that field; use `self.x` to refer to the field explicitly.
- `self` is always the object that received the call and cannot be replaced by an Input, Assignment, Process assignment, or For block.
- `self` remains available when a method needs the whole receiver, such as `Return self`, or explicit field access such as `self.x`.
- To call another method on the same object, use `self.methodName(...)`, such as `self.move(1, 0)`.

Assignment targets support one member or index after a name. Reading `wrapper.point.x` or `p.items[0]` works, but writing those chained forms directly does not. Use an intermediate name for a nested object:

```text
point <- wrapper.point
point.x <- 10
```

For a List or Dictionary field, update the collection and assign it back:

```text
items <- p.items
items[0] <- 10
p.items <- items
```

Inside the owning Method, `items[0] <- 10` updates an unshadowed field directly.

## Object identity and equality

- Assigning an object to another variable creates an alias, not a copy.
- After `q <- p`, both variables display the same stable identity, such as `Point #1`, and changes through either name are shared.
- Without `__eq__`, object equality is based on identity. Two separately constructed objects are unequal even when every field contains an equal value.
- The Variables panel does not invoke special methods. It passively shows stable class-and-identity labels and expandable fields.
- A Class without `__repr__` uses structural Output such as `Point #1 {x: 2, y: 3}`.

## Special methods

Special methods are ordinary Method blocks attached to a Class, but FlowLab also calls them for the corresponding operation. Their names are exact and case-sensitive. The left palette includes a collapsed Special methods quick reference.

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
| `__floordiv__` | Exactly one, connected directly after the Method | Any FlowLab value | `//` |
| `__mod__` | Exactly one, connected directly after the Method | Any FlowLab value | `%` |
| `__neg__` | None | Any FlowLab value | Unary `-`, as in `-p` |

- Binary operators use only the left object's special method and pass the right value through the Method's single Input block. Reflected right-side methods are not supported.
- Missing equality methods fall back to identity. Missing ordered-comparison or arithmetic methods produce an error.
- Special comparison dispatch applies only when an object is a direct operand. Lists and dictionaries retain deep container equality, with nested objects compared by identity rather than by calling their comparison methods.
- Special methods can be called explicitly, such as `p.__repr__()` or `p.__add__(q)`, with the same Input and return contracts.
- String concatenation does not invoke `__repr__`; write `"point: " + p.__repr__()` explicitly.
- Keep special methods side-effect-free because operators and Output invoke them implicitly.
- When stepping, FlowLab enters a special Method's flow just as it does for an explicit method call.
- Directly re-entering the same special method on the same receiver is rejected as recursion. A special method may call a different special method, so `__le__` can compose `__lt__` and `__eq__`.

Use the Flow status while stepping to see whether execution is in `main`, a function, or a qualified method such as `Point.move` or `Point.__add__`.

## Current limitations

Classes do not support inheritance, access modifiers and private members, static members, same-name method overloads, reflected and in-place operators, custom constructors, or fields that were not declared in the Class block.

---

[← Language reference](language-reference.md) · [Next: Imports and native libraries →](imports-and-libraries.md)
