# Plan 4: One Tests List, Recorder as the Test Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inside a project, the Tests tab becomes a list on the left and the selected test on the right. Recording happens on that test page and saves when it stops. Any test can be edited in code or recorded over. Quick record gives recording without a project.

**Architecture:**
- Routing: the Overview route gets a nested `tests/:testKey` param. The Tests tab renders `TestsWorkspace` (list + test pane).
- What moves out of `pages/Recorder`:
  - Its recording logic moves into a `useTestRecording` hook.
  - Its UI moves into `TestPage`.
  - The page itself, the header "Recorder" button, `RecordingDashboard`, `TestSuitePanel`, the read-only view and the wait boxes are removed.
- The main process gains:
  - an example locator that uses Ruby's own parser (`RubyVM::AbstractSyntaxTree`);
  - a splice that replaces one `it` block;
  - Quick-record project creation and moving.

**Tech Stack:** Electron 37, React 18, react-router 6 (hash router), zustand, react-i18next, Tailwind, Vitest, Playwright `_electron`.

**Spec:** `docs/superpowers/specs/2026-10-28-navigation-test-page-design.md`. Its parent is `docs/superpowers/specs/2026-10-25-unified-recorder-project-design.md`. Read both; the Plan 4 design wins where they disagree.

## Global Constraints

**Copy.** Every user-facing string goes in `src/renderer/src/assets/translations/en.json`. These exact strings are fixed:

| Element | String |
|---|---|
| Tag | `Edited in code` |
| New test | `New test` |
| Start recording | `Start recording` |
| Stop | `Stop & save` |
| Record / continue | `Record` |
| Start over | `Start over` |
| Run | `Run` |
| Edit code | `Edit code` |
| Last run | `Last run` |
| Breadcrumb root | `Tests` |
| Saved | `Saved to your project as {{name}} ({{file}})` |
| Overwrite warning | `This test has code edits. Recording will replace them. Continue?` |
| Not unique | `Raider couldn't find exactly one test named "{{name}}" in this file.` |
| Not unique, action | `Save as a new test` |
| Empty test pane | `Select a test, or create a new one.` |
| Quick record card | `Quick record` |
| Quick record banner | `This project lives in Raider's own folder.` |
| Quick record banner, action | `Save project to…` |

**Behaviour:**
- **Saving a new test:** nothing is written before the first stop. A new test is "empty" when it has no steps besides the initial `navigate` step, and an empty new test is discarded, never saved.
- **Leaving mid-recording:** this means unmounting the test page, changing route or closing the window. It counts as **Stop & save**, except for an empty new test.
- **Record:**
  - On a Raider-recorded test whose file is untouched (`ownership === 'recorded'`), **Record** continues: it replays all the steps, then appends.
  - **Start over** sits under More and asks for confirmation.
  - On `code` and `codeOwnedWasRecorded` tests, Record always starts over on the selected example, after the overwrite warning.
- **Recording over a developer file** replaces only the one `it`, `specify` or `scenario` block whose literal string name equals the chosen example name. Zero or several matches means refuse and offer `Save as a new test`.
- **Raider-owned recorded files** (`ownership === 'recorded'`) are still rewritten whole, through the existing `saveRecording` path.

**Constraints:**
- Ruby commands run only through `isValidRubyCommand`, `shellQuote` and `buildShellCommand` (`src/main/utils`), never by string-concatenating user input.
- Plan 2's file model and its guards (`assertSpecFile`, `listedFile`, `writeFileAtomic`, `serialize`) stay in force. Every file the new IPC touches must be a listed project spec.
- Don't touch these files: `src/renderer/src/foundation/raiderResults.ts`, `src/renderer/src/components/TestResultCard/*` and `src/renderer/src/components/ProjectDashboard/*`. A peer session owns them.
- `/file-editor` keeps its `location.state { fileName, filePath }` contract. The peer may add an optional `line`; don't depend on it.
- Tabs stay on top. There is no sidebar.
- Before the last task, every task leaves `npx vitest run` and `npm run typecheck` green. Note: `npm test` starts Vitest in watch mode, so don't use it, and `npm run lint` runs `eslint --fix`, so commit what it changes. The e2e suite is brought back to green in Task 11.

