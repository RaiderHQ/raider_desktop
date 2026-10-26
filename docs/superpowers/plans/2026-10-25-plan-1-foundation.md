# Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The recorder reads every setting from the project's `config/config.yml`, recorded suites survive an app restart, and recorded steps are stored as a structured model from which Ruby is generated for Selenium and Watir.

**Architecture:** Main process gains `appState.projectPath` (set by the renderer when a project opens), a `projectSettings` module that reads/writes `config/config.yml` without losing comments, and a `suitePersistence` module writing `<project>/.raider/suites.json`. A new `src/main/codegen/` module turns `Step` objects into Ruby; `frameworkTemplates.ts` string generation, `commandParser.ts` and the regex replay parser are retired except as a one-time legacy migration.

**Tech Stack:** Electron, TypeScript, React, zustand, Vitest (jsdom), Playwright e2e, js-yaml.

**Spec:** `docs/superpowers/specs/2026-10-25-unified-recorder-project-design.md` (stages 1–2, §2, §8)

## Global Constraints

- Supported combinations: Selenium and Watir × RSpec and Cucumber. Minitest/Capybara get no new code paths.
- Ruby Raider is invoked only via CLI (`safeExec`); shell inputs go through `buildShellCommand`.
- Generated Ruby has no `sleep(1)` between steps; waiting is explicit.
- Typed text and selectors containing `"`, `\`, `#{`, newlines or non-ASCII produce valid Ruby that types/matches exactly that text.
- `config/config.yml` writes preserve existing keys, comments and order.
- New config keys: `implicit_wait` (seconds, default 0), `explicit_wait` (seconds, default = existing `timeout`, else 10), `selector_priority` (default `[id, data-testid, css, xpath]`).
- Persistence file: `<project>/.raider/suites.json`. Traces stay where they are (userData) in this plan.
- Non-coders never see Ruby in the default (friendly) view; anything not representable is shown as "Custom code step".
- Temp-file runs (`runRecording`, `runSuite`) stay in this plan; plan 3 replaces them.

## Review Focus

1. Typed text with quotes, backslashes, `#{}` or emoji — the generated test must type exactly that text (Task 8 test `escapes hostile text`).
2. Project with no `config/config.yml`, or one without the new keys — recorder still opens with defaults, and the first settings change creates only the keys it touches (Task 1 tests `missing file`, `appends missing key`).
3. Switching projects while suites are loaded — suites from project A must never be written into project B's `.raider/suites.json` (Task 5 test `switching project saves to the new path only`).
4. Corrupt or hand-edited `.raider/suites.json` — app opens, moves the bad file to `suites.json.bak`, starts empty and tells the user (Task 5 test `corrupt file`).
5. Legacy string steps the regexes don't recognise (hand edits, Watir code) — they survive as `custom` steps, run unchanged, and show as "Custom code step" (Task 10 test `unknown line becomes custom`).

---

## Stage 1 — One settings source, suites survive restart

### Task 1: Read/write recorder settings in config.yml

**Files:**
- Create: `src/main/handlers/config/projectSettings.ts`
- Test: `test/integration/projectSettings.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RecorderSettings {
    baseUrl: string            // config `url` (or `base_url`); default ''
    browser: string            // default 'chrome'
    headless: boolean          // default false
    implicitWait: number       // `implicit_wait`, default 0
    explicitWait: number       // `explicit_wait`, else `timeout`, else 10
    selectorPriority: string[] // `selector_priority`, default ['id','data-testid','css','xpath']
  }
  export const DEFAULT_SELECTOR_PRIORITY: string[]
  export async function readRecorderSettings(projectPath: string): Promise<RecorderSettings>
  export async function writeRecorderSettings(
    projectPath: string,
    patch: Partial<Pick<RecorderSettings, 'implicitWait' | 'explicitWait' | 'selectorPriority'>>
  ): Promise<void>
  ```

