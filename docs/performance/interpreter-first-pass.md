# Interpreter performance: conservative first pass

Measured November 2, 2026 against clean baseline commit `1dd2078`. All fixtures
are synthetic development programs in `scripts/benchmarks/`; no coursework,
solutions, graders, or hidden tests were used.

## Implementation and compatibility boundaries

Inspection confirmed that `evaluateExpression` parsed its source on every
evaluation, including when reevaluating a suspended expression. Node advancement
filtered the complete edge array; function dispatch searched nodes; constructor
calls parsed Class declarations and traversed init Inputs; operator and repr
dispatch repeatedly resolved Method attachment edges and Class names.

`runtimePreparation.ts` now maintains weakly owned indexes per Program object and
executable revision. It indexes nodes, ordered outgoing edges, Functions, Classes
and their ordered constructor attributes, and attached Methods. Imported
definition arrays get their own weakly owned name indexes, keeping simultaneous
executions with different imports separate. First matches and wire order retain
the original array-search semantics. Resolution precedence and Class ownership
remain in the existing interpreter dispatch code.

Expressions compile to private, closed-over syntax trees. Assignment structures,
For headers, Input bindings, and split Process/Output lines are cached lazily.
Each syntax cache is capped at 1,024 entries and discarded on revision change.
Syntax preparation does not evaluate expressions or pre-run calls. Parse failures
are still raised at the original execution point and wrapped with the existing
source-line errors. The public `parseExpression` still returns an independent
tree, and `evaluateExpression` retains its existing signature and behavior.

Revision checks compare ordered node identities, IDs, types, text, edge identities,
IDs, endpoints, labels, and imports. This detects replacement and in-place edits.
Positions, comments, and display dimensions do not invalidate syntax. Checks run
at public Step, Run, and asynchronous resumption boundaries. Synchronous headless
Run prepares once; individual public Steps, including those used by chunked Run,
check again. No revision bookkeeping is added to project or execution JSON.

Each evaluation still creates fresh `ExpressionProgress`, with its own completed
calls, member reads, and random values. Suspended progress retains its original
source and site numbering, including across revision invalidation. Lists and
Dictionaries are allocated during evaluation, and aliases from the environment
retain their identity. No values, operator results, member reads, repr results,
or execution progress live in syntax caches.

The editor already clears execution when executable blocks, wiring, or resolved
imports change. That behavior remains unchanged. Headless callers can edit a
paused Program in place; lookup/syntax revisions refresh on the next API call.
Imported bindings remain the execution's existing definition snapshot, as before;
to resolve a different import set, call `createExecution` with the new imports.
Import content edits/new executions cannot reuse another Program's node-ID index.

No changes were made to validation, version 1 JSON, language rules, existing
headless API signatures/state fields, debugger logic, object storage, garbage
collection, scheduling, or the execution architecture.

## Measurements

Environment: Apple M4, macOS arm64, Node v25.6.0, Vite SSR using the checkout's
installed dependencies. Baseline and optimized runs used identical unchanged
programs, inputs, options, and environment. Each sample starts from fresh cloned
program/import JSON and includes `createExecution` validation and complete
execution. Each workload has two warmups and five measured samples; tables show
medians in milliseconds. Benchmarks ran serially without simultaneous tests or
builds. Full sample timings are in
[`interpreter-first-pass-results.json`](interpreter-first-pass-results.json).

Headless `runExecution`, with debugger feedback disabled:

| Workload | Before ms | After ms | Time reduction | Logical steps, both |
| --- | ---: | ---: | ---: | ---: |
| Procedural loop, 20,000 iterations | 47.90 | 17.89 | 62.6% | 40,005 |
| Recursive Fibonacci, n = 16 | 32.83 | 26.67 | 18.8% | 12,774 |
| Mutating object, 3,000 calls with an alias | 45.39 | 37.62 | 17.1% | 18,004 |
| Two imported libraries with overlapping IDs | 44.67 | 38.70 | 13.4% | 16,004 |
| Object Mandelbrot, 51 × 51, limit 30 | 1,877.17 | 1,500.78 | 20.1% | 187,253 |

The app's `runExecutionChunk` path, with debugger feedback disabled, 10,000-step
chunks, and an infinite time budget to remove wall-clock yield variability:

| Workload | Before ms | After ms | Time reduction | Logical steps, both |
| --- | ---: | ---: | ---: | ---: |
| Procedural loop | 54.21 | 26.65 | 50.8% | 40,005 |
| Recursive Fibonacci | 40.26 | 36.21 | 10.1% | 12,774 |
| Mutating object | 52.84 | 44.70 | 15.4% | 18,004 |
| Imported libraries | 57.91 | 56.66 | 2.1% | 16,004 |
| Object Mandelbrot | 2,064.77 | 1,751.90 | 15.2% | 187,253 |

The small imported-library chunk difference is within plausible timing noise;
it is not evidence of a dependable speedup for every imported workload. These
are interpreter measurements, not end-to-end browser frame/rendering timings.