## Review Focus

1. **An example named with interpolation or a variable** (`it "logs in as #{user}"`): the AST shows a non-literal string, so there's no match. Expected: the "not unique" refusal plus `Save as a new test`, never a wrong block replaced. Tested in Task 1.
2. **Two examples with the same name in one file**, possibly in different `describe` blocks: refused, and the file is unchanged. Tested in Task 1.
3. **The window closes during a recording of a new test with steps**: the test is saved before the window closes. A 3 s ceiling applies, so a hung save can't keep the app open. Tested in Task 5.
4. **Ruby missing or the command invalid while recording over an example**: an error toast, and the recorded steps stay in the page with `Save as a new test` offered. Nothing is lost. Tested in Task 8.
5. **A project in legacy suite mode** (Cucumber, non-recordable, postponed migration): its recorded tests live only in `suites.json` and have no file. They must still be listed and openable once `/recorder` is gone. Tested in Task 3.

---

### Task 1: Find and replace one example in a spec file (main)

**Files:**
- Create: `src/main/handlers/tests/exampleLocator.ts`
- Create: `src/main/handlers/tests/replaceExample.ts`
- Modify: `src/main/handlers/tests/projectTestIpc.ts` (handler), `src/main/index.ts` (register `record-over-example`), `src/preload/index.ts` and `src/renderer/src/foundation/Types/window.ts` (`recordOverExample`)
- Test: `test/integration/tests/exampleLocator.test.ts`, `test/integration/tests/replaceExample.test.ts`

**Interfaces:**
- Produces:
  - `type ExampleRange = { startLine: number; endLine: number }`. Lines are 1-based and inclusive; the start line is the `it` line and the end line holds the closing `end` or `}`.
  - `locateExamples(absFile: string, name: string, rubyCommand: string): Promise<ExampleRange[]>`
  - `class ExampleNotUniqueError extends Error { constructor(readonly count: number) }`
  - `replaceExample(projectPath: string, layout: ProjectLayout, fileRel: string, exampleName: string, steps: Step[], rubyCommand: string): Promise<void>`
  - IPC `record-over-example` (file, exampleName, steps, rubyCommand) returns one of:
    - `{ success: true }`
    - `{ success: false; error: 'notUnique'; count: number }`
    - `{ success: false; error: string }`
  - Preload: `recordOverExample(file, exampleName, steps, rubyCommand)`.

- [ ] **Step 1: Write failing locator tests.** They run real Ruby, so skip them when `ruby -v` fails, as the other Ruby-dependent integration tests do. Fixture spec contents, written to a temp dir:
  - `finds the one literal match`:
    - Input: two `it` blocks, `'logs in'` and `'logs out'`, each with a nested `do…end` and a heredoc in the body.
    - Assert: `locateExamples(f, 'logs in', 'ruby')` deep-equals `[{ startLine: 2, endLine: 9 }]`, with the line numbers taken from the fixture.
  - `brace blocks`: `it('x') { expect(1).to eq 1 }` gives one range with startLine equal to endLine.
  - `ignores interpolated names`: `it "a #{b}" do … end` searched as `'a #{b}'` gives `[]`.
  - `same name twice`: two `it 'dup'` blocks in different `describe` blocks give `length === 2`.
  - `specify / scenario`: both are found.
