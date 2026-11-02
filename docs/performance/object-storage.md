# Object storage with preserved execution snapshots

Measured November 2, 2026. Compatibility reference: **`e140bdf`**, including its
expression caches and runtime lookup indexes. The optimized version is that
commit plus this object-storage working tree. Its runtime source manifest is
SHA-256 `29432603be6950e0ba207a0e921eb737ffa2cde4304b4cc7edd5e5e95950fc55`.
Per-file hashes, raw timing samples, profiling samples, memory samples, and the
candidate comparison are in [`object-storage-results.json`](object-storage-results.json).
The manifest covers non-test `src/lib/*.ts` files. Its aggregate hashes sorted
repository paths followed by NUL, each file's hex SHA-256, and a newline (UTF-8).

## Design and public observations

Inspection confirmed two full-table spreads: constructing an object in
`evaluateProgramExpression`, and updating a field in `setObjectField`. The
debugger also retains earlier states as hidden callers and compares referenced
fields between states. A shared mutable table would corrupt those snapshots.

`objectStorage.ts` now stores instances in a persistent radix tree with **64
instances per leaf and 32 children per branch**. Allocation or mutation copies
one leaf and the path to it. All other pages and unchanged instances are shared.
The replacement instance and its field record retain the previous copy-on-write
semantics. There is no shared mutable instance table and no object-ID recycling.
Only the initial import builder mutates its newly owned pages; subsequent writes
never modify a published root, page, instance, or field record.

The public `ObjectHeap` type remains `Record<number, RuntimeObjectInstance>`.
Public states have an enumerable `objectHeap` accessor that lazily produces an
ordinary object with the standard prototype. Direct indexing, `Object.keys`,
`Object.values`, spreads, `hasOwn`, JSON, and `structuredClone` observe the same
heap data. The setter supports replacing `state.objectHeap`. The private tree,
tokens, and weak metadata are absent from public heap enumeration and serialized
or cloned states. No Proxy is used: Proxies would fail `structuredClone`.

A heap version materializes its plain table once. States with the same unchanged
heap retain the same public table identity; a write produces a new table version.
Unchanged instances preserve reference identity across versions. Runtime object
handles still contain their original IDs and Class names. All aliases in the
current execution read the replacement instance through that ID.

Public Step, Run, queue/input/load completion, and debugger chunk boundaries use
the same snapshot adapter and the same interpreter. A synchronous Run or chunk
can use private trees without flattening every intermediate state. Nested
`stepOverCall.caller` states are published recursively, so debugger views,
serialization, and clones cannot accidentally observe an empty private token.
The logical-step, breakpoint, hidden-step, Stop, and scheduling logic is intact.

A plain, cloned, replaced, or previously observed public heap is imported into
fresh private pages when resumed. Reimporting an observed table also honors
external additions, deletions, and replacements instead of trusting stale private
data. It preserves sparse IDs, ordinary numeric-key enumeration, insertion order
above the JavaScript array-index range, and unchanged instance references. Each
execution and each branch from an earlier state evolves its own root.

The expression and lookup-index implementation is retained. Project JSON,
validation, language rules, existing API signatures, and public state fields are
unchanged. No new FlowLab import is required. There are no Complex-specific
shortcuts, storage reclamation, ID reuse, or browser/layout changes.

## Snapshot correction found by the stronger checks

The reference interpreter has a separate historical-state defect:
`addCompletedCallResult` copies completed calls but shares the member-read and
random-result maps. A later resumption can therefore add progress to an older
state's pending expression. The new retention harness found **117 affected
baseline snapshots**. Baseline object heaps remained unchanged.

Resumed expressions now copy those two small maps as well. Resuming an RHS also
isolates any pending index-expression maps, which can start running after the
RHS call returns. Completed effects are preserved, and no random draw or Method
is repeated. This is an intentional correction to older-state observations;
the tested live execution results and return-time state contents match the
reference. It is required to keep retained public execution snapshots stable.

## Compatibility validation

The untouched reference passed **738 tests**. The optimized working tree passes
**754 tests in 39 files**, including 16 new storage/snapshot cases. Production
build and ESLint pass. The tests cover:

- Allocation and mutation with both observed and unobserved earlier states;
  unchanged-instance and heap identity; frozen public states and heaps.
- Aliases through Functions and imported Methods, dynamic attributes, nested
  Lists/Dictionaries, self references, and mutual object cycles.
- Plain/cloned/external-state resumption, edited/replaced/deleted heap entries,
  independent executions and branches, and page/branch/large-ID boundaries.
- Hidden debugger callers, breakpoint/Stop snapshots, referenced-object change
  feedback, partial Input queues, ask/text/image resumption and failures,
  missing-object errors, and logical step limits.