- [ ] **Step 1: Write failing tests** (temp dir per test, write a `config/config.yml` fixture copied from the gem's `web_config.tt` output, including its `# seconds` comment):
  - `reads defaults when file is missing` → `{ baseUrl:'', browser:'chrome', headless:false, implicitWait:0, explicitWait:10, selectorPriority:['id','data-testid','css','xpath'] }`
  - `explicitWait falls back to timeout` → fixture `timeout: 15` gives `explicitWait: 15`
  - `reads url, browser, new keys` when present
  - `replaces existing key in place` → write `{ explicitWait: 20 }` over a file with `explicit_wait: 5`; file text equals original with only that line changed
  - `appends missing key` → writing `implicitWait: 2` to the fixture appends `implicit_wait: 2` and keeps the `timeout: 10 # seconds …` line byte-identical
  - `writes selector_priority in flow style` → `selector_priority: [id, data-testid, css, xpath]`
  - `missing file` on write → creates `config/config.yml` containing only the written keys
- [ ] **Step 2:** Run `npx vitest run test/integration/projectSettings.test.ts` — FAIL (module not found).
- [ ] **Step 3: Implement.** Read with `js-yaml`. Write line-based: for each patched key, replace a top-level line matching `^<key>:` (keeping any trailing ` # comment`), else append `<key>: <value>`. Never re-dump the whole document.
- [ ] **Step 4:** Run the test file — PASS.
- [ ] **Step 5: Commit** `feat: read and write recorder settings in config.yml`

### Task 2: Main process knows the active project

**Files:**
- Modify: `src/main/handlers/appState.ts` (add `recorderSettings: RecorderSettings`; delete `projectBaseUrl` default `'https://raider-test-site.onrender.com/'`, `setProjectBaseUrl`, `RecordingSettings`, `setRecordingSettings`, `getRecordingSettings`)
- Create: `src/main/handlers/project/setActiveProject.ts`
- Modify: `src/main/handlers/recording/startRecordingMain.ts`, `src/main/handlers/loadUrlRequest.ts`, `src/main/handlers/config/updateRecordingSettings.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/foundation/Types/window.ts`
- Test: `test/integration/setActiveProject.test.ts`, update `test/integration/ipcContract.test.ts`

**Interfaces:**
- Consumes: `readRecorderSettings`, `writeRecorderSettings` (Task 1)
- Produces:
  - `setActiveProject(projectPath: string | null): Promise<{ success: boolean; settings?: RecorderSettings; error?: string }>` — sets `appState.projectPath`, loads `appState.recorderSettings`, loads suites (Task 5 hooks in here).
  - IPC `set-active-project` → `window.api.setActiveProject(path)`
  - IPC `get-recorder-settings` → `window.api.getRecorderSettings(): Promise<RecorderSettings>` (returns `appState.recorderSettings`)
  - IPC `update-recording-settings` now takes `Partial<{implicitWait, explicitWait, selectorPriority}>`, writes config via `writeRecorderSettings(appState.projectPath, patch)` and updates `appState.recorderSettings`.
  - `appState.sessionUrl: string | null` — set by `load-url-request`; recording start URL = `sessionUrl ?? recorderSettings.baseUrl`. Not persisted.

- [ ] **Step 1: Write failing tests:** `setActiveProject` loads settings from a fixture project into `appState.recorderSettings`; `setActiveProject(null)` resets to defaults and clears `projectPath`; `startRecordingMain` returns `recorderSettings.baseUrl` when `sessionUrl` is null and `sessionUrl` when set; `update-recording-settings` with no active project returns `{ success:false, error:'No project open' }`. Add the two new channels to `ipcContract.test.ts`.
- [ ] **Step 2:** Run those tests — FAIL.
- [ ] **Step 3: Implement** per Interfaces. Replace every `getRecordingSettings()` caller (`src/main/index.ts:215`, `runSuite.ts`) with `appState.recorderSettings`.
- [ ] **Step 4:** `npx vitest run test/integration` — PASS. `npm run typecheck` — no errors.
- [ ] **Step 5: Commit** `feat: main process tracks active project and its recorder settings`

### Task 3: Renderer uses project settings, no localStorage

**Files:**
- Modify: `src/renderer/src/foundation/Stores/projectStore.ts` (subscription on `projectPath` calls `window.api.setActiveProject(projectPath)`, including `null`)
- Modify: `src/renderer/src/pages/Recorder/index.tsx:69-100`, `src/renderer/src/pages/RecorderSettings/index.tsx`
- Test: `test/Recorder.test.tsx`, `test/RecordingSettings.test.tsx`, `test/projectStore.test.ts`

**Interfaces:**
- Consumes: `window.api.getRecorderSettings`, `window.api.updateRecordingSettings`, `window.api.setActiveProject` (Task 2)

- [ ] **Step 1: Write failing tests:** setting `projectPath` in the store calls `setActiveProject` with it; Recorder wait inputs show values from `getRecorderSettings` (mock returns `implicitWait: 3, explicitWait: 25`); changing a wait calls `updateRecordingSettings({ explicitWait: 30 })`; `localStorage.getItem('implicitWait')` is never read (spy).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement.** Remove all `localStorage` use for waits in both pages.
- [ ] **Step 4:** Run `npx vitest run test/Recorder.test.tsx test/RecordingSettings.test.tsx test/projectStore.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat: recorder waits come from project config`

### Task 4: Configurable selector priority in the recorder

**Files:**
- Modify: `src/preload/recorderPreload.ts`
- Modify: `src/main/index.ts` (IPC `get-selector-priority` → `appState.recorderSettings.selectorPriority`)
- Create: `src/preload/selectorStrategy.ts` (pure functions moved out of the preload so they can be tested)
- Test: `test/selectorStrategy.test.ts` (jsdom)

**Interfaces:**
- Produces: `getPrioritizedSelector(el: Element, priorities: string[]): { selector: string; strategy: 'id' | 'css' | 'xpath' }` — any priority that isn't `id`/`css`/`xpath` is an attribute name; a unique match returns `{ strategy:'css', selector:'[data-testid="x"]' }` with the value CSS-escaped via `CSS.escape`.

- [ ] **Step 1: Write failing tests:** with `['data-testid','id','css','xpath']`, an element with both `id` and `data-testid` yields the data-testid selector; duplicate data-testid values fall through to `id`; an `id` containing `:` yields a CSS selector that `document.querySelector` resolves to the same element; attribute value containing `"` is escaped.
- [ ] **Step 2:** Run `npx vitest run test/selectorStrategy.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Move `getCssPath`, `getXPath`, `getPrioritizedSelector` into `selectorStrategy.ts`. Preload holds `let priorities = DEFAULT` and replaces it with `await ipcRenderer.invoke('get-selector-priority')` at load.
- [ ] **Step 4:** Run — PASS. `npm run build` succeeds (preload bundles the new import).
- [ ] **Step 5: Commit** `feat: recorder honours selector_priority from project config`

### Task 5: Suites persist to `.raider/suites.json`

**Files:**
- Create: `src/main/handlers/suitePersistence.ts`
- Modify: `src/main/handlers/project/setActiveProject.ts`, `src/main/handlers/recording/saveRecording.ts`, `src/main/handlers/createSuite.ts`, `src/main/handlers/deleteSuite.ts`, `src/main/handlers/deleteTest.ts`, `src/main/handlers/io/importSuite.ts`, `src/main/handlers/io/importTest.ts`
- Test: `test/integration/suitePersistence.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SuitesFile { version: 2; suites: Suite[] }
  export async function loadSuites(projectPath: string): Promise<{ suites: Suite[]; recoveredFromCorrupt: boolean }>
  export async function saveSuites(projectPath: string, suites: Suite[]): Promise<void>
  export function persistActiveSuites(): Promise<void> // saves appState.suites to appState.projectPath; no-op when null
  ```
  Version 1 = files whose test steps are `string[]`; `loadSuites` migrates them via `migrateLegacyTest` (Task 10). Until Task 10 lands, version 1 is loaded unchanged.
- `setActiveProject` replaces `appState.suites` with the loaded suites and sends `suite-updated`. When `recoveredFromCorrupt`, it also sends `suites-recovered` (renderer shows a toast: "Your saved suites file couldn't be read. A backup was kept as .raider/suites.json.bak.").

- [ ] **Step 1: Write failing tests:**
  - round trip: save then load returns equal suites
  - write is atomic: writes `suites.json.tmp` then renames (assert no partial file when `fs.rename` is mocked to throw)
  - `corrupt file`: invalid JSON → file moved to `suites.json.bak`, returns `{ suites: [], recoveredFromCorrupt: true }`
  - `switching project saves to the new path only`: set project A, create suite, set project B, create suite → A's file has only A's suite, B's only B's
  - `saveRecording`, `createSuite`, `deleteSuite`, `deleteTest` each call `persistActiveSuites` (spy)
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement.** Create `.raider/` if missing.
- [ ] **Step 4:** Run `npx vitest run test/integration` — PASS.
- [ ] **Step 5:** Manual check via the `run` skill: open a project, record a test, quit, relaunch, reopen project → test is listed.
- [ ] **Step 6: Commit** `fix: recorded suites survive app restart`

### Task 6: ruby_raider gem — config keys and ignore traces (gem worktree)

**Files (in `~/ruby_raider-worktrees/recorder-settings`, branch `feat/recorder-settings` off ruby_raider `main`):**
- Modify: `lib/generators/templates/common/partials/web_config.tt`
- Modify: `lib/generators/templates/common/git_ignore.tt`
- Test: the gem's generator specs for web config and gitignore

- [ ] **Step 1:** `git -C ~/ruby_raider worktree add ~/ruby_raider-worktrees/recorder-settings -b feat/recorder-settings main`
- [ ] **Step 2: Write failing specs:** a generated web project's `config/config.yml` contains `implicit_wait: 0`, `explicit_wait: 10`, `selector_priority: [id, data-testid, css, xpath]`; `.gitignore` contains `.raider/traces/`. Mobile projects get neither config key.
- [ ] **Step 3:** Run the specs with `bundle exec rspec <spec files>` — FAIL.
- [ ] **Step 4:** Add the lines to the templates.
- [ ] **Step 5:** Run the specs and the gem's full suite — PASS.
- [ ] **Step 6: Commit** in the gem worktree `Add recorder settings to web config and ignore .raider/traces`. Do not push; report the branch to the user.

---

## Stage 2 — Structured step model and generator

### Task 7: Step model and Ruby string escaping

**Files:**
- Create: `src/shared/types/step.ts`
- Create: `src/main/codegen/ruby.ts`
- Modify: `src/shared/types/test.ts` (`steps: Step[]`), `src/shared/types/testData.ts` (`steps: Step[]`)
- Test: `test/integration/codegen/ruby.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Strategy = 'id' | 'css' | 'xpath'
  export interface ElementTarget {
    strategy: Strategy
    value: string
    label?: string                         // human name, e.g. 'Login button' (from innerText/aria-label)
    ref?: { page: string; name: string }   // filled by plan 6; ignored by codegen here
  }
  export type AssertKind =
    | 'displayed' | 'notDisplayed' | 'enabled' | 'checked'
    | 'textEquals' | 'textIncludes' | 'valueEquals'
    | 'titleEquals' | 'urlIncludes'
  export type Step =
    | { id: string; kind: 'navigate'; url: string }
    | { id: string; kind: 'click'; element: ElementTarget }
    | { id: string; kind: 'type'; element: ElementTarget; text: string }
    | { id: string; kind: 'pressKey'; element: ElementTarget; key: string } // DOM key name, e.g. 'Enter'
    | { id: string; kind: 'wait'; element: ElementTarget; until: 'visible' | 'hidden' | 'enabled' }
    | { id: string; kind: 'assert'; check: AssertKind; element?: ElementTarget; expected?: string }
    | { id: string; kind: 'switchFrame'; element?: ElementTarget }
    | { id: string; kind: 'custom'; code: string }
  export function isStep(value: unknown): value is Step
  ```
  `src/main/codegen/ruby.ts`: `rubyString(s: string): string` — single-quoted Ruby literal, escaping only `\` and `'` (so `#{}` is inert).
- Changing `Test.steps` will break compilation across the app; Tasks 8–12 fix the callers. Keep the branch compiling by landing Task 7 together with Task 10's `migrateLegacyStep` call sites if needed, or temporarily type `steps: (Step | string)[]` and remove `string` in Task 12. *(Implementer's choice; final state is `Step[]`.)*

