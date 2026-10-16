**FlowLab audit — September 21, 2026**

FlowLab has a strong foundation for a teaching application. Its interpreter, validation, examples, debugger, and recovery features have substantial automated coverage. The highest-value next work is protecting documents and making execution reliably escapable, followed by improving the first-use experience and inspection of larger values.

This audit reviewed the local source, configuration, documentation, dependency graph, and deployment workflow; ran the existing checks and additional interpreter probes; and exercised the app in an isolated Chromium browser. No application source or dependency versions were changed.

| Check | Result |
| --- | --- |
| Existing tests | 485 passed across 27 files |
| ESLint | Passed |
| Production build | Passed; main JavaScript bundle 560.69 kB, 170.50 kB gzip |
| Additional TypeScript strict check | Passed, although `strict` is not enabled in the project configuration |
| Examples in the browser | All eight completed; checked textual outputs, and Turtle Polygon completed |
| Debugger | Step, Restart, breakpoint pause, and continuation worked in the browser |
| Responsive layout | Inspected desktop and 390 × 844 layouts; the fitted mobile example had no page-level horizontal overflow |
| Automated accessibility | No axe violations on the two inspected Process Basics states; manual keyboard testing found a modal defect |
| Dependency audit | Initial report listed 8 affected packages; a subsequent expanded report listed 28 affected entries, including dependent packages: 22 high, 6 moderate. Eight packages carry direct advisory records. See the saved raw report. |

**Findings to address first**

1. **High priority: prevent different tabs from overwriting the same draft. Confirmed in the browser.**

   Open Process Basics, then open its exact draft URL in a second tab. Change `width <- 8` to `width <- 9` in the first tab and wait for recovery to save. In the second tab, change `height <- 5` to `height <- 6`. The persisted recovery copy becomes `width <- 8` and `height <- 6`: the first edit is gone from that copy, with no conflict warning. The first tab still holds its own version in memory, so whichever tab saves next can reverse which edit is lost.

   Draft writes use the same localStorage key without checking a revision or another tab's ownership. Add conflict detection and preserve both versions, or offer to fork a draft when it is already open. A BroadcastChannel/storage-event notification and revision checks would support this. Normal reload recovery should continue to use the same document identity.

   Evidence: [draft writes](/Users/davidbachman/Documents/FlowLab/src/lib/drafts.ts:177), [automatic persistence](/Users/davidbachman/Documents/FlowLab/src/App.tsx:1189), [draft identity](/Users/davidbachman/Documents/FlowLab/src/lib/documentRecovery.ts:11).

2. **High priority: allow cancellation and restart during a stalled network load. Confirmed in the browser.**

   I loaded a program containing `value <- text_from_url("/FlowLab/audit-stall")` and held that request pending in Playwright. After pressing Stop, the status remained Loading; Restart, Step, Auto Step, and Run were all disabled. Stop only switches off the scheduling flags. It does not abort the request or leave the loading state. Editing or replacing the program remains possible, but the execution controls cannot recover the current run while the request is pending.

   Use AbortController for text, image, and import requests; add a timeout; and make Stop/Restart invalidate pending work and restore a usable execution state. Keep the existing safeguards that ignore stale asynchronous results.

   Evidence: [Stop](/Users/davidbachman/Documents/FlowLab/src/App.tsx:1942), [busy-state controls](/Users/davidbachman/Documents/FlowLab/src/App.tsx:1130), [text loader](/Users/davidbachman/Documents/FlowLab/src/App.tsx:5505), [image loader](/Users/davidbachman/Documents/FlowLab/src/lib/image.ts:389). [Screenshot](/Users/davidbachman/Documents/FlowLab/output/playwright/audit-stalled-load.png).

3. **Medium priority: finish the modal keyboard and cancellation behavior. Confirmed for `ask()`.**

   In Number Guess, the input dialog initially focuses Input. Pressing Tab twice moves focus outside the dialog; Escape does not dismiss it, and its only action is Submit. The backdrop blocks pointer access to Stop. The filename and comment forms likewise omit the focus-trapping behavior already implemented for other dialogs.

   Reuse one accessible dialog component across these forms: contain focus, make the background inert, restore focus on close, and support Escape. Give `ask()` a Cancel/Stop action with explicit execution semantics. Add keyboard browser coverage; a clean automated accessibility scan did not catch this behavior.

   Evidence: [input dialog](/Users/davidbachman/Documents/FlowLab/src/App.tsx:3984), [filename/comment dialogs](/Users/davidbachman/Documents/FlowLab/src/App.tsx:3924), [existing focus helper](/Users/davidbachman/Documents/FlowLab/src/App.tsx:4211).

