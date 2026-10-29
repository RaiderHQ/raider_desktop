# Unified Recorder + Project — Design

Date: 2026-10-25
Status: Ready for review

## Intent

Raider Desktop today feels like two apps: a **project** side (Overview: file tree,
scaffold, project dashboard, settings) and a **Recorder** side (in-memory suites,
its own runner, its own dashboard, its own settings). The only bridge is manual
`.rb` export/import.

The target user this design serves is a **QA without coding skills who owns and
maintains tests and suites in Raider**. Technical users (developers, technical
QAs) work on the same Ruby Raider project from the code side. Both must see one
project, one set of tests, one set of results.

**The bar: no friction for non-coders.** A non-coder must be able to create,
organise, run, diagnose and fix their own tests without ever seeing Ruby, a
terminal, or the file tree.

## Goals

1. A recorded test is a real file in the Ruby Raider project, runnable by the
   CLI and CI exactly like a hand-written one.
2. One test list per project, showing recorded and code tests together.
3. Suites map to tags. Running a suite in Raider = running that tag from CLI/CI.
4. Recorded tests run through the project runner and appear in the single
   project dashboard (raider-results).
5. One source of settings (base URL, browser, headless, timeouts, selector
   priority) — the project config. The recorder and generated code both obey it.
6. A non-coder can fix a broken recorded test without code: see which step
   failed, re-pick an element, edit values, re-record from a step, add/delete/
   reorder steps and assertions.
7. Elements are shared through page objects. Fixing an element once fixes every
   test using it.
8. Cucumber projects get readable Gherkin from recordings.
9. RSpec and Cucumber × Selenium and Watir (the combinations the current gem and
   New Project screen offer; Minitest and Capybara were removed from ruby_raider in
   `ad71fcd`) all supported by the no-code path (today it is Selenium-only).
10. A QA's work reaches the team through git, driven from the UI (no terminal),
    so CI runs the tests and results show up in Raider SaaS.

## Non-goals

- Mobile (Appium) recording. Recorder stays web-only.
- Bundling Ruby / removing the rbenv requirement. Separate project, though it is
  the biggest remaining non-coder friction.
- Two-way sync of hand-edited code back into the recorder (see code ownership).
- Forking a code-owned test into a recorded copy. Explicitly not wanted.
- Windows/Linux specifics beyond what already exists.
- Minitest and Capybara projects (no longer created by the gem). Old projects
  using them open with an "upgrade needed" message for the no-code path.
- Running tests on Raider SaaS itself. SaaS receives results from CI
  (raider_reporter upload); it does not execute tests.
- Branching, PRs, history browsing in the UI. Sync only.

## Anti-goals (failure even if it works)

- A non-coder ever has to open the file tree, the code editor, or the terminal
  to do their normal job.
- A non-coder hits a Ruby error message, a backtrace, or a raw selector in the
  default view.
