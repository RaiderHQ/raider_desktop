# Plan 2 — Recorded Tests as Project Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In RSpec projects, every recorded test is a real `_spec.rb` file in the project. It is generated through the project's own helpers and backed by a sidecar JSON that holds its steps. Raider lists all project tests (recorded and code) and runs recorded tests from that file. A file a developer has edited opens read-only.

**Architecture:**
- **Project layout.** A new `projectLayout` module reads the project's Gemfile and `config/config.yml` once on activation and fills the `projectFramework`/`projectAutomation` state, which is dead today. It also resolves `spec_path` and `helper_path`.
- **Sidecar store.** `src/main/handlers/tests/` holds the sidecar store (`.raider/tests/<relpath>.json`), the normalised hash, the project-file writer and the test scanner.
- **Suite index.** `.raider/suites.json` becomes an index (`version: 3`) of suites that hold test ids. Main assembles today's `Suite { tests: Test[] }` shape for the renderer from sidecars, so the Recorder UI barely changes.
- **Generator.** The codegen gains a "project file" variant that calls `driver`/`browser` (from the project's `spec_helper`) instead of instance variables.

**Tech Stack:** Electron, TypeScript, React, zustand, Vitest (jsdom), Playwright e2e. Node `crypto` for hashing.

**Spec:** `docs/superpowers/specs/2026-10-25-unified-recorder-project-design.md` (stage 3, §3, §4, §12). Builds on Plan 1 (`2026-10-25-plan-1-foundation.md`).

## Decisions this plan makes (assistant's calls — confirm at review)

1. **Cucumber projects are untouched in this plan.**
   - They keep the Plan 1 store (`suites.json` version 2, tests held inline) and the temp-file run.
   - The Recorder shows one plain-language notice: "Recorded tests become project files when Gherkin support arrives."
   - Gherkin generation is Plan 7. Writing `_spec.rb` files into a Cucumber project would break goal 1.
2. **Suite membership lives in `.raider/suites.json` version 3:** `{ version: 3, suites: [{ id, name, testIds: string[] }] }`.
   - A test's `id` is stable and stored in its sidecar, so trace files (`userData/traces/<id>`) keep resolving.
   - Plan 5 converts suites to tags.
3. **Project files use the project's helpers.**
   - The file calls `driver` (Selenium) or `browser` (Watir) from `helpers/spec_helper`, so the browser, headless mode and viewport come from `config.yml`, exactly as for hand-written specs.
   - The explicit wait is read from `config.yml` `explicit_wait` at runtime (fallback `timeout`, then 10). No values are baked into the file.
   - Standalone exports (`exportTest` etc.) keep the Plan 1 standalone format.
4. **File name is fixed at creation.**
   - It is `<spec_path>/<slug>_spec.rb`, where `slug` is the snake_case ASCII form of the test name (fallback `recorded_test`). A clash with an existing file gets `_2`, `_3`, … appended.
   - Renaming a test changes only the `describe`/`it` text, never the file name.
5. **Recorded tests run from the project file.** The command is `rspec <relpath> --format json` with the project as cwd, so Raider and CI run the same file. The temp-file run remains only for Cucumber projects.
6. **Code ownership is sticky.** The first time a sidecar's hash mismatches, the scanner writes `codeOwned: true` into the sidecar. It never flips back.
7. **Hash normalisation.**
   - Normalisation:
     - CRLF becomes LF.
     - Each line is trimmed at both ends.
     - Blank lines are dropped.
     - Lines whose first non-space character is `#` are dropped.
   - The hash is sha256 hex of the normalised text.
   - Leading whitespace is dropped as well as trailing, so a `rubocop -a` re-indent keeps the test Recorded.
   - Only full-line comments are dropped, so `css: '#id'` inside code is untouched.
8. **Sidecars and `.raider/` are hidden from the Files tree.**

## Global Constraints

- Supported in this plan: Selenium and Watir × RSpec. Cucumber keeps Plan 1 behaviour.
- Appium, Minitest and Capybara projects show "This project needs an upgrade for recording" with the reason (§12). They get no new code paths.
- Ruby Raider and Ruby are invoked only via `safeExec`; shell inputs go through `buildShellCommand`.
- Never overwrite or delete a file Raider doesn't own. Raider owns a spec file only if a sidecar points at it and that sidecar is not `codeOwned`.
- Every write to `.raider/` and to generated spec files is atomic (tmp file + rename) and serialized per path.
- Generated project files pass the project's own `rubocop` with no offenses beyond those the gem's sample `login_page_spec.rb` produces.
- Non-coders never see Ruby, a file path or a raw selector in the default view. All new copy goes through `en.json`.
- Every new IPC method is added in three places: `ipcMain.handle` in `src/main/index.ts`, the wrapper in `src/preload/index.ts`, and the `WindowApi` entry in `src/renderer/src/foundation/Types/window.ts`. `test/integration/ipcContract.test.ts` enforces this.

## Review Focus

1. **Migrating `suites.json` version 2 when `spec/` already has a file with the same slug.** The hand-written file must be untouched and the recorded test written as `<slug>_2_spec.rb` (Task 6 test `migration never overwrites an existing spec`).
2. **A Windows checkout (autocrlf) or `rubocop -a` re-indent of a recorded file.** It must stay Recorded (Task 3 tests `CRLF and indentation do not change the hash`).
3. **A corrupt or hand-edited sidecar.**
   - The Tests list still opens. The test is listed as Code-owned with its file, and nothing is overwritten (Task 5 test `unreadable sidecar is code-owned`).
4. **Test names with quotes, slashes, `..`, emoji or only non-ASCII characters.** These produce a valid file name inside `spec_path` and can never escape the project (Task 4 tests `slug is safe` and `path traversal rejected`).
5. **Autosave firing every 500 ms while a recording runs.** The spec file and sidecar must never be half-written or out of step (Task 4 test `concurrent saves serialize`).

---

### Task 1: Project layout detection

**Files:**
- Create: `src/main/handlers/project/projectLayout.ts`
- Modify: `src/main/handlers/project/setActiveProject.ts` (call `detectProjectLayout`, set `appState.projectFramework`/`projectAutomation`, store `appState.layout`), `src/main/handlers/appState.ts` (add `layout: ProjectLayout | null`), `src/renderer/src/foundation/Stores/projectStore.ts` (store `layout` from the `setActiveProject` result)
- Test: `test/integration/projectLayout.test.ts`

**Interfaces:**
- Produces (`src/shared/types/projectLayout.ts`):
  ```ts
  export interface ProjectLayout {
    framework: 'rspec' | 'cucumber'
    automation: 'selenium' | 'watir'
    specPath: string     // config `spec_path`, default 'spec'
    featurePath: string  // config `feature_path`, default 'features'
    helperPath: string   // config `helper_path`, default 'helpers'
    recordable: boolean  // false for appium / minitest / capybara / no Gemfile
    unsupportedReason?: 'mobile' | 'minitest' | 'capybara' | 'noGemfile'
  }
  export async function detectProjectLayout(projectPath: string): Promise<ProjectLayout>
  ```
- `set-active-project` result gains `layout: ProjectLayout`.

**Approach:**
- Mirror `ScaffoldProjectDetector` in the gem: a gem counts as present when `'name'` or `"name"` appears in the Gemfile.
- Cucumber wins over rspec when `cucumber` is present, because Cucumber Gemfiles often also list rspec.
- Detection order:
  1. `appium_lib` → mobile
  2. `minitest` without rspec/cucumber → minitest
  3. `capybara` → capybara
  4. `watir` → watir
  5. otherwise selenium
- Paths are read from `config/config.yml` with js-yaml. Each is rejected (falls back to its default) if it is absolute or contains `..`.
- This fixes the Plan 1 bug where every project generated Selenium code: `toAutomation(appState.projectAutomation)` now sees `'watir'`.

- [ ] **Step 1: Failing tests**
  - `selenium rspec default paths`: Gemfile has `gem 'selenium-webdriver'` and `gem 'rspec'`, no path keys → `{framework:'rspec', automation:'selenium', specPath:'spec', helperPath:'helpers', recordable:true}`.
  - `watir cucumber`: Gemfile has `"watir"`, `'cucumber'` and `'rspec'` → `framework:'cucumber'`, `automation:'watir'`.
  - `custom spec_path`: config `spec_path: tests/ui` → `specPath:'tests/ui'`.
  - `unsafe spec_path ignored`: `spec_path: ../outside` → `'spec'`.
  - `appium is not recordable`: `appium_lib` → `{recordable:false, unsupportedReason:'mobile'}`.
  - `no Gemfile`: → `{recordable:false, unsupportedReason:'noGemfile'}`.
  - `activation sets automation`: `setActiveProject` on a watir fixture → `appState.projectAutomation === 'watir'` and `appState.layout.framework === 'rspec'`.
- [ ] **Step 2: Run** `npx vitest run test/integration/projectLayout.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement**, then wire into `setActiveProject` and `projectStore`.
- [ ] **Step 4: Run** the file plus `test/integration/setActiveProject.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: detect project framework, automation and paths on activation`.

---

### Task 2: Project-file generator

**Files:**
- Modify: `src/main/codegen/steps.ts` (add a `receiver` option), `src/main/codegen/testFile.ts` (add `generateProjectSpecFile`), `src/main/codegen/legacy.ts` (also recognise `driver.` / `browser.` receivers and the bare `wait.until`)
- Test: `test/integration/codegen/projectSpecFile.test.ts`, plus the existing `steps.test.ts` and `legacy.test.ts`

**Interfaces:**
- `renderStep(step, automation, opts?: { receiver?: 'ivar' | 'helper' })`. Default `'ivar'` keeps today's output byte-for-byte.
  - With `'helper'`, Selenium emits `driver.` / `wait.until`; Watir emits `browser.`.
- Produces:
  ```ts
  export function generateProjectSpecFile(
    test: { name: string; steps: Step[] },
    automation: Automation,
    opts: { fileRelPath: string; helperPath: string }   // both relative to project root
  ): string
  ```

**Output shape (Selenium):**
```ruby
# frozen_string_literal: true

# Recorded with Raider. Edit in Raider; editing here makes the test code-owned.
# rubocop:disable RSpec/ExampleLength, RSpec/MultipleExpectations
require_relative '../helpers/spec_helper'

describe 'Checkout' do
  let(:wait) do
    config = YAML.load_file('config/config.yml')
    Selenium::WebDriver::Wait.new(timeout: config.fetch('explicit_wait', config.fetch('timeout', 10)))
  end

  it 'Checkout' do
    driver.navigate.to('https://…')
    …
  end
end
# rubocop:enable RSpec/ExampleLength, RSpec/MultipleExpectations
```

- **Watir:** no `let(:wait)`. Instead `before { Watir.default_timeout = <same config expression> }` and `browser.` receivers.
- **`require_relative`:** the path from `dirname(fileRelPath)` to `<helperPath>/spec_helper`, POSIX separators, no `.rb` extension.
- **No `# raider-steps:` header:** the sidecar is the step store.
- **Which cops to disable:** decided by Step 5 against real rubocop. Disable only cops that actually fire on a 20-step test with assertions, and list them in the commit message.

- [ ] **Step 1: Failing tests** in `projectSpecFile.test.ts`:
  - `selenium uses driver and config wait`: output contains `driver.navigate.to(`, `wait.until {` and `fetch('explicit_wait'`, and has no `@driver` or `@wait`.
  - `watir uses browser`: contains `browser.goto(` and `Watir.default_timeout =`; no `@browser`.
  - `require path from nested file`: `fileRelPath:'spec/recorded/a_spec.rb'`, `helperPath:'helpers'` → `require_relative '../../helpers/spec_helper'`.
  - `no step header`: does not contain `raider-steps`.
  - `ruby -c accepts output` for both automations: skip if `ruby` is unavailable, reusing the helper from `steps.test.ts`.
  - In `steps.test.ts`, `ivar receiver unchanged`: the existing snapshots still pass.
  - In `legacy.test.ts`, `helper receiver parses back`: `migrateLegacyStep("driver.find_element(id: 'a').click")` → a click step (not custom).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the three codegen test files. Expected: PASS.
- [ ] **Step 5: Lint check against the real project.**
  1. Copy `~/ruby_raider/test_selenium_rspec` to the scratchpad.
  2. Write a 20-step generated file (navigate, type, click, 3 asserts) into its `spec/`.
  3. Run `rubocop` there with `env -u GEM_HOME -u GEM_PATH -u GEM_ROOT -u RUBY_ROOT -u RUBY_ENGINE -u RUBY_VERSION rbenv exec rubocop spec/<file>`.
  4. Expected: no offenses beyond those `rubocop spec/login_page_spec.rb` already reports.
  5. Adjust the disable list until that holds. Record the output in the report. Also add an integration test `rubocop accepts project spec` that runs only when `RAIDER_RUBOCOP_PROJECT` points at such a copy.
- [ ] **Step 6: Commit** `feat: generate recorded specs that use the project's helpers`.

---

### Task 3: Normalised hash

**Files:**
- Create: `src/main/handlers/tests/codeHash.ts`
- Test: `test/integration/tests/codeHash.test.ts`

**Interfaces:**
- Produces: `export function normalizeRuby(text: string): string` and `export function hashRuby(text: string): string` (sha256 hex of `normalizeRuby(text)`).

- [ ] **Step 1: Failing tests:**
  - `CRLF and indentation do not change the hash`: an LF file and its CRLF, re-indented copy hash the same.
  - `blank lines and full-line comments ignored`.
  - `inline hash in code is kept`: `css: '#submit'` versus `css: '#other'` hash differently.
  - `code change flips hash`: changing one string literal changes the hash.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat: normalised hash for recorded spec ownership`.

---

### Task 4: Sidecar store and recorded-test writer

**Files:**
- Create: `src/main/handlers/tests/sidecar.ts`, `src/main/handlers/tests/recordedTests.ts`, `src/shared/types/projectTest.ts`
- Test: `test/integration/tests/sidecar.test.ts`, `test/integration/tests/recordedTests.test.ts`

**Interfaces:**
- Produces (`src/shared/types/projectTest.ts`):
  ```ts
  export interface Sidecar {
    version: 1
    id: string
    name: string
    url: string
    steps: Step[]
    file: string            // spec path relative to project root, POSIX
    automation: 'selenium' | 'watir'
    hash: string            // hashRuby(generated file)
    codeOwned?: true
    createdAt: string       // ISO
    updatedAt: string
  }
  export type Ownership = 'recorded' | 'codeOwnedWasRecorded' | 'code'
  ```
- Produces (`sidecar.ts`):
  - `sidecarPath(projectPath, fileRel): string`, which resolves to `<project>/.raider/tests/<fileRel>.json`.
  - `readSidecar(projectPath, fileRel): Promise<Sidecar | null>`. Returns null for ENOENT. Throws `SidecarUnreadableError` for bad JSON or a bad shape.
  - `writeSidecar(projectPath, sidecar): Promise<void>`. Atomic, queued per path.
  - `deleteSidecar(projectPath, fileRel)`.
  - `listSidecars(projectPath): Promise<{ fileRel: string; sidecar: Sidecar | null; error?: string }[]>`.
- Produces (`recordedTests.ts`):
  ```ts
  export function slugify(name: string): string                    // [a-z0-9_]+, ≤60 chars, fallback 'recorded_test'
  export async function saveRecordedTest(projectPath: string, layout: ProjectLayout, test: Test): Promise<Sidecar>
  export async function deleteRecordedTest(projectPath: string, testId: string): Promise<void>
  export async function findSidecarById(projectPath: string, testId: string): Promise<Sidecar | null>
  export class CodeOwnedError extends Error {}
  ```
- `saveRecordedTest` behaviour:
  1. Finds the sidecar by `test.id`. If none exists, it picks a free `<specPath>/<slug>_spec.rb`, adding `_2`, `_3`, … while that file or sidecar exists.
  2. Throws `CodeOwnedError` if the sidecar is `codeOwned`, or if the file on disk no longer hashes to `sidecar.hash`. In the second case it also persists `codeOwned: true`.
  3. Generates the file with `generateProjectSpecFile`, writes it (tmp + rename), then writes the sidecar.
  4. A per-test-id queue serializes the whole sequence.
- `deleteRecordedTest` removes the file and the sidecar, but only if the test is not code-owned. If it is code-owned, it throws `CodeOwnedError`.
- Every resolved path is checked with `path.relative` to stay inside `projectPath/specPath` (files) or `projectPath/.raider/tests` (sidecars).

- [ ] **Step 1: Failing tests:**
  - `slug is safe`:
    - `'Login "admin" / ../x 🎉'` → `login_admin_x`
    - `'测试'` → `recorded_test`
    - a 200-character name → at most 60 characters
  - `path traversal rejected`: a sidecar whose `file` is `../../etc/x_spec.rb` is ignored by `findSidecarById` and never written.
  - `first save creates file and sidecar`: `spec/checkout_spec.rb` exists and its hash equals `sidecar.hash`.
  - `name clash appends suffix`: an existing hand-written `spec/checkout_spec.rb` is unchanged, and the new test is written as `spec/checkout_2_spec.rb`.
  - `rename keeps file name`: a second save with a new name produces the same `file` and new `describe` text.
  - `edited file becomes code-owned`: append a line to the spec, then save → rejects with `CodeOwnedError`, the sidecar now has `codeOwned: true`, and the file is unchanged.
  - `concurrent saves serialize`: 10 parallel saves of the same test with different step counts → the final file and sidecar agree (hash matches) and no `.tmp` files remain.
  - `delete refuses code-owned`.
  - `unreadable sidecar`: invalid JSON → `listSidecars` entry with `sidecar: null` and an `error`.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat: store recorded tests as spec files with sidecars`.

---

### Task 5: Project test scanner and code-test reader

**Files:**
- Create: `src/main/handlers/tests/listProjectTests.ts`, `src/main/handlers/tests/readCodeTest.ts`
- Test: `test/integration/tests/listProjectTests.test.ts`, `test/integration/tests/readCodeTest.test.ts`

**Interfaces:**
- Produces (`src/shared/types/projectTest.ts`):
  ```ts
  export interface ProjectTestEntry {
    file: string             // relative POSIX path
    name: string             // sidecar name, else the first describe string, else the file name
    ownership: Ownership
    testId?: string          // present when a sidecar exists
    missingFile?: true       // sidecar exists but the file is gone
  }
  export interface CodeTestView {
    file: string
    examples: { name: string; steps: Step[] }[]   // steps via migrateLegacyStep; unknown lines → custom
  }
  ```
  - `listProjectTests(projectPath, layout): Promise<ProjectTestEntry[]>`
  - `readCodeTest(projectPath, fileRel): Promise<CodeTestView>`
- **Scanner:**
  - Walks `specPath` for `*_spec.rb`, skipping symlinks. RSpec only; a Cucumber layout returns `[]`.
  - Joins the files with `listSidecars`.
  - Ownership: hash match and not `codeOwned` → `recorded`; a mismatch persists `codeOwned` and gives `codeOwnedWasRecorded`; no sidecar or an unreadable one → `code`.
  - A sidecar whose file is missing gives `missingFile: true` with `ownership: 'recorded'`.
  - Sorted by name.
- **readCodeTest:**
  - For each `it '<name>' do`, collects the body lines up to the `end` at the same indentation, parses each with `migrateLegacyStep`, and drops blank and comment lines.
  - A file with no `it` blocks gives one example named after the file, with every line as custom.

- [ ] **Step 1: Failing tests:**
  - `recorded, code-owned and code`: three fixture files give the three ownerships.
  - `mismatch persists codeOwned`: after scanning, the sidecar on disk has `codeOwned: true`. Reverting the file and re-scanning still gives `codeOwnedWasRecorded`.
  - `unreadable sidecar is code-owned`: the entry is `code` and the file is unchanged.
  - `missing file flagged`.
  - `cucumber layout lists nothing`.
  - `two examples read separately`: the gem's `login_page_spec.rb` text gives 2 examples, with page-object lines as custom steps.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat: list project tests with recorded/code-owned status`.

---

### Task 6: Suite index (version 3) and migration of version 2

**Files:**
- Modify: `src/main/handlers/suitePersistence.ts` (version 3 read/write; Cucumber keeps version 2), `src/main/handlers/project/setActiveProject.ts` (migrate on activation for RSpec layouts)
- Create: `src/main/handlers/tests/migrateToProjectFiles.ts`
- Test: `test/integration/tests/migrateToProjectFiles.test.ts`, extend `test/integration/suitePersistence.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SuiteIndexFile { version: 3; suites: { id: string; name: string; testIds: string[] }[] }
  export async function loadSuiteIndex(projectPath: string): Promise<SuiteIndexFile['suites']>   // same corrupt-file handling as loadSuites
  export function saveSuiteIndex(projectPath: string, suites: SuiteIndexFile['suites']): Promise<void>
  export async function migrateToProjectFiles(projectPath: string, layout: ProjectLayout): Promise<{ migrated: number; backup: string | null }>
  ```
- **Migration:** runs only when `suites.json` is version 1 or 2 and the layout is a recordable RSpec project.
  1. Backs up with `backupSuitesFile` (timestamped).
  2. Calls `saveRecordedTest` for every test, keeping its `id`.
  3. Writes the version 3 index.
- **Idempotent:** a re-run after a crash finds existing sidecars by id and does not duplicate them.
- Tests that fail to save are kept: the version 3 index still lists their id, and the version 2 backup holds the steps. The renderer gets a `tests-migrated` event `{ migrated, failed }` → toast.

- [ ] **Step 1: Failing tests:**
  - `migration writes files and index`: a version 2 file with 2 suites and 3 tests gives 3 spec files, 3 sidecars with the same ids, a version 3 index and a `.bak`.
  - `migration never overwrites an existing spec`.
  - `migration is idempotent`: running twice still gives 3 files.
  - `cucumber project keeps version 2`: the file is untouched.
  - `corrupt version 3 index recovered`: timestamped `.bak`, empty index, the `suites-recovered` path.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat: migrate recorded suites to project files`.

---

### Task 7: Re-point suite and test handlers at the project store

**Files:**
- Modify:
  - `src/main/handlers/appState.ts`: `suites` becomes `Map<string, SuiteIndexEntry>` for RSpec, plus `legacySuites` for Cucumber.
  - `getSuites.ts`, `createSuite.ts`, `deleteSuite.ts`, `deleteTest.ts`
  - `recording/saveRecording.ts`
  - `io/importTest.ts`, `io/importSuite.ts`, `io/importProject.ts`
  - `io/exportTest.ts`, `io/exportSuite.ts`, `io/exportProject.ts`
  - `trace/saveTrace.ts`
  - `testing/runRecording.ts`, `testing/runSuite.ts`
- Create: `src/main/handlers/tests/assembleSuites.ts`
- Test: extend the existing integration tests for each handler; add `test/integration/tests/assembleSuites.test.ts`

**Interfaces:**
- `assembleSuites(projectPath): Promise<Suite[]>` builds today's `Suite { id, name, tests: Test[] }` from the index and sidecars.
  - Each `Test` gains `ownership?: Ownership` and `file?: string`. Both are optional in `src/shared/types/test.ts`.
  - The `suite-updated` payload keeps its shape, so the renderer keeps working.
- `saveRecording(suiteId, test)`:
  - RSpec: calls `saveRecordedTest`, adds the id to the suite index, then sends `suite-updated`.
  - On `CodeOwnedError`, returns `{ success:false, error:'codeOwned' }`.
  - Cucumber: unchanged Plan 1 path.
- `deleteTest`: `deleteRecordedTest` plus removal from the index. Code-owned tests are removed from the suite only, and their file stays.
- `deleteSuite`: removes the suite. Recorded tests that belong to no other suite are deleted (today's behaviour); code-owned files are kept.
- Imports call `saveRecordedTest` with fresh ids, so files are never overwritten.
- `runRecording` / `runSuite` (RSpec): run `rspec <files…> --format json` via `safeExec` with `cwd: projectPath` and the same PATH handling as today. Code-owned files may be run.

- [ ] **Step 1: Failing tests:**
  - `save writes project file and index`
  - `save of code-owned returns codeOwned`
  - `delete keeps code-owned file`
  - `delete suite keeps tests shared with another suite`
  - `import never overwrites`
  - `run uses project file`: `safeExec` is called with `cwd` set to the project and the argument `spec/checkout_spec.rb`; no tmp file is written.
  - `cucumber project still uses version 2 suites`
  - `restart round trip`: save, re-activate the project, `getSuites` returns the same test and steps.
- [ ] **Step 2–4:** run (FAIL), implement, run all of `test/integration` (PASS).
- [ ] **Step 5: Commit** `feat: recorder saves, runs and deletes project files`.

---

### Task 8: IPC for the Tests list and read-only view

**Files:**
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/foundation/Types/window.ts`, `src/main/handlers/io/readDirectory.ts`
- Test: `test/integration/ipcContract.test.ts` (updated automatically by the contract), `test/integration/readDirectory.test.ts`

**Interfaces (new channels):**
- `list-project-tests` → `ProjectTestEntry[]`. Awaits activation, uses `appState.layout`, and returns `[]` without a project.
- `open-code-test(file)` → `CodeTestView`. `file` must be one returned by the scanner, checked with the same inside-`specPath` guard.
- `get-project-layout` → `ProjectLayout | null`
- `readDirectory` excludes `.raider` at the project root.

- [ ] **Step 1: Failing tests:**
  - `readDirectory hides .raider`
  - `open-code-test rejects path outside spec`
  - The contract test fails until the preload and `WindowApi` are added.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat: IPC for project tests and read-only code view`.

---

### Task 9: Tests tab and read-only Recorder

**Files:**
- Create: `src/renderer/src/components/ProjectTestsPanel/index.tsx`
- Modify:
  - `src/renderer/src/pages/Overview/index.tsx`: add a fourth tab, `tests`, placed first and selected by default when a project opens.
  - `src/renderer/src/pages/Recorder/index.tsx`, `components/MainRecorderPanel`, `components/CommandList`, `components/CommandBlock`: add a `readOnly` prop.
  - `foundation/Stores/recorderStore.ts`: add `readOnlyView: CodeTestView | null`.
  - `components/TestSuitePanel`: show a badge per test.
  - `assets/locales/en.json` (wherever `en.json` lives)
- Test: `test/components/ProjectTestsPanel.test.tsx`, extend `test/Recorder.test.tsx` and `test/components/MainRecorderPanel.test.tsx`

**Behaviour:**
- **Tests tab.**
  - One list with the test name and a badge: Recorded, Code-owned, or Code.
  - Recorded rows: "Edit". It opens `/recorder` with that test active; the suite is chosen from the index, or the first suite that contains it.
  - Code-owned and Code rows: "View". It opens `/recorder` in read-only mode via `openCodeTest`.
  - "File missing" rows: shown with a "Restore" button, which re-saves from the sidecar.
  - Empty state: "No tests yet — record one".
  - No file paths in the default view; the path appears only in a tooltip.
- **Read-only Recorder.**
  - Banner: "Edited in code by a developer — view and run only."
  - Hidden: record, re-record-from-here, delete, drag, edit, assertion and new-step controls.
  - Kept: Run and the friendly/code toggle.
  - Each example in `CodeTestView` is shown under its name.
  - Saving is never attempted, and autosave is disabled while `readOnly`.
- **Save rejected.** If a save returns `codeOwned`, the active test switches to read-only and shows the banner. No error toast with a raw message.
- **Non-recordable project.** The Recorder shows "This project needs an upgrade for recording" plus a plain reason per `unsupportedReason`, and recording controls are disabled.
- **Cucumber project.** The notice from decision 1 is shown. Everything else is as in Plan 1.

- [ ] **Step 1: Failing tests:**
  - `lists three ownerships with badges`
  - `edit opens recorder with test`
  - `view opens read-only`: no delete or record buttons, and a Run button is present.
  - `read-only never autosaves`: `saveRecording` is not called after 600 ms.
  - `codeOwned save flips to read-only`
  - `unsupported project shows upgrade message`
  - `no raw paths in default view`
- [ ] **Step 2–4:** run (FAIL), implement, run all unit tests (PASS).
- [ ] **Step 5: Commit** `feat: Tests tab and read-only recorder for code-owned tests`.

---

### Task 10: Gem helpers read the new wait keys

**Files (gem worktree `~/ruby_raider-worktrees/recorder-settings`, branch `feat/recorder-settings`):**
- Modify: `lib/generators/templates/helpers/driver_helper.tt` and `browser_helper.tt` (and the Selenium driver partial if it sets the timeout)
- Test: the matching generator specs under `spec/`

**Behaviour:**
- Implicit wait comes from `config.fetch('implicit_wait', config.fetch('timeout', 10))`.
- Watir `default_timeout` comes from `config.fetch('explicit_wait', config.fetch('timeout', 10))`.
- Existing projects (no new keys) behave exactly as before.

- [ ] **Step 1:** Failing spec: the generated helper contains `fetch('implicit_wait'` (Selenium) and `fetch('explicit_wait'` (Watir).
- [ ] **Step 2–4:** run (FAIL), implement, run `bundle exec rspec` for the generator specs (PASS).
- [ ] **Step 5: Commit** in the gem worktree: `Read implicit_wait and explicit_wait in generated helpers`. Don't push.

---

### Task 11: Verification

- [ ] `npm run typecheck`: 0 errors. `npx vitest run`: all pass. Lint with `npx eslint --resolve-plugins-relative-to .` on changed files: no new errors. Prettier on changed files.
- [ ] `npm run build`, then update and run the recorder e2e specs (`recorder-page`, `recorder-controls`, `recorder-import-export`, `settings-recording`, plus a new `project-tests.spec.ts` covering the Tests tab and read-only view with IPC mocks). Run with `env -u GEM_HOME -u GEM_PATH -u GEM_ROOT -u RUBY_ROOT -u RUBY_ENGINE -u RUBY_VERSION`. Full `npx playwright test`: failures may only be the 73 already failing on the base commit.
- [ ] Scripted check of the built app on a scratchpad copy of `~/ruby_raider/test_selenium_rspec` seeded with a version 2 `suites.json`:
  1. Migration produces spec files and sidecars.
  2. The Tests tab shows `login_page_spec.rb` as Code and the migrated tests as Recorded.
  3. Appending a line to a recorded file makes it Code-owned with the banner.
  4. Running a recorded test runs `rspec spec/<file>` in the project. The run may fail on missing project gems; only the command is checked.
  5. `rubocop` on the generated files is clean, as in Task 2 Step 5.
- [ ] Commit any e2e fixes: `test: e2e for project tests and read-only recorder`.