4. **Medium priority: eliminate recursive execution of Process statements and introduce resource limits within blocks. Confirmed with an interpreter probe.**

   A valid Process containing `n <- 0` followed by 5,000 lines of `n <- n + 1` failed with `Maximum call stack size exceeded`; this run reported line 3606 and stopped at `n = 3604`. The exact threshold depends on the JavaScript engine. The block's statements recurse through `finishLinearNode` rather than advancing through an iterative continuation.

   Make statement advancement iterative and resumable. The existing 8 ms execution budget is checked between block steps, so a costly single block can exceed it. A separate bounded probe produced a list of 1,048,576 items in one Process block with only 21 assignment lines. Add practical allocation/output limits and yield opportunities within expensive work. A worker could provide stronger isolation later.

   Evidence: [Process continuation](/Users/davidbachman/Documents/FlowLab/src/lib/interpreter.ts:950), [chunk budget](/Users/davidbachman/Documents/FlowLab/src/lib/debugger.ts:22), [list concatenation](/Users/davidbachman/Documents/FlowLab/src/lib/expression.ts:1033).

5. **Medium priority: make pixel updates scale with the changed pixels. Confirmed by code and a small benchmark.**

   Every `set_pixel` clones the entire RGBA buffer. Updating a 1000 × 1000 image copies 4 MB per pixel operation. In a local interpreter-level benchmark, 100 updates took about 64 ms for that image versus about 1 ms for a 100 × 100 image. These timings exclude rendering and are illustrative, not a browser performance guarantee. A full one-pixel-at-a-time pass over a million-pixel image implies roughly 4 TB of buffer copying.

   Introduce a bulk editing operation or an execution-owned mutable buffer with explicit versioning/snapshots at the boundaries that require immutability. Preserve existing aliasing and save-request snapshot semantics. Profile rendering separately after fixing this cost.

   Evidence: [full-buffer copy](/Users/davidbachman/Documents/FlowLab/src/lib/image.ts:258).

6. **Medium priority: run the existing checks before deployment and refresh dependencies. Confirmed by configuration and audit tools.**

   The only checked-in GitHub workflow installs, builds, and deploys; it does not run lint or any of the 485 tests. Add pull-request checks and require test/lint/build success before deployment. Add a small real-browser suite covering edit/connect, file round-trip, recovery, breakpoint/input cancellation, and the compact layout; jsdom cannot fully establish canvas geometry or native interaction correctness.

   The lockfile has advisory findings for Vitest/@vitest/mocker, undici, PostCSS, nanoid, brace-expansion, browserslist, and baseline-browser-mapping. These findings concern the installed dependency/tooling graph; they do not establish an exploit against the static deployed app. For example, the [Vitest maintainer advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9) describes development-server conditions and identifies 4.1.11 as a patched version; this project has 4.1.8. Update compatible dependencies and regenerate the lockfile, then rerun checks. Review the full dependency paths rather than blindly forcing upgrades.

   Move Vitest, jsdom, and Testing Library packages into devDependencies. They are currently classified as production dependencies even though their use here is for testing. This improves dependency classification; it does not imply that those packages are all shipped in the browser bundle.

   Evidence: [deployment workflow](/Users/davidbachman/Documents/FlowLab/.github/workflows/deploy-pages.yml:29), [package classification](/Users/davidbachman/Documents/FlowLab/package.json:13), [raw npm audit report](/Users/davidbachman/Documents/FlowLab/output/flowlab-audit-dependencies-2026-09-21.json).

7. **Medium priority: improve document naming, replacement, and storage housekeeping. Source-reviewed opportunities.**

   Folder-based exports open/create the requested filename and write directly, without a separate existing-file check. The download fallback skips the filename dialog entirely, so a fresh document exports as `untitled.json`. Recovery drafts and cached imported programs accumulate without an in-app delete or storage-management control.

   Add consistent Rename/Save As behavior across browsers, distinguish saving the current file from replacing an unrelated existing file, and provide draft deletion with clear recovery/storage status. Preserve a previous document revision when feasible. Native file-picker behavior was not tested across Safari and Firefox during this audit.

   Evidence: [directory writes](/Users/davidbachman/Documents/FlowLab/src/App.tsx:2726), [download fallback](/Users/davidbachman/Documents/FlowLab/src/App.tsx:2673), [recovery listing](/Users/davidbachman/Documents/FlowLab/src/lib/drafts.ts:197), [import cache](/Users/davidbachman/Documents/FlowLab/src/lib/imports.ts:65).