- [ ] **Step 2:** Run `npx vitest run test/integration/tests/exampleLocator.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `locateExamples`.**
  - Run `${rubyCommand} -e ${shellQuote(SCRIPT)} ${shellQuote(absFile)} ${shellQuote(name)}` through `safeExec(buildShellCommand(dirname(absFile), …), { timeout: 20_000 })`, after `isValidRubyCommand`.
  - `SCRIPT` is a constant Ruby program:
    - It parses `File.read(ARGV[0])` with `RubyVM::AbstractSyntaxTree.parse`.
    - It walks every node. Keep `:ITER` nodes whose call is an `FCALL` or `CALL` named `it`, `specify` or `scenario`, and whose first argument is a `:STR` node equal to `ARGV[1]`.
    - It prints `JSON.generate` of `[{startLine: n.first_lineno, endLine: n.last_lineno}]`.
  - On a non-zero exit, throw an `Error` carrying stderr.
  - Before shelling out, do the cheap pre-check the product owner asked for: a regex for the escaped name on an `it`/`specify`/`scenario` line. If nothing matches, return `[]` without running Ruby.
- [ ] **Step 4:** Run the locator tests. Expected: PASS.
- [ ] **Step 5: Write failing `replaceExample` tests.**
  - `replaces only the matching block`:
    - The file has examples A, B and C; B is replaced with steps `[navigate https://x.test, click #go]`.
    - Assert that the lines before B's start and after B's end are byte-identical.
    - Assert that B's header line is kept verbatim.
    - Assert that the body is the steps rendered by `renderStep(…, layout.automation, { receiver: 'helper' })`, indented two spaces deeper than the header.
    - Assert that the closing line is the original `end` line.
  - `throws ExampleNotUniqueError(0)` when no example matches, and `ExampleNotUniqueError(2)` for duplicates. In both cases the file is unchanged.
  - `adds a local wait`: when a rendered selenium body references `wait` and the file has no `let(:wait)` or `def wait`, the body's first line is `wait = Selenium::WebDriver::Wait.new(timeout: YAML.load_file('config/config.yml').fetch('explicit_wait', 10))`, so the project's configured wait applies.
  - `updates a code-owned sidecar`: for a file with a sidecar that has `codeOwned: true`, after the replace the sidecar's `steps` are the new steps, `codeOwned` is still `true` and `updatedAt` has changed.
  - `refuses unlisted files`: a path outside the spec folder rejects, and the file is unchanged.
- [ ] **Step 6:** Run them. Expected: FAIL.
- [ ] **Step 7: Implement `replaceExample`.**
  - Guard with `assertSpecFile` and `locateExamples`. Exactly one range is required; otherwise throw `ExampleNotUniqueError(ranges.length)`.
  - A `{…}` brace block becomes a `do…end` block at the header's indentation.
  - Write with `writeFileAtomic`.
  - Run inside `serialize` on a module-level per-file queue keyed `realpath(projectPath)\0fileRel`.
  - The IPC handler first passes the file through `listedFile` (move it out of `projectTestIpc.ts` scope if needed) and maps `ExampleNotUniqueError` to `notUnique`.
- [ ] **Step 8:** Run `npx vitest run test/integration/tests` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 9: Commit:** `feat: replace one example in a spec file by name`

### Task 2: Quick-record projects (main)

**Files:**
- Create: `src/main/handlers/project/quickProject.ts`
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/foundation/Types/window.ts`
- Test: `test/integration/quickProject.test.ts`

**Interfaces:**
- Produces:
  - `quickProjectsDir(): string`, which is `join(app.getPath('userData'), 'quick-record')`
  - `quickProjectName(url: string): string`: the host slugged with `slugify` from `recordedTests.ts`, without a leading `www.`; `'quick_record'` when there is no host.
  - `createQuickProject(url: string, rubyCommand: string): Promise<{ success: true; projectPath: string } | { success: false; error: string }>`. It creates Selenium + RSpec through the existing `runRubyRaider` handler (called with a null event). It picks a free `<name>`, `<name>_2`, … under `quickProjectsDir()`, then writes the URL as the project base URL through the main handler behind `update-browser-url` (`updateBrowserUrl(projectPath, url)` in preload).
  - `isQuickProject(projectPath: string): boolean`: the real path is inside `quickProjectsDir()`.
  - `saveQuickProjectTo(projectPath: string, destFolder: string): Promise<{ success: true; projectPath: string } | { success: false; error: string }>`. It copies the project to `destFolder/<basename>`, never over an existing path, and removes the source only after the copy succeeds.
  - IPC `create-quick-project`, `is-quick-project` and `save-quick-project-to`, with matching preload methods `createQuickProject`, `isQuickProject` and `saveQuickProjectTo`.

- [ ] **Step 1: Write failing tests.** Mock `app.getPath` to a temp dir and mock the `runRubyRaider` handler to create the folder.
  - `quickProjectName('https://www.shop.test/cart')` returns `'shop_test'`.
  - `quickProjectName('not a url')` returns `'quick_record'`.
  - A second create for the same host gives a path ending in `shop_test_2`.
  - `isQuickProject` is true inside the dir and false for `/tmp/elsewhere`.
  - `saveQuickProjectTo` moves the project, the source is gone, and the returned path is `<dest>/shop_test`.
  - `saveQuickProjectTo` into a folder that already holds `shop_test` returns `success: false`, and the source is still present.
  - When the create fails with no Ruby command, the result is `{ success: false }`, and no folder is left behind.
- [ ] **Step 2:** Run `npx vitest run test/integration/quickProject.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** per the Interfaces block.
- [ ] **Step 4:** Run the tests and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: quick-record projects in the app data folder`

### Task 3: Tests workspace: one list, routed selection

**Files:**
- Create: `src/renderer/src/components/TestsWorkspace/index.tsx` (layout: list column + pane + rail state)
- Create: `src/renderer/src/components/TestsList/index.tsx` (replaces `ProjectTestsPanel`, which is deleted)
- Create: `src/renderer/src/foundation/testKey.ts`
- Create: `src/renderer/src/hooks/useTestsList.ts`
- Modify: `src/renderer/src/Router.tsx` (`overview` gets children `tests` and `tests/:testKey`; `recorder` becomes `<Navigate to="/overview/tests" replace />`), `src/renderer/src/pages/Overview/index.tsx` (the Tests tab renders `TestsWorkspace` at full height, and a `testKey` param forces the Tests tab), `en.json`
- Test: `test/testKey.test.ts`, `test/components/TestsList.test.tsx` (replaces `ProjectTestsPanel.test.tsx`)

**Interfaces:**
- Produces:
  - `type TestKey = string`
  - `testKeyOf(row: TestRow): TestKey`, which gives `id:<testId>` when the row has a test id, otherwise `file:<file>`.
  - `parseTestKey(key: string): { kind: 'id'; testId: string } | { kind: 'file'; file: string } | null`
  - Route paths always carry `encodeURIComponent(key)`.
  - `interface TestRow { name: string; file?: string; testId?: string; ownership: Ownership | 'legacy'; missingFile?: true; suiteIds: string[] }`
  - `useTestsList(): { rows: TestRow[] | null; reload: () => Promise<void> }`. It merges `listProjectTests()` with every suite test that has no `file`; those get ownership `'legacy'`. `suiteIds` comes from `getSuites()`. It reloads on `suite-updated`.
  - `TestsList` props: `{ rows: TestRow[]; selectedKey: TestKey | null; onSelect(key: TestKey): void; onNewTest(): void; headerExtra?: ReactNode }`
  - `TestsWorkspace` reads `testKey` from `useParams` and renders `TestsList` beside `props.renderPane(selectedRow | null)`. The pane is a placeholder in this task; Task 4 fills it.

- [ ] **Step 1: Write failing tests.**
  - `testKey` round-trips: `id:t1`, and `file:spec/a b_spec.rb` survives encoding.
  - `parseTestKey('junk')` returns `null`.
  - TestsList:
    - Clicking anywhere on a row calls `onSelect` with that row's key; there's no Edit or View button.
    - The selected row has `aria-current="true"`.
    - The `Edited in code` tag appears for `code` and `codeOwnedWasRecorded` rows and for no other kind.
    - A `missingFile` row keeps Restore.
    - The `New test` button calls `onNewTest`.
    - A `'legacy'` row is listed and selectable.
    - Each row has an empty status slot `data-testid="row-status"` for Plan 3.
- [ ] **Step 2:** Run `npx vitest run test/testKey.test.ts test/components/TestsList.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Carry Restore and the empty states over from `ProjectTestsPanel`.
  - Rows are `<button>`s, or `li[role=button]` with keyboard Enter and Space.
  - The empty pane shows `Select a test, or create a new one.`
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck`. Expected: PASS. Fix `Overview.test.tsx` and any other test importing `ProjectTestsPanel`.
- [ ] **Step 5: Commit:** `feat: tests list with routed selection`

### Task 4: Test page for recorded tests

**Files:**
- Create: `src/renderer/src/components/TestPage/index.tsx`
- Create: `src/renderer/src/hooks/useTestRecording.ts`
- Modify: `src/renderer/src/components/TestsWorkspace/index.tsx` (render `TestPage`), `src/renderer/src/foundation/Stores/recorderStore.ts`, `en.json`
- Test: `test/components/TestPage.test.tsx`, `test/useTestRecording.test.ts`

**Interfaces:**
- Consumes: `TestRow`, `testKeyOf` (Task 3)
- Produces:
  - `useTestRecording()` returns `{ start(): Promise<void>; continueRecording(): Promise<void>; stop(): Promise<void>; run(): Promise<void>; cancelReplay(): Promise<void>; recordingUrl: string | null; preloadPath: string | null; isRecording: boolean }`. Logic moves from `pages/Recorder/index.tsx`:
    - `start` comes from `handleStartRecording`;
    - `continueRecording` is `handleRecordFromHere(steps.length - 1)`;
    - `stop` comes from `handleStopRecording`;
    - `run` comes from `handleRunTest`;
    - `cancelReplay` comes from `handleCancelReplay`.
    The hook also mounts `useSuiteSync` and `useRecordingIPC`, once per workspace.
  - Store addition: `openTest(row: TestRow): Promise<void>`. It finds the suite and test the way `ProjectTestsPanel.edit` did (via `getSuites`), sets `activeSuiteId` and `activeTest`, and clears `readOnlyView`.
  - `TestPage` props: `{ row: TestRow }`

- [ ] **Step 1: Write failing tests**, with `window.api` mocked as the existing `Recorder.test.tsx` does.
  - The breadcrumb shows `Tests` as a link to `/overview/tests`, then the test name.
  - The name and URL fields are bound to `activeTest`, and editing them autosaves after 500 ms through `saveRecording` (existing behaviour, `recorded` only).
  - The buttons `Record`, `Run`, `Code`, `Last run` and `More` are present.
  - `Record` on a test with more than one step calls `continueRecording`; with no steps it calls `start`.
  - `More` contains `Start over`, which confirms first and then calls `start`; `Export test`; and `Delete test`, which uses `DeleteModal` and then `deleteTest`.
  - `Last run` toggles the `OutputPanel` showing `runOutput`.
  - There are no Implicit Wait or Explicit Wait inputs and no Recording or Dashboard tabs.
- [ ] **Step 2:** Run `npx vitest run test/components/TestPage.test.tsx test/useTestRecording.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The steps area reuses `CommandList` with today's props.
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: test page for recorded tests`

### Task 5: Recording mode: fold, stop & save, leave = save, close = save

**Files:**
- Modify: `TestsWorkspace`, `TestPage`, `useTestRecording.ts`, `src/main/index.ts` (window `close` flush), `src/preload/index.ts`, `window.ts`, `en.json`
- Test: `test/components/TestsWorkspace.test.tsx`, `test/useTestRecording.test.ts`, `test/integration/closeFlush.test.ts`

**Interfaces:**
- Produces:
  - `useTestRecording().stop()` now saves:
    - A `recorded` test goes through `saveRecording(activeSuiteId, activeTest)`.
    - Then it shows `toast.success(t('tests.saved', { name, file }))`. `file` comes from the save result's `test.file`.
    - Then it calls `useTestsList().reload()` and navigates to the test's key, so a new file gets its `id:` key.
    - `stop()` returns once the save settles.
  - Main: on `mainWindow` `close`, if the renderer reported `recording-state: true`:
    - call `preventDefault()` once and send `flush-recording`;
    - close when `flush-recording-done` arrives or after 3000 ms, whichever comes first.
  - Preload: `setRecordingState(active: boolean)`, `onFlushRecording(cb)`, `flushRecordingDone()`.

- [ ] **Step 1: Write failing tests.**
  - While `isRecording`:
    - the list is replaced by `data-testid="tests-rail"`, which shows `Tests`;
    - the page shows a `Recording` pill;
    - the primary button reads `Stop & save`;
    - the steps sit at about 40% width and the webview at about 60% (classes `w-[40%]`, `w-[60%]`);
    - the last step has `data-latest="true"`.
  - After `stop()`: `saveRecording` was called once, the toast text is `Saved to your project as Search products (spec/search_products_spec.rb)`, and the list is back with the row selected.
  - Unmounting `TestPage` while recording calls `stopRecordingMain` and `saveRecording`.
  - closeFlush:
    - with recording-state true, `close` is prevented and `flush-recording` is sent;
    - when `flush-recording-done` arrives, the window closes;
    - with no reply, the window closes at 3000 ms (fake timers);
    - with recording-state false, nothing is prevented.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The autosave debounce is suspended while recording. The save happens on stop, so the file isn't rewritten every half-second.
  - Saving on unmount runs from a cleanup that reads the store directly, not stale closure values.
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: recording folds the list and saves on stop or leave`

### Task 6: New test: name first, saved on first stop

**Files:**
- Modify: `recorderStore.ts` (`draftTest`), `TestsWorkspace` (route `tests/new`), `TestPage` (draft form), `useTestRecording.ts`, `Router.tsx`, `en.json`; remove `onNewTest` and `createNewTest` usage from `MainRecorderPanel` (the component is deleted in Task 10)
- Test: `test/components/NewTest.test.tsx`

**Interfaces:**
- Produces:
  - Store: `draftTest: Test | null` and `startDraft(name: string, url: string): void`, which uses `crypto.randomUUID()` for the id and `[]` for the steps.
  - Route: `/overview/tests/new`.
  - `useTestRecording().stop()` with a draft:
    - An empty draft (no steps besides `navigate`) is discarded and the app navigates to `/overview/tests`.
    - Otherwise it saves through `saveRecording(targetSuiteId, draft)` and clears the draft. `targetSuiteId` is the list's suite filter (Task 7), or `UNLISTED_SUITE_ID`.

- [ ] **Step 1: Write failing tests.**
  - `New test` navigates to `/overview/tests/new`, which shows a Name field (required: `Start recording` is disabled while it's blank), a URL field prefilled with the project base URL, and `Start recording` and `Cancel`.
  - Cancel: `saveRecording` is never called, the app navigates back, and no row is added.
  - Start, record two steps, stop: `saveRecording` is called once with the draft's name, and the saved toast appears.
  - Start then stop with only the navigate step: `saveRecording` is not called.
  - No `Untitled Test` is created anywhere.
- [ ] **Step 2:** Run `npx vitest run test/components/NewTest.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Autosave never fires for a draft.
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: name a new test first and save it when recording stops`

### Task 7: Suite filter and list-level import/export

**Files:**
- Create: `src/renderer/src/components/SuiteFilter/index.tsx`
- Modify: `TestsList` (`headerExtra` slot), `TestsWorkspace`, `en.json`
- Test: `test/components/SuiteFilter.test.tsx`

**Interfaces:**
- Consumes: `TestRow.suiteIds`, store `suites`, and the `createSuite`, `deleteSuite`, `runSuite`, `importTest`, `importSuite`, `importProject`, `exportSuite` and `exportProject` APIs, with the behaviour `TestSuitePanel` and `MainRecorderPanel` have today.
- Produces: `SuiteFilter` props: `{ value: string | null; onChange(id: string | null): void }`. `null` means all tests. The value is held in `TestsWorkspace` state and passed to Task 6 as `targetSuiteId`.

- [ ] **Step 1: Write failing tests.**
  - The dropdown lists `All tests` plus each suite, and choosing a suite filters the rows to those whose `suiteIds` include it.
  - The menu offers `Run suite` (disabled for `All tests`), `New suite`, `Delete suite` (there is no rename API today, so renaming waits for Plan 5), `Import test`, `Import suite`, `Import project`, `Export suite` and `Export project`.
  - `Delete suite` is absent when `UNLISTED_SUITE_ID` is selected.
- [ ] **Step 2:** Run the test. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: suite filter and import/export on the tests list`

### Task 8: Tests edited in code: view, run, edit, record over

**Files:**
- Modify: `TestPage`, `useTestRecording.ts`, `en.json`
- Create: `src/renderer/src/components/CodeTestPane/index.tsx`
- Test: `test/components/CodeTestPane.test.tsx`

**Interfaces:**
- Consumes: `openCodeTest(file)`, which returns `CodeTestView`; `recordOverExample` (Task 1); `runProjectFile`.
- Produces: for `code` and `codeOwnedWasRecorded` rows, `TestPage` renders `CodeTestPane`, which lists `view.examples` and has one selected example.
  - **Run** runs the file, using `runProjectFile`.
  - **Edit code** navigates to `/file-editor` with `{ fileName: basename(file), filePath: join(projectPath, file) }`.
  - **Record** shows the overwrite warning in `ConfirmationModal`, then starts a fresh recording bound to `{ file, exampleName }`.
  - On stop, it calls `recordOverExample(file, exampleName, steps, rubyCommand)`:
    - On success, the saved toast with the file name, and the view reloads.
    - On `notUnique`, the not-unique message plus a `Save as a new test` button, which saves the steps as a draft-style new recorded test through `saveRecording(UNLISTED_SUITE_ID, …)`.
    - On any other error, an error toast. The steps stay on screen and `Save as a new test` is offered.

- [ ] **Step 1: Write failing tests.**
  - Examples are listed, and the first one is selected by default.
  - There's no `Edited in code by a developer` banner, no `Custom code step` heading and no `Back to the recorder` button.
  - Edit code navigates with the exact state shape.
  - Cancelling the warning starts nothing.
  - Stop with `{ success: false, error: 'notUnique', count: 0 }` shows the message, and `Save as a new test` calls `saveRecording`.
  - Stop with `{ success: false, error: 'Ruby missing' }` keeps the steps visible.
- [ ] **Step 2:** Run `npx vitest run test/components/CodeTestPane.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Show each example's body with the existing friendly or code toggle, reusing `ReadOnlyTestView`'s rendering inline. Task 10 deletes `ReadOnlyTestView`.
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: view, run, edit and record over tests edited in code`

### Task 9: Quick record UI and "Save project to…"

**Files:**
- Modify: `src/renderer/src/pages/Landing/index.tsx` (the Recorder card becomes `Quick record`), `src/renderer/src/pages/Overview/index.tsx` (banner), `en.json`
- Create: `src/renderer/src/components/QuickRecordDialog/index.tsx`
- Test: `test/Landing.test.tsx`, `test/components/QuickRecordDialog.test.tsx`, `test/Overview.test.tsx`

**Interfaces:**
- Consumes: `createQuickProject`, `isQuickProject` and `saveQuickProjectTo` (Task 2), the existing open-project flow (the code `Landing.handleOpenProject` uses after it picks a folder), and `startDraft` (Task 6).
- Produces:
  - The dialog collects the website URL and the test name, both required.
  - With no `rubyCommand`, it opens the existing `RubyInstallModal` flow instead.
  - Otherwise it shows a loading state, creates the project, activates it, calls `startDraft(name, url)` and navigates to `/overview/tests/new`, ready to record.
  - The Overview banner shows only when `isQuickProject(projectPath)`. `Save project to…` uses `selectFolder` and `saveQuickProjectTo`, then activates the moved project.

- [ ] **Step 1: Write failing tests.**
  - Landing has a `Quick record` card and no `/recorder` link.
  - The dialog's submit is disabled until both fields are filled.
  - A successful create activates the returned path and navigates to `/overview/tests/new` with the draft name set.
  - When the create fails, the error toast shows and the user stays on Landing.
  - The banner is shown only for quick projects.
  - Save-to success re-activates the new path. A cancelled folder pick does nothing.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: quick record without a project`

### Task 10: Remove the old recorder; move the waits to settings

**Files:**
- Delete:
  - `src/renderer/src/pages/Recorder/`
  - `src/renderer/src/components/RecordingDashboard/`
  - `src/renderer/src/components/TestSuitePanel/`
  - `src/renderer/src/components/ReadOnlyTestView/`
  - `src/renderer/src/components/MainRecorderPanel/`
  - their tests: `Recorder.test.tsx`, `TestSuitePanel.test.tsx`, `RecordingDashboard.test.tsx`, `MainRecorderPanel.test.tsx`
- Modify:
  - `src/renderer/src/templates/Main/index.tsx`: remove the `Recorder` NavBtn. The "Ruby Raider" link shows whenever a project is open.
  - `Overview`: the settings toolbar on the Files tab gains the implicit and explicit wait fields through `useRecorderSettings`, with the same save guard (`loaded`) the Recorder had.
  - `en.json`: drop keys used only by the deleted files.
  - `recorderStore.ts`: drop `readOnlyView`, `readOnlyTitle` and `openTarget` if nothing uses them any more.
- Test: `test/components/MainTemplate.test.tsx`, `test/Overview.test.tsx`

- [ ] **Step 1: Update tests first.**
  - MainTemplate shows no `Recorder` button.
  - The Overview Files tab has `Implicit wait` and `Explicit wait` number inputs, and blurring saves through `updateRecordingSettings`, only after settings load.
  - `/recorder` redirects to `/overview/tests`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Delete and modify.** Run `grep -rn "pages/Recorder\|RecordingDashboard\|TestSuitePanel\|ReadOnlyTestView\|MainRecorderPanel\|ProjectTestsPanel" src test`. Expected: no hits.
- [ ] **Step 4:** Run `npx vitest run`, `npm run typecheck` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `refactor: remove the separate recorder page`

### Task 11: E2E and verification

**Files:**
- Modify: `e2e/helpers/navigation.ts` (`goToRecorder` becomes `goToTest(key)` and `goToNewTest()`), `e2e/project-tests.spec.ts`, `e2e/recorder-page.spec.ts`, `e2e/recorder-controls.spec.ts`, `e2e/recorder-import-export.spec.ts`, `e2e/navigation.spec.ts`, `e2e/landing-page.spec.ts`, `e2e/full-workflow.spec.ts`, and any other spec that visits `/recorder`
- Create: `e2e/test-page.spec.ts`

- [ ] **Step 1: Write `e2e/test-page.spec.ts`**, with IPC mocked through `e2e/helpers/ipc-mock`:
  - Tests tab, then click a row: the URL hash is `#/overview/tests/id%3At1` and the breadcrumb is `Tests / Search products`.
  - `New test`, then name it, then `Start recording`: the list folds into the rail. A mocked step event arrives, then `Stop & save`: `save-recording` is captured once and the toast reads `Saved to your project as …`.
  - A code row, then `Record`: the warning appears. Confirm, then stop with mocked `record-over-example` returning `notUnique`: `Save as a new test` appears.
  - The breadcrumb `Tests` link returns to the list with no row selected.
- [ ] **Step 2: Port the other specs** to the new routes and selectors. Delete the assertions that cover removed UI: the Dashboard tab, Test Suites panel, read-only banner and wait boxes on the recorder.
- [ ] **Step 3: Run the full verification:**
  - `npx vitest run`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `npx playwright test`, with `env -u GEM_HOME -u GEM_PATH -u GEM_ROOT -u RUBY_ROOT -u RUBY_ENGINE -u RUBY_VERSION` set as in Plan 2

  Expected: all PASS. Record the counts in the report.
- [ ] **Step 4: Manual check** in `npm run dev` against a real project:
  1. Record a new test, stop, and see it saved.
  2. Continue that test.
  3. Record over one example in a developer's multi-example file, and confirm the other examples are untouched with `git diff`.
  4. Quick record, then Save project to….
- [ ] **Step 5: Update the roadmap.** Row 4 of `docs/superpowers/plans/2026-10-25-unified-recorder-roadmap.md` becomes `**Done** — PR #<n>` once the PR exists. Until then, change it to `In progress`.
- [ ] **Step 6: Update the parent spec's decisions table.** In `docs/superpowers/specs/2026-10-25-unified-recorder-project-design.md`, the "Hand-edited recorded file" row becomes: "Editable by hand and can be recorded over; one-time warning before replacing hand edits (Plan 4 design)."
- [ ] **Step 7: Commit:** `test: e2e for the tests list and test page`