- [ ] **Step 1: Write failing tests** for `rubyString`: `a'b` → `'a\'b'`; `a\b` → `'a\\b'`; `#{x}` → `'#{x}'`; `é🙂` unchanged inside quotes; newline kept literally inside the quotes. And `isStep` accepts each kind and rejects `{kind:'nope'}` and strings.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** `feat: structured step model`

### Task 8: Render steps as Selenium and Watir Ruby

**Files:**
- Create: `src/main/codegen/steps.ts`
- Test: `test/integration/codegen/steps.test.ts`

**Interfaces:**
- Consumes: `Step`, `rubyString` (Task 7)
- Produces: `renderStep(step: Step, automation: 'selenium' | 'watir'): string` — one or more lines, no trailing newline, no leading indentation. Selenium uses `@driver` and `@wait`; Watir uses `@browser`.

Exact expected output (assert these strings):

| Step | Selenium | Watir |
|---|---|---|
| navigate `https://x.io` | `@driver.navigate.to('https://x.io')` | `@browser.goto('https://x.io')` |
| click css `#a` | `@wait.until { @driver.find_element(css: '#a').displayed? }`<br>`@driver.find_element(css: '#a').click` | `@browser.element(css: '#a').click` |
| type id `email` text `a'b` | `@wait.until { @driver.find_element(id: 'email').displayed? }`<br>`@driver.find_element(id: 'email').clear`<br>`@driver.find_element(id: 'email').send_keys('a\'b')` | `@browser.element(id: 'email').to_subtype.set('a\'b')` |
| pressKey Enter on id `q` | `@driver.find_element(id: 'q').send_keys(:enter)` | `@browser.element(id: 'q').send_keys(:enter)` |
| wait hidden css `.spinner` | `@wait.until { @driver.find_elements(css: '.spinner').none?(&:displayed?) }` | `@browser.element(css: '.spinner').wait_while(&:present?)` |
| assert textIncludes css `h1` `Hi` | `expect(@driver.find_element(css: 'h1').text).to include('Hi')` | `expect(@browser.element(css: 'h1').text).to include('Hi')` |
| assert titleEquals `T` | `expect(@driver.title).to eq('T')` | `expect(@browser.title).to eq('T')` |
| switchFrame (no element) | `@driver.switch_to.default_content` | `@browser.switch_to.default_content` *(implementer: verify Watir API; use `@browser.wd.switch_to.default_content` if needed)* |
| custom `foo(1)` | `foo(1)` | `foo(1)` |