8. **Lower priority: make Unicode character behavior consistent. Confirmed with expression probes.**

   `"😀"[0]` returns a lone UTF-16 surrogate, while For iteration uses complete code points and `ord("😀")` returns 128512. Students can get different notions of a character from indexing and iteration. Choose and document one character model—code points would match the current For/chr/ord behavior—and test it consistently.

   Evidence: [string indexing](/Users/davidbachman/Documents/FlowLab/src/lib/expression.ts:953), [string iteration](/Users/davidbachman/Documents/FlowLab/src/lib/interpreter.ts:2033), [character functions](/Users/davidbachman/Documents/FlowLab/src/lib/text.ts:46).

**Product improvements with the best payoff**

- **A welcoming first program.** The blank screen immediately presents missing-main and missing-Return errors. Offer “Create a simple program” and “Explore an example” on the canvas, with a small connected starter flow and syntax hints. Replace empty-document validation errors with guidance until editing begins. [Initial desktop view](/Users/davidbachman/Documents/FlowLab/output/playwright/audit-empty.png).
- **A complete value inspector.** Long values are clipped to four lines with no corresponding expansion for lists, dictionaries, or strings. Add expandable collection entries, full-text viewing/copying, and output copy/export. Avoid fully formatting enormous values merely to show a preview. [Value rendering](/Users/davidbachman/Documents/FlowLab/src/App.tsx:4514), [truncation](/Users/davidbachman/Documents/FlowLab/src/App.tsx:5741).
- **More helpful debugging.** Add Step Over and Step Out, clickable call-stack frames, and a read-only view of the active imported flow. Keep a visible prompt to enter input when waiting. Runtime errors should link to the affected block/Process line, as validation already does.
- **Keep canvas space and settings.** At the initial 1200-pixel desktop width, the sidebars consume 680 pixels. A slimmer initial inspector, collapsible sections, and persisted widths/view preferences would leave more room for diagrams. The compact layout worked after Fit View; make fitting and zooming easy to discover. [Fitted mobile view](/Users/davidbachman/Documents/FlowLab/output/playwright/audit-mobile-fitted.png).
- **Make undo match editing intentions.** `updateNodeText` records an entire canvas snapshot on every change, with an 80-entry history limit. Group typing into editing bursts so writing a paragraph does not consume almost all graph history. [Text updates](/Users/davidbachman/Documents/FlowLab/src/App.tsx:1274).
- **Make common editing actions discoverable.** Comments currently depend on right-click and quick add on double-click. Add selected-block actions and a short visible hint for connecting, panning, and inserting. Provide a keyboard path for placing and connecting blocks, beyond keyboard selection/movement of existing nodes.

**Maintainability and performance follow-up**

`App.tsx` is 5,752 lines and owns document lifecycle, persistence, imports, execution scheduling, graph operations, dialogs, and runtime panels. Extract those responsibilities incrementally behind the existing tests. Start with shared dialogs, document recovery, and execution control because they correspond to confirmed issues. The interpreter and layout modules already provide useful boundaries.

Enable TypeScript `strict`: an additional strict check passed without changes. Add an application error boundary with a recovery/export action so an unexpected render error has a usable fallback. Replace string-parsing of validation messages with structured diagnostics when touching that subsystem; clickable locations should not depend on English wording.

The build's 560.69 kB main JavaScript chunk triggers the bundler warning. Measure startup before making bundle work a priority; then consider loading optional reference/example content or heavy panels on demand. For large diagrams, profile the recreation of node/edge data on every execution update and index graph lookups where the profiler shows a cost. Set size budgets for imported JSON, fetched text, retained output, and variable previews.

**Recommended sequence:** first address draft conflicts, stalled loads, modal cancellation, and deployment checks. Then improve the starter flow and value inspector. Next address Process/image scaling and extract the corresponding runtime/editor responsibilities. Add advanced debugger features after those foundations are stable.

**Scope limits:** browser checks used local Chromium, not a live production deployment or physical mobile devices. Native filesystem permissions and Safari/Firefox behavior were reviewed in code but not exercised end to end. The benchmark figures are local probes. Automated accessibility results apply only to the inspected states and do not certify the whole app. Git status could not be read because the system Git was blocked by an unaccepted Xcode license; the actions taken here added audit artifacts and rebuilt ignored output, without editing application source.