- Recorded tests that only pass inside Raider but fail in CLI/CI (or vice versa).
- Silent changes to code-owned tests' behaviour without the QA being told.
- Losing recorded work on app restart (today's bug).

## Decisions made with the product owner

| Topic | Decision |
|---|---|
| Suites | Map to tags. |
| Hand-edited recorded file | Editable by hand and can be recorded over; one-time warning before replacing hand edits (Plan 4 design). |
| Gherkin | Supported for Cucumber projects. |
| Fixing tests | Non-coder fixes and maintains their own tests without code. |
| Sharing work | git in the background, driven by the UI. CI runs the tests; results go to Raider SaaS. |
| ruby_raider gem | May be changed as part of this work, in its own worktree (`~/ruby_raider-worktrees/`). |
| Shared elements | Re-picking an element that lives in a shared page object updates it for **every** test using it, code-owned included. Raider warns before saving: "This element is used by N tests (M code-owned). Update all?" |

## Design

### 1. Information architecture

When a project is open, a persistent left sidebar replaces today's
header-only "Recorder" button:

```
Project
 ├─ Tests      one list: recorded + code tests; badge = Recorded / Code-owned
 ├─ Suites     tags; add/remove tests, run a suite
 ├─ Pages      page objects / element library
 ├─ Runs       the single dashboard (today's ProjectDashboard)
 ├─ Files      today's file tree + editor + scaffold (technical users)
 └─ Settings   one place (project config)
```

- Recorder becomes an **editor route for one test** (e.g. `/tests/:id`), opened
  from Tests ("New recorded test" / "Edit"). It is no longer a top-level
  destination with its own suites panel.
- Landing keeps three entries. The "Recorder" card becomes **Quick record**: it
  creates a project silently (see §8) and drops the user into a new recorded
  test. *(Builder's/assistant's call — not confirmed by product owner.)*
- `RecordingDashboard` and the Recorder's "Dashboard" tab are removed; run
  results live in Runs.

### 2. Structured step model (source of truth)

Today `Test.steps: string[]` holds Ruby and everything else reverse-parses it with
regexes (`commandParser.ts`, `replayInWebview.ts:parseStep`). Replace with:

```ts
type Step =
  | { id; kind: 'navigate'; url }
  | { id; kind: 'click' | 'doubleClick' | 'hover'; element: ElementRef }
  | { id; kind: 'type'; element: ElementRef; text }
  | { id; kind: 'select'; element: ElementRef; option }
  | { id; kind: 'pressKey'; element: ElementRef; key }
  | { id; kind: 'wait'; element: ElementRef; until: 'visible' | 'hidden' | 'enabled' }
  | { id; kind: 'assert'; check: AssertKind; element?: ElementRef; expected? }
  | { id; kind: 'switchFrame'; element?: ElementRef }   // undefined = default content
  | { id; kind: 'custom'; code }                         // escape hatch, shown as "Custom code step"

type ElementRef = { page: string; name: string }        // points into the element library
```

- Ruby/Gherkin is **generated** from the model per framework × automation. One
  generator module, unit-tested per combination. Proper string escaping (today's
  `.replace(/"/g, '"')` is a no-op and must go).
- Replay in the webview runs from the model (no regex parse), and **executes
  assertions** so a QA can verify in-app.
- The friendly view renders from the model, so it works for every automation.
- No `sleep(1)` between steps; generated code relies on explicit waits.
- Migration: existing string steps (imports, older saves) go through today's
  regexes once; anything unrecognised becomes a `custom` step.

### 3. Recorded tests as project files

On save, Raider writes:

1. The **generated test file** in the project's configured spec/feature path
   (Overview already knows `specPath` / `featurePath`).
2. A **sidecar JSON** with the step model, test metadata, and a hash of the
   generated file content.
   Location: `.raider/tests/<path relative to project root>.json`.
   *(Assistant's call: keeps sidecars out of spec globs and the file tree clutter;
   mirrored path survives because Raider owns renames/moves through its UI.)*
3. Element changes into page objects (§5).

This also fixes the lost-on-restart bug: `appState.suites` is no longer the store;
the project folder is.

Tests list = scan of spec/feature paths. A file with a sidecar whose hash matches →
**Recorded**. A file with a sidecar whose hash doesn't match → **Code-owned
(was recorded)**. A file with no sidecar → **Code-owned**.

### 4. Code ownership

- Detection is by hash (above); no manual flag. The hash is over a normalised
  form (line endings, trailing whitespace, blank lines, comments ignored) so
  `git` autocrlf or a whitespace-only `rubocop -a` don't flip ownership.
  *(Assistant's call.)*
- A code-owned test opens in the Recorder **read-only**: friendly steps (best
  effort via the legacy parser; unparseable lines shown as "Custom code"), run
  button, results, trace. No editing, no re-pick, no fork.
- The badge and a one-line banner explain why: "Edited in code by a developer —
  view and run only."
- Once code-owned, a test never returns to recorded automatically. *(Assistant's
  call; avoids flip-flopping if someone reverts by hand.)*

### 5. Elements and page objects

Ruby Raider page objects are Ruby classes (`class LoginPage < Page`, private
element methods — see `ruby_raider/lib/scaffolding/templates/page_object.tt`).
Raider Desktop cannot safely edit arbitrary Ruby.

*(Assistant's call:)* Raider manages a **marked region** inside each page object:

```ruby
class LoginPage < Page
  # Actions
  ...
  private

  # Elements
  # --- raider:elements (managed by Raider Desktop — edit in the app) ---
  def submit_button = driver.find_element(css: '#submit')
  def email_field   = driver.find_element(id: 'email')
  # --- /raider:elements ---

  def legacy_thing = ...   # developer-written, outside the region
end
```

- The element library (Pages section) lists elements in managed regions as
  editable; elements outside the region are listed as code-owned (usable by
  developers, not by the recorder, not editable).
- The region's contents are also stored in `.raider/elements.json` (page → name →
  selector/strategy) so Raider never parses its own regions back from Ruby.
- When recording, a click on an element whose selector matches a library element
  reuses it; otherwise Raider proposes a page + name ("Add `submit_button` to
  LoginPage?") with a sensible default so the QA can just accept. Page defaults to
  the one matching the current URL, else a new page from the URL path.
- Re-pick updates the library entry and regenerates the region. Before saving it
  shows the usage warning (count of tests, count code-owned). Usage of code-owned
  tests is found by text search for the element method name in spec/feature/step
  files. *(Assistant's call: good enough; false positives only make the warning
  more conservative.)*
- If a page object has no managed region, Raider appends one on first use.
- If the region was hand-edited (content ≠ elements.json), Raider treats that
  page's region as code-owned and stops writing to it, with a clear message.

Elements stay `private` (Ruby Raider convention, see gem `login.tt`). Raider also
manages a second marked region **above `private`** with generated public action
methods, one per element × action used (`click_submit_button`,
`type_into_email_field(text)`, `submit_button_text`, …). Recorded tests and
`raider_steps.rb` call these, never raw `find_element`. *(Assistant's call.)*

**Existing hand-written elements** (outside the managed region): Raider reads
them best-effort (simple `driver.find_element(...)` / `browser.<el>(...)` bodies)
so the recorder can **reuse** them when a click matches, and lists them as
code-owned in Pages. Raider never edits them. If it needs an action for one, it
generates the action method in its own region calling the existing element.
Unparseable elements are simply not offered. *(Assistant's call; this is the one
place Raider parses Ruby.)*

New managed element names must not collide with existing methods; Raider
suffixes them if needed.

### 6. Suites = tags

- RSpec: metadata on the example (`it 'logs in', :smoke, :regression do`).
- Cucumber: scenario tags (`@smoke @regression`).
- Suites panel: create suite = new tag; drag/add tests. Adding a **code-owned**
  test to a suite requires editing its file → not allowed from the no-code UI;
  it shows as "in suite (set in code)" if the tag is already there.
- Running a suite calls the framework directly:
  `bundle exec rspec --tag <suite>` / `bundle exec cucumber --tags @<suite>`.
  Raider never edits the Rakefile. The Suites panel shows this command as
  "Run in CI with:" for technical users; the gem's CI templates document it.
  Overview's existing "custom tag" run switches to the same path (it is broken
  today for any tag without a rake task). *(Assistant's call.)*
- Existing in-memory suites are not migrated (they don't survive restarts today).
  `importSuite` keeps working: imports `.rb` files as recorded tests via the
  legacy parser, tagging them with the suite name.

### 7. Running and results

- Recorded tests run through the project runner (same command path as
  Overview, scoped to the file / tag), so they use the project's helpers,
  config, browser, reporter and CI setup. `runRecording.ts` temp-file runs go.
- Results land in raider-results and appear in Runs.
- For a recorded test failure, Runs and the test editor map the failure to a
  **step** (generated code carries step ids as comments, or step boundaries are
  logged by a tiny generated helper — builder's choice) and show:
  - the step in plain language,
  - the recording-time screenshot vs the failure screenshot,
  - a plain-language reason ("Couldn't find the Login button"),
  - one-click fixes: **Re-pick element**, **Edit value**, **Re-record from here**.
- Raw backtraces stay available behind "Technical details".

### 8. Settings

- One Settings section reading/writing the project config (URL, browser,
  headless, timeouts, viewport, selector priority).
- The recorder's start URL defaults to the project base URL (today it defaults to
  `raider-test-site.onrender.com` via `appState.projectBaseUrl`).
- Implicit/explicit waits move from `localStorage` into project config.
- `recorderPreload.ts` reads selector priority from settings (today hardcoded
  `['id','css','xpath']`), with `data-testid`-style attributes supported.
- Quick record (Landing): creates a project with defaults (Selenium + RSpec, or
  Cucumber if the user picks "readable scenarios") in the app data folder, named
  after the URL; "Save project to…" moves it later. *(Assistant's call.)*

### 9. Gherkin (Cucumber projects)

*(Assistant's call:)* A recorded Cucumber test generates:

- A `.feature` with plain-language steps from a **fixed step vocabulary**:
  `Given I am on the {string} page`, `When I click {string} on the {string} page`,
  `When I type {string} into {string} on the {string} page`,
  `Then {string} on the {string} page should show {string}`, etc.
- One shared step-definitions file Raider owns:
  `features/step_definitions/raider_steps.rb`, resolving `(page, element)` to page
  object elements. Generated once, regenerated on Raider upgrades.
- Element names in Gherkin are humanised ("Login button" ↔ `login_button`).
- Custom steps in Cucumber become a `# custom:` comment plus a pending step;
  a builder may refine.
- If `raider_steps.rb` is hand-edited, it is code-owned and Raider stops
  regenerating it (warning shown).

### 10. Sharing: git in the background

The QA never runs git. Raider shows a **Sync** button and a status chip
("3 changes not shared", "Up to date", "Someone else changed this — review").

- Sync = `git pull --rebase` (autostash) → stage Raider-owned changes (generated
  tests, sidecars, page-object managed regions, `raider_steps.rb`, `.raider/`
  minus screenshots) → commit with a generated message ("Recorded: Login test;
  updated LoginPage.submit_button") → `git push`. Runs through `safeExec`.
- Uses the user's existing git credentials (credential helper / SSH agent). If
  auth fails, a plain-language screen explains what to ask a developer for.
  *(Builder: check whether the macOS keychain helper covers HTTPS out of the
  box; in-app credential entry is out of scope for v1.)*
- Conflicts: on rebase conflict Raider aborts the rebase, keeps local work, and
  tells the QA a teammate changed the same test; v1 offers "Keep mine" / "Keep
  theirs" per conflicting **Raider-owned** file only. Conflicts in code-owned
  files abort with "ask a developer". *(Assistant's call.)*
- Only Raider-owned paths are ever staged automatically; Raider never commits a
  developer's unrelated edits.
- Projects that aren't git repos: Sync is hidden; everything else works locally.
- `.raider/` is committed. Recording screenshots (`.raider/traces/`) are
  git-ignored and stay on the machine.

After push, the project's CI (GitHub Actions / Azure Pipelines, from the gem's
templates) runs the suites and raider_reporter uploads results to Raider SaaS.
Raider Desktop does not call SaaS (consistent with the roadmap); the Runs page
shows local runs.

### 11. ruby_raider gem changes (own worktree)

Done in `~/ruby_raider-worktrees/<branch>`, released before the desktop stage
that needs them:

- `page_object.tt` / page templates include empty managed regions (elements +
  actions).
- Cucumber template ships `features/step_definitions/raider_steps.rb`.
- `config.yml` keys: `selector_priority`, `implicit_wait`, `explicit_wait`.
- Generated `.gitignore` ignores `.raider/traces/`.
- CI templates document/run suites by tag.

Raider Desktop still injects these into projects created by older gem versions
on first use (append region, write steps file, add config keys) so existing
projects work.

### 12. Project compatibility

Assume projects created by the current gem (3.6.x). Older projects or
Minitest/Capybara projects: the project side works as today; the no-code path
shows "This project needs an upgrade for recording" with the reason.
*(Assistant's call.)*

### 13. Recorder coverage additions

Needed for "no friction": select options, hover, double-click, iframe switch,
new tab/window, file upload, alerts, scroll-into-view. Plus a step palette to add
steps without recording, and value editing in form fields.

## Staging

Each stage ships on its own and leaves the app working.

1. **Settings unify + persistence stopgap**: recorder reads project config; save
   suites to `.raider/` so nothing is lost on restart.
2. **Step model + generator**: new model, generator for all framework ×
   automation combinations, escaping fix, no sleeps, model-driven replay with
   assertions, friendly view for all automations. Legacy migration.
3. **Recorded tests as project files**: sidecars, Tests list, code ownership,
   read-only mode, removal of in-memory suites.
4. **One runner, one dashboard**: run via project runner, step-mapped failures,
   remove RecordingDashboard.
5. **Navigation**: sidebar, recorder as `/tests/:id` route, Quick record.
6. **Suites = tags**.
7. **Elements/page objects**: managed regions, element library, reuse during
   recording, re-pick with usage warning.
8. **Gherkin**.
9. **Git sync**.
10. **Recorder coverage additions + step palette**.

Gem changes (§11) land in the gem worktree ahead of stages 1, 6, 7 and 8.

## Left to the builder

- Exact sidecar schema and versioning.
- How step ids map to failures (comments vs helper).
- Component structure, store shape, IPC names.
- Visual design within the existing design system.
- Test strategy per stage (unit for generator, e2e for flows).

## Constraints

- Ruby Raider is invoked only via CLI (`safeExec`); no loading Ruby in-process.
- Shell inputs must be sanitised (existing `buildShellCommand`).
- macOS first.
- Generated files must pass the project's own lint/CI unchanged.