Keys: DOM name → snake_case symbol (`ArrowUp` → `:arrow_up`, `Enter` → `:enter`, `Escape` → `:escape`, `Tab` → `:tab`). Unknown key → `send_keys('x')` string form.

- [ ] **Step 1: Write failing tests:** one per table row per automation; every `AssertKind` for Selenium; `escapes hostile text` (text `He said "hi" \ #{x} 🙂` round-trips exactly through `rubyString`); xpath value with both quote types.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Smoke-check Ruby validity: for a fixture test containing every kind, write rendered lines into a file and run `ruby -c` on it (test skipped when `ruby` is not on PATH).
- [ ] **Step 6: Commit** `feat: generate Selenium and Watir Ruby from steps`

### Task 9: Generate runnable and exported test files from steps

**Files:**
- Create: `src/main/codegen/testFile.ts`
- Modify: `src/main/handlers/testing/runRecording.ts`, `src/main/handlers/testing/runSuite.ts`, `src/main/handlers/io/exportTest.ts`, `src/main/handlers/io/exportSuite.ts`
- Delete from `src/main/handlers/frameworkTemplates.ts`: `generateCommand`, `generate*Command`, `generate*Export`, `generate*TestCode`, `generateTestCode`, `generateExportContent`; keep `getExportExtension`/`getExportFilters` (now returning `rb` for all, see below).
- Delete: `test/integration/generateRspecCode.test.ts`; rewrite `test/integration/frameworkTemplates.test.ts` as `test/integration/codegen/testFile.test.ts`
- Test: `test/integration/codegen/testFile.test.ts`, existing `runRecording.test.ts`, `runSuite.test.ts`, `exportTest.test.ts`, `exportSuite.test.ts`