Mandelbrot samples cover real coordinates [-2, 1] and imaginary coordinates
[-1.5, 1.5], including endpoints. Each pixel starts with `z = Complex(0, 0)`;
the loop tests `n < 30 and z.real * z.real + z.imag * z.imag <= 4`, then executes
the unchanged overloaded expression `z <- z * z + c`. Both `__mul__` and
`__add__` return new Complex instances. There are 22,080 calls to each operator
and 49,362 total objects. Pixels use grayscale `n * 255 // 30`, with alpha 255.

Every baseline/optimized comparison includes the **entire** environment, object
heap, return value, output, object-ID count, logical step count, and every image
pixel byte. All 10,404 Mandelbrot RGBA bytes match. SHA-256:
`cc1372e6db5b652bfbfc49a8c14e89a03409b091bd4384c39d0138d9cb912cb3`.
The benchmark export preserves negative zero and nonfinite numbers explicitly;
ordinary JSON would otherwise conceal numeric differences.

## Regression and differential checks

The original suite passed all 716 tests before changes. The final suite adds 22
focused regressions covering syntax reuse, fresh nested literal values, supplied
aliases, side-effect ordering, short circuiting, bounded eviction, text/wire/label/
ownership/constructor/import invalidation, overlapping imported IDs and names,
local overrides, simultaneous import sets, legacy Assignment/inline-Class JSON,
For/Input reuse, operator and repr effects, ask/text/image suspension, queue
replenishment, source lines, step counts, breakpoints, and paused states.
Final validation: **738 tests pass in 38 files**; production build and ESLint pass.

The differential harness compares complete state snapshots against baseline
after every API action in 13 scenarios, each in Run, raw Step, debugger Step, and
breakpoint/chunk modes. A seeded random sequence, fixed ask answers, queued
inputs, and supplied text/image loads control all external inputs. All **980
snapshots match**, including random draw counts, pending expressions, heap
identity references, changed-variable feedback, wire/branch feedback, hidden
steps, call stacks, errors and source locations, and execution limits.

No behavior differences were observed in these checks. This is finite synthetic
and existing-test coverage, not proof for every possible saved project. Normal
browser scheduling, real network/image decoding latency, and long-session memory
retention were not benchmarked. Existing debugger/Stop UI regression tests run in
the app test suite; debugger and Stop implementation were not changed.

## Deferred object-storage finding

Inspection confirmed full-table spreads at both object construction and field
updates. `profile-interpreter.mjs` instruments only a temporary source copy,
timing those existing blocks without substituting another storage scheme.
One warmup and three recorded runs were collected for each revision/workload.

Mandelbrot performs 49,362 heap-table copies, touching
`49,362 × 49,361 / 2 = 1,218,278,841` preexisting table entries. The timed creation
block (spread plus instance/field construction) takes 993–1,037 ms in baseline
runs and 977–1,008 ms in optimized runs: about 54–55% and 66–67% of those
instrumented totals respectively. There are no field updates in this workload.
The mutating-object fixture has only one object: its 3,000 field updates copy
3,000 table entries total and take about 0.42–0.59 ms in these runs.

Instrumentation and timer overhead perturb absolute timings, and entry counts
are not bytes or a measurement of allocation/GC costs. Nevertheless, the scaling
and measured block time identify heap copying as a substantial remaining cost in
this object-heavy workload. Object storage and its snapshot/alias semantics need
their own follow-up; no such changes are included here.

## Reproduce

Run from the repository root with the installed lockfile dependencies. Extract
the baseline source to a temporary directory; this does not modify the checkout:

```sh
mkdir -p /private/tmp/flowlab-baseline
git archive 1dd2078 src/lib | tar -x -C /private/tmp/flowlab-baseline

node scripts/benchmark-interpreter.mjs --source /private/tmp/flowlab-baseline --warmups 2 --repeats 5 --output /private/tmp/before.json
node scripts/benchmark-interpreter.mjs --warmups 2 --repeats 5 --compare /private/tmp/before.json --output /private/tmp/after.json

node scripts/benchmark-interpreter.mjs --source /private/tmp/flowlab-baseline --mode chunks --warmups 2 --repeats 5 --output /private/tmp/before-chunks.json
node scripts/benchmark-interpreter.mjs --mode chunks --warmups 2 --repeats 5 --compare /private/tmp/before-chunks.json --output /private/tmp/after-chunks.json

node scripts/compare-interpreter.mjs /private/tmp/flowlab-baseline
node scripts/profile-interpreter.mjs /private/tmp/flowlab-baseline
node scripts/profile-interpreter.mjs

npm test
npm run build
npm run lint
```

Use `--case mandelbrot-51x51-30` to measure only Mandelbrot. Complete observations
are kept in the benchmark command's output file, while stdout contains compact
timing summaries. Deep comparisons happen outside measured intervals.