The differential harness compares **15 scenarios in six modes**: headless Run,
raw Step, debugger Step, breakpoint/chunk Run, cloned Step, and externally supplied
Step states. It uses an identical seeded random sequence and fixed queue, ask,
text, and image inputs. It compares **1,779 complete return-time snapshots**,
including outputs, return values, pending progress, errors/source locations,
steps/limits, branches, wires, debugger feedback, call stacks, all observable heap
contents, alias relationships, and shared-instance/heap identities across states.

There are **3,558 retained-original checks** across both revisions. Every retained
heap remains unchanged. Every complete optimized snapshot remains unchanged;
the only baseline drift permitted by the harness is the recorded member/random
progress-map defect described above. At each API return, states match the
reference in all tested scenarios. Existing tests continue covering legacy
Assignment and inline-Class JSON without migration or resaving.

## Timed comparisons

Environment: Apple M4, macOS arm64, Node v25.6.0, Vite SSR with the installed
lockfile dependencies. Each unchanged fixture runs against both source revisions
with fresh cloned Program/import data and identical inputs/options. Startup
validation and **final plain public heap materialization are inside the timed
interval**. Deep comparisons and profiling instrumentation are outside it.
There are two warmups and five measured samples per workload/mode; tables show
medians. Timing jobs ran serially without concurrent tests or builds.

Headless `runExecution`, debugger feedback disabled:

| Workload | Before ms | After ms | Time change | Logical steps, both |
| --- | ---: | ---: | ---: | ---: |
| Procedural, 20,000 loop iterations | 17.69 | 17.70 | +0.0% | 40,005 |
| Recursive Fibonacci, n = 16 | 26.83 | 28.78 | +7.3% | 12,774 |
| One object, 3,000 aliased Method mutations | 35.17 | 33.78 | -3.9% | 18,004 |
| Imported-library calls with overlapping IDs | 38.29 | 39.15 | +2.2% | 16,004 |
| Object Mandelbrot, 51 × 51, limit 30 | 1,525.82 | 575.48 | -62.3% | 187,253 |
| 30,000 allocations, no mutations | 419.93 | 77.90 | -81.4% | 60,004 |
| 6,000 objects, 18,000 aliased Method mutations | 319.59 | 305.43 | -4.4% | 102,006 |

Chunked `runExecutionChunk`, feedback disabled, 10,000-step chunks, infinite time
budget to control wall-clock yielding:

| Workload | Before ms | After ms | Time change | Logical steps, both |
| --- | ---: | ---: | ---: | ---: |
| Procedural | 26.07 | 25.69 | -1.5% | 40,005 |
| Recursive | 35.98 | 37.34 | +3.8% | 12,774 |
| One mutating object | 44.67 | 49.12 | +10.0% | 18,004 |
| Imported libraries | 56.80 | 58.88 | +3.7% | 16,004 |
| Object Mandelbrot | 1,775.99 | 819.02 | -53.9% | 187,253 |
| Many allocations | 489.64 | 150.83 | -69.2% | 60,004 |
| Many aliased mutations | 398.77 | 401.51 | +0.7% | 102,006 |

Positive time changes are regressions. In particular, the one-object chunk case
is about 4.45 ms slower and recursive headless execution about 1.95 ms slower.
Tree lookups, public-boundary handling, and isolated progress maps have overhead;
the storage benefit is largest when the old table was large or grew frequently.
Small differences of a few percent may also include timing/JIT noise. The large
aliased-mutation chunk workload is effectively unchanged overall, despite a
substantially faster field-update block in the separate profile below.

The Mandelbrot fixture is the existing synthetic development program from
`e140bdf`: it retains `z <- z * z + c`, overloaded `__mul__` and `__add__`, both
returning new Complex instances. It renders 51 × 51 pixels with iteration limit
30 and creates **49,362 objects**. The coursework lecture was not copied; its
49,432-allocation timings are not measurements of this fixture.

Both execution modes compare the full environment, every heap instance/field,
return value, output, next ID, logical step count, and **complete image buffers**.
All comparisons pass, including signed zero via lossless benchmark number
encoding. All **10,404 RGBA bytes** match. Pixel SHA-256:
`cc1372e6db5b652bfbfc49a8c14e89a03409b091bd4384c39d0138d9cb912cb3`.

The 64- and 256-object page candidates were measured with identical programs,
warmups, sample counts, and snapshot correction. Headless medians were:

| Fixture | 64-object pages ms | 256-object pages ms |
| --- | ---: | ---: |
| Mandelbrot | 575.48 | 579.21 |
| Many allocations | 77.90 | 85.26 |
| Many aliased mutations | 305.43 | 313.76 |

64-object pages were selected for lower copy cost and the better allocation
result; the small Mandelbrot candidate difference is not decisive on its own.