**Interfaces:**
- Consumes: `renderStep` (Task 8), `RecorderSettings` (Task 1)
- Produces:
  ```ts
  export type Automation = 'selenium' | 'watir'
  export function toAutomation(projectAutomation: string | null): Automation // 'watir' if /watir/i, else 'selenium'
  export function generateRspecFile(
    test: { name: string; steps: Step[] },
    automation: Automation,
    settings: Pick<RecorderSettings, 'browser' | 'headless' | 'implicitWait' | 'explicitWait'>
  ): string
  ```
- Output: a standalone RSpec file — `require` for the automation and `rspec`; `before` builds the driver for `settings.browser` (`:chrome`/`:firefox`/`:safari`/`:edge`), adds `--headless=new` for chrome/edge when `headless`, sets implicit wait, builds `@wait = Selenium::WebDriver::Wait.new(timeout: explicitWait)` (Watir: `Watir.default_timeout = explicitWait`); `after` quits; one `it` whose body is each rendered step indented 4 spaces. Test name goes through `rubyString`. No `sleep`.
- Runs and exports use `generateRspecFile` for every project in this plan, Cucumber included (Cucumber feature generation is plan 7). Export file extension is `rb` for all frameworks until plan 7.

- [ ] **Step 1: Write failing tests:** headless chrome includes `--headless=new`; firefox setup uses `:firefox`; no `sleep(` anywhere in output; test name `It's "ok"` produces valid quoting; Watir file sets `Watir.default_timeout`; `runRecording` writes a file whose contents equal `generateRspecFile(...)` (mock `fs.writeFile`) and runs `rspec … --format json`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement** and switch the four handlers.
- [ ] **Step 4:** `npx vitest run test/integration` — PASS; `npm run typecheck` — no errors in these files.
- [ ] **Step 5: Commit** `feat: build runnable tests from the step model; drop per-step sleeps`

