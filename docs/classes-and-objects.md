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

- A Class block contains only a name, for example `Point`.
- To initialize attributes from constructor arguments, connect its **init** handle to an Input block with one attribute name per line, such as `x` and `y`. You can also chain two single-line Input blocks. The init chain ends at the last Input; it needs no Return.
- Calling `p <- Point(2, 3)` creates a new instance and assigns the arguments to `x` and `y` in init wire order. Supply exactly one argument per init name.
- Init is optional. A Class named `Point` with an unconnected init handle can be instantiated as `Point()`, and its methods can create attributes later with assignments such as `self.x <- 2`.
- Class names and attribute names follow the [language's naming rules](language-reference.md#names-and-dictionary-keys). Init names must be unique, and `self` cannot be an init name. Function and Class names share one callable namespace.
- A Class is a declaration outside the executable flow: it has no incoming wire and connects to its init Inputs and optional Methods. Construct objects from an expression in `main` or another Function or Method.
- Attribute names appear in the init Inputs; attribute chips are no longer displayed in the Class block.
- Each attached Method has a small **−/+** button on its name tile in the Class block. Click **−** to hide the Method block and its flow, and **+** to restore them at their original positions. The init card has an independent **−/+** button for its Input chain. Classes stay visible, and hidden init Inputs still initialize attributes normally. Init and Method collapse settings are saved with the document and draft recovery. Removing a Class or an attachment wire reveals the affected blocks. Dragging a new wire from a collapsed init card expands it for text input.
- Fields may contain any FlowLab value, including Lists, Dictionaries, Images, or other objects.

## Attach and run methods

- Connect a Class block's dashed `+ method` handle to the top handle of a Method block.
- The Class block grows a named handle for every attached method and keeps a new `+ method` handle available.
- A Method block contains only the method name, for example `move`, because its incoming Class connection determines which class it belongs to.
- Each Method belongs to exactly one Class. Method names must be unique within that Class; different Classes may both have a Method named `move`.
- Connect the Method block's outgoing handle to the first executable step just as you would for a Function.
- Put Input blocks at the start of the method's flow to receive call arguments in order. For `p.move(5, -1)`, connect Method `move` to one Input block containing `dx` and `dy` on separate lines; these receive `5` and `-1`. Separate Input blocks also work. The receiver `self` is supplied automatically and needs no Input block.
- End the method with a Return block containing a value expression. Return `self` to return the updated receiver, an expression such as `Point(self.x + dx, self.y + dy)` to return a new object, or `0` when there is no useful result.
- Call methods with dot notation in expressions, Call blocks, or Process lines, such as `moved <- p.move(5, -1)` or `p.move(5, -1)`.
- An assignment keeps the returned value; a standalone call in a Call or Process block discards it. Changes to the object's fields remain in either case.
- Member access can chain through objects and method results, such as `wrapper.point.x` or `wrapper.get_point().x`.
- Classes and their attached Methods can also come from [imported FlowLab files](imports-and-libraries.md#add-imports).

## Work with fields and self

- Inside a method, read instance attributes with `self.x` and create or update them with `self.x <- value`. The class name itself is not an alias for `self`.
- From any flow, read an attribute with `p.x` and write it with `p.x <- 10`. Member assignment creates a missing attribute; reading a missing attribute is an error. Each instance has its own attributes.
- For example, a `Point.move` flow can read `dx` and `dy` with Input blocks, then execute `self.x <- self.x + dx` and `self.y <- self.y + dy` in Process blocks.
- Bare names refer only to arguments and local variables. `x <- value` always assigns a local variable, even if the instance has an attribute named `x`. Reading `x` before a local value is assigned is an error; attributes are never looked up implicitly.
- `self` is always the object that received the call and cannot be replaced by an Input block, Process assignment, or For block.
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

Inside the owning Method, use the same sequence with `self.items` in place of `p.items` to read and write the attribute explicitly. For a nested object, first read it into a local variable, such as `child <- self.child`, then use `child.x <- value`.

## Object identity and equality

- Assigning an object to another variable creates an alias, not a copy.
- After `q <- p`, both variables display the same stable identity, such as `Point #1`, and changes through either name are shared.
- Without `__eq__`, object equality is based on identity. Two separately constructed objects are unequal even when every field contains an equal value.
- The Variables panel does not invoke special methods. It passively shows stable class-and-identity labels and expandable fields.
- A Class without `__repr__` uses structural Output such as `Point #1 {x: 2, y: 3}`.

## Special methods

Special methods are ordinary Method blocks attached to a Class, but FlowLab also calls them for the corresponding operation. Their names are exact and case-sensitive. The left palette includes a collapsed Special methods quick reference.

| Attached Method | Input variables | Required return | Automatic use |
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

- Binary operators use only the left object's special method and pass the right value through the Method's single Input variable, in an Input block connected directly after the Method. Additional Input lines are not allowed for these special methods. Reflected right-side methods are not supported.
- Missing equality methods fall back to identity. Missing ordered-comparison or arithmetic methods produce an error.
- Special comparison dispatch applies only when an object is a direct operand. Lists and dictionaries retain deep container equality, with nested objects compared by identity rather than by calling their comparison methods.
- Special methods can be called explicitly, such as `p.__repr__()` or `p.__add__(q)`, with the same Input and return contracts.
- String concatenation does not invoke `__repr__`; write `"point: " + p.__repr__()` explicitly.
- Keep special methods side-effect-free because operators and Output invoke them implicitly.
- When stepping, FlowLab enters a special Method's flow just as it does for an explicit method call, provided its Class is defined on the current canvas. Methods from imported Classes execute within the calling step and keep their internal computation hidden.
- Directly re-entering the same special method on the same receiver is rejected as recursion. A special method may call a different special method, so `__le__` can compose `__lt__` and `__eq__`.

Use the Flow status while stepping to see whether execution is in `main`, a function, or a qualified method such as `Point.move` or `Point.__add__`.

## Current limitations

Classes do not support inheritance, access modifiers and private members, static members, same-name method overloads, or reflected and in-place operators. Init connections currently contain only Input blocks; other initialization work can be performed by a Method.

---

[← Language reference](language-reference.md) · [Next: Imports and native libraries →](imports-and-libraries.md)