## Separate profiling

`profile-interpreter.mjs` instruments a temporary source copy only. Each workload
has one warmup and three recorded samples. Timers include the existing
instance/field construction around the table operation, as in the reference
profile. These instrumented timings are not used as the execution benchmarks.

For Mandelbrot, the reference copies **1,218,278,841 preexisting table entries**.
Its creation block takes 1,039–1,069 ms, about 67–68% of these instrumented runs.
The new store copies **2,982,742 page/branch array slots**, and the creation block
takes 23.6–23.9 ms. Final public table materialization takes 3.46–4.38 ms.
These counts describe different storage operations, not bytes or GC costs.

For 6,000 objects and 18,000 aliased mutations, the reference touches 125,997,000
table entries across allocations/updates. Field-update block time falls from
29.96–30.22 ms to 6.09–6.18 ms. The complete workload includes substantial Method
execution and debugger/chunk work, so this does not translate into the same
percentage reduction in whole-program time.

## Retained-snapshot memory and remaining costs

A separate Node `--expose-gc` harness allocates 6,000 objects, updates the last
object 6,000 times, and retains one public state per 100 logical steps: **241
snapshots**, 24,006 total steps. It has one warmup and three recorded samples.
The figures below are median `heapUsed` deltas after test-harness GC, including
retained state/field data and storage metadata. They are not peak RSS or browser
memory measurements. Old snapshot values are verified after measuring, so the
unobserved case does not accidentally materialize all heaps first.

| Retention mode | Reference MiB | Optimized MiB |
| --- | ---: | ---: |
| Keep states without reading their heaps | 10.59 | 1.43 |
| Read and retain every public heap | 10.58 | 22.63 |

The observed case is a real memory regression: retained flat public tables and
private page indexes coexist, and resuming observed tables rebuilds indexes to
honor external edits. Unobserved states can share private pages efficiently.
Applications retaining many fully observed or cloned debugger snapshots should
account for this tradeoff. No objects are reclaimed or IDs recycled here.

Other limits and observable details:

- Reading/serializing/cloning a new public heap is linear in its size. Resuming
  an observed, cloned, or externally supplied heap also has linear import cost;
  repeatedly doing that after every raw Step can dominate execution.
- `objectHeap` is now an accessor on a public state rather than a data-property
  descriptor. Its returned heap is a normal mutable object and replacement
  assignment is supported. Code inspecting that descriptor will see a change.
- Interpreter-generated states remain unchanged by later interpreter work.
  Host code can still edit ordinary public records, as before; it should clone
  states before making edits it wants isolated from other host references.
- Compatibility coverage is finite synthetic/existing-test coverage. Custom
  accessor side effects on externally fabricated heap entries are not covered.
  Browser rendering latency, real network/image decoding, peak memory, and
  long-session behavior have not been benchmarked.

## Reproduce

From the repository root with installed lockfile dependencies:

```sh
mkdir -p /private/tmp/flowlab-e140bdf
git archive e140bdf src/lib | tar -x -C /private/tmp/flowlab-e140bdf

node scripts/benchmark-interpreter.mjs --source /private/tmp/flowlab-e140bdf --warmups 2 --repeats 5 --output /private/tmp/storage-before.json
node scripts/benchmark-interpreter.mjs --warmups 2 --repeats 5 --compare /private/tmp/storage-before.json --output /private/tmp/storage-after.json

node scripts/benchmark-interpreter.mjs --source /private/tmp/flowlab-e140bdf --mode chunks --warmups 2 --repeats 5 --output /private/tmp/storage-before-chunks.json
node scripts/benchmark-interpreter.mjs --mode chunks --warmups 2 --repeats 5 --compare /private/tmp/storage-before-chunks.json --output /private/tmp/storage-after-chunks.json

node scripts/compare-interpreter.mjs /private/tmp/flowlab-e140bdf
node scripts/profile-interpreter.mjs /private/tmp/flowlab-e140bdf
node scripts/profile-interpreter.mjs

node --expose-gc scripts/benchmark-object-snapshots.mjs --source /private/tmp/flowlab-e140bdf
node --expose-gc scripts/benchmark-object-snapshots.mjs
node --expose-gc scripts/benchmark-object-snapshots.mjs --source /private/tmp/flowlab-e140bdf --observe
node --expose-gc scripts/benchmark-object-snapshots.mjs --observe

npm test
npm run build
npm run lint
```

Use `--case mandelbrot-51x51-30`, `--case many-allocations`, or
`--case many-alias-mutations` to isolate a workload. Benchmark output files contain
complete observations; stdout contains compact summaries. All fixtures are public
synthetic development fixtures; no private coursework, solutions, graders, or
hidden tests were used.