### Task 10: Migrate legacy string steps

**Files:**
- Create: `src/main/codegen/legacy.ts`
- Modify: `src/main/handlers/suitePersistence.ts` (version 1 → 2 on load), `src/main/handlers/io/importTest.ts`, `src/main/handlers/io/importSuite.ts`
- Delete after this task: `src/main/handlers/commandParser.ts` and `xpathParser.ts` **only if** Task 12 has removed their renderer callers; otherwise delete in Task 12.
- Test: `test/integration/codegen/legacy.test.ts` (port the regex cases from `test/integration/commandParser.test.ts`)

**Interfaces:**
- Produces:
  ```ts
  export function migrateLegacyStep(code: string): Step
  export function migrateLegacyTest(test: { id: string; name: string; url: string; steps: unknown[] }): Test
  ```
  Recognises every pattern in today's `commandParser.ts` (Selenium `@driver.get`, `find_element(...).click/send_keys/clear`, waits, the nine assertion forms, frame switches) and maps them to Step kinds. A `clear` line immediately followed by `send_keys("…")` on the same element collapses into one `type` step. Comments after ` # ` are dropped. Anything else → `{ kind:'custom', code }`. Steps that are already `Step` objects pass through unchanged. New ids via `crypto.randomUUID()`.

- [ ] **Step 1: Write failing tests:** one per legacy pattern (assert resulting Step); `clear + send_keys` pair → one `type`; `unknown line becomes custom` (`browser.element(id: "x").click` → custom with the code unchanged); mixed array of Step objects and strings migrates only the strings; `loadSuites` on a version-1 file returns version-2 Steps and rewrites the file as version 2.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** `feat: migrate recorded string steps to the step model`

### Task 11: Recording emits steps

**Files:**
- Modify: `src/main/handlers/recording/recorderEvent.ts` (build a `Step`; IPC `new-recorded-step` replaces `new-recorded-command`; trace `command` = `renderStep(step, automation)`, plus `stepId`)
- Modify: `src/main/index.ts` assertion context menu: send a `Step` (for kinds needing no text) or `{ pendingAssertion: AssertKind, element }` (for text/value/title/url kinds)
- Create: `src/renderer/src/foundation/assertionStep.ts`
- Modify: `src/renderer/src/hooks/useRecordingIPC.ts`, `src/renderer/src/pages/Recorder/index.tsx:262-290` (remove hardcoded `@driver` strings), `src/shared/types/traceStep.ts` (add `stepId?: string`)
- Test: `test/integration/recorderEvent.test.ts`, `test/integration/recorderEventTrace.test.ts`, `test/recorderUtils.test.ts`, new `test/assertionStep.test.ts`

**Interfaces:**
- Consumes: `Step`, `ElementTarget` (Task 7), `renderStep`, `toAutomation` (Tasks 8–9)
- Produces:
  - `recorderEventToStep(data: RecorderEventData): Step | null` (exported from `recorderEvent.ts`): click → `click`; change on INPUT/TEXTAREA → `type`; change on SELECT → `type` with the selected value *(select gets its own kind in plan 9)*; recordable keydown → `pressKey`. `label` = trimmed `innerText` (≤ 60 chars) or `aria-label` or `placeholder`.
  - `buildAssertionStep(kind: AssertKind, element: ElementTarget | undefined, expected?: string): Step` in `assertionStep.ts`.
  - Recording start with a URL now inserts `{ kind:'navigate', url }` as the first step (replaces `useRecordingIPC.ts:42`'s string).

- [ ] **Step 1: Write failing tests:** a click event on a Watir project produces a `click` Step (not Selenium code); trace step for it has `command` equal to Watir Ruby and `stepId` equal to the step's id; `buildAssertionStep('textIncludes', el, 'Hi')` → expected Step; Recorder adds the Step from the assertion modal (no `@driver` string in the store).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the listed tests — PASS.
- [ ] **Step 5: Commit** `feat: recorder records structured steps for Selenium and Watir`

### Task 12: Friendly view and code view from the model

**Files:**
- Create: `src/shared/describeStep.ts`
- Modify: `src/renderer/src/components/CommandBlock/index.tsx` (prop `step: Step` replaces `command: string`; `onEdit(index, step: Step)`), `src/renderer/src/components/CommandList/index.tsx`, `src/renderer/src/foundation/Translation/*` (new keys), `src/main/index.ts` + `src/preload/index.ts` (IPC `render-step` → `renderStep(step, toAutomation(appState.projectAutomation))`; remove `command-parser`/`xpath-parser` channels)
- Delete: `src/main/handlers/commandParser.ts`, `src/main/handlers/xpathParser.ts`, `src/main/handlers/xpathConverter.ts` (if unused), their tests
- Test: `test/components/CommandBlock.test.tsx`, `test/components/CommandList.test.tsx`, new `test/describeStep.test.ts`

**Interfaces:**
- Consumes: `Step` (Task 7), `renderStep` via IPC
- Produces: `describeStep(step: Step): { key: string; values: Record<string, string> }`. Element shown as `label` when present, else `strategy=value`. Reuses existing `recorder.commandParser.*` keys; adds `recorder.step.custom` = "Custom code step" and keys for any kind without one.
- Editing: friendly view stays read-only in this plan (form editing is plan 3). Code view double-click edits the rendered Ruby; saving replaces the step with `{ id: same, kind:'custom', code }` unless the text is unchanged.

- [ ] **Step 1: Write failing tests:** `describeStep` for every kind; custom step → "Custom code step"; CommandBlock friendly view of a Watir click shows the label, not Ruby; code view shows `render-step` output (mock); editing code produces a `custom` step with the same id.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the listed tests — PASS; `npm run typecheck` — no errors anywhere (`Test.steps` is now `Step[]` everywhere).
- [ ] **Step 5: Commit** `feat: friendly and code views render from the step model`

### Task 13: Replay from the model, assertions included

**Files:**
- Modify: `src/main/handlers/recording/replayInWebview.ts` (signature `steps: Step[]`; delete `parseStep`), `src/main/handlers/recording/replayStepsAndRecord.ts`, `src/main/index.ts` (`replay-in-webview` handler type)
- Test: `test/integration/replayInWebview.test.ts`

**Interfaces:**
- Consumes: `Step` (Task 7), `describeStep` (Task 12)
- Produces: `replayInWebview(event, steps: Step[]): Promise<{ success: boolean; error?: string; failedStepId?: string; cancelled?: boolean }>`
- Behaviour: element lookup waits up to `appState.recorderSettings.explicitWait` seconds (poll every 100 ms) before failing. `type` sets value via the native setter so React-controlled inputs update. Assertions execute: failure error is `Step N (<describeStep text in English>): expected <expected>, got <actual>`. `custom` steps are skipped with a `replay-progress` note `skipped`. No fixed `delay()` after actions except after `navigate` waiting for `did-stop-loading`.

- [ ] **Step 1: Write failing tests** (mock `webContents.executeJavaScript`): an assertion with a mismatch returns `success:false` and `failedStepId`; an element appearing on the 3rd poll succeeds; a custom step is skipped and reported; text with `'` and `\` reaches the page unchanged (inspect the JS string passed in; it must use `JSON.stringify` for values).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** `feat: replay recorded steps from the model and check assertions`

### Task 14: Full verification

- [ ] **Step 1:** `npm run typecheck && npm run lint` — no errors.
- [ ] **Step 2:** `npx vitest run` — all pass.
- [ ] **Step 3:** `npm run build && npx playwright test e2e/recorder-page.spec.ts e2e/recorder-controls.spec.ts e2e/recorder-import-export.spec.ts e2e/settings-recording.spec.ts` — pass; update specs that asserted on Ruby strings in the friendly view.
- [ ] **Step 4:** Manual run via the `run` skill against `~/raider_test_site` with a Selenium+RSpec project and a Watir+Cucumber project: record (click, type text containing `"`, assertion), replay, run, restart app, reopen. Everything persists, the run passes, no `sleep` in the exported file.
- [ ] **Step 5: Commit** any e2e fixes `test: update recorder e2e for the step model`
