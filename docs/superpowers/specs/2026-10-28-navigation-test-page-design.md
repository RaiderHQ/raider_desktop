# Plan 4 design: one tests list, the recorder as the test page

**Parent spec:** `docs/superpowers/specs/2026-10-25-unified-recorder-project-design.md`
(stage 5; §1, §8). This document overrides the parent where they disagree; each
override is listed under "Changes to the parent spec".

**Input:** the Apple-design review of Tests tab ↔ Recorder (2026-10-27) and a
brainstorm with the product owner (2026-10-28).

## Why

The product owner went from the Tests tab into the recorder to record a more
complex test and wanted it saved in the project. Since Plan 2 it *is* saved, as
`spec/<slug>_spec.rb`, but nothing says so: the recorder saves silently, it is a
separate place (top-bar "Recorder" button, its own "Test Suites" list, its own
Dashboard tab), and the only way back is the logo. The test you just made has
to be found again in a different list. The relationship feels disjointed.

## Intent

A non-coding QA has one list of tests. Opening a test shows it beside that list;
recording happens on the test's own page; stopping the recording saves it into
the project and says so. The recorder stops being a destination and becomes
what a test page does.

## Decided with the product owner

| Topic | Decision |
|---|---|
| Layout | **Layout A**: inside the project, the Tests tab is a list on the left and the selected test on the right. |
| Recording layout | Keep today's recorder layout (steps on the left, embedded website on the right, ~40/60) and enhance it. The tests list does not need to stay visible while recording: it folds away and comes back on stop. |
| New test | Named **before** recording starts. |
| Saving | Saved **when recording stops**, with a visible confirmation naming the test (and file). Nothing is written to the project before the first stop. No Save button. |
| Without a project | The recorder must work without a project: **Quick record** (parent §8) creates a hidden project in the app data folder, named after the URL, and drops the user into Layout A with a new test; "Save project to…" moves it later. |
| Tests touched in code | QAs can **view, run and edit** every test. Every test can be edited by hand (code editor). The recorder **can overwrite** any test, including code a developer wrote. |
| Warning before overwrite | Recording over a test whose file was changed by hand asks once: "This test has code edits. Recording will replace them. Continue?" Untouched recorded tests don't ask. |
| Hand-edited recorded test (not re-recorded) | Shown as its code with Run / Edit code / Record. Labelled "Edited in code". No read-only banner, no "Custom code step" rows. |
| Badges | "Recorded" / "Code-owned" / "Code-owned (was recorded)" collapse to one quiet "Edited in code" tag; ownership no longer locks anything. |
| Recording over a developer's file | Replace **only the example (`it` block) whose name matches**, leaving the rest of the file untouched. The product owner suggested matching by name with a regular expression. |
| Record on an existing test | **Continues** (adds steps to the end). **Start over** is offered as an option. |
| Navigation | **Tabs stay on top** (Tests, Files, Scaffold, Dashboard, …). The parent's left sidebar is dropped; Suites and Pages become tabs when their plans land. |

## Goals

1. One list of tests. The recorder's "Test Suites" panel is gone; the left column
   of the test page is the Tests tab list.
2. Every test has an address: `/tests/:id`, rendered inside the project view with
   the list on the left. A breadcrumb "‹ Tests / <name>" is always visible on the
   test pane. The logo is no longer the only way back.
3. "+ New test" on the Tests tab → name field + start URL (defaults to the
   project base URL) → **Start recording**. Cancel leaves nothing behind (no
   "Untitled Test").
4. Recording state: list folds to a slim rail ("Tests ›", clickable but not
   needed), button reads **Stop & save**, newly recorded step highlighted.
5. On stop: file + sidecar written, list returns with the test selected, and an
   in-page confirmation: "Saved to your project as **<name>**
   (`spec/<slug>_spec.rb`)".
6. Test page (not recording): name, URL, **Record** (continue/re-record), **Run**,
   **Edit code** (opens the file in the existing code editor), **Last run**,
   **More** (import/export moves here). Steps for recorded tests; code for tests
   edited in code.
7. Rows in the list are clickable as a whole; the Edit/View verb goes away.
8. Quick record on Landing replaces the "Recorder" card.
9. Removed: header "Recorder" button, the `/recorder` route as a destination,
   the Recording/Dashboard tab bar, `RecordingDashboard`, the read-only banner and
   "Back to the recorder" button, Implicit/Explicit Wait boxes on the recorder
   (they live in project Settings — parent §8, already in project config since
   Plan 2).

## Non-goals

- Run results on list rows and the single dashboard: Plan 3. Plan 4 shows the last
  run of the open test only (today's "Test Output"), and leaves a slot on rows
  for a status mark Plan 3 fills.
- Suites as tags (Plan 5), page objects (Plan 6), Gherkin generation (Plan 7),
  git sync (Plan 8).
- Turning hand-written Ruby back into steps.

## Anti-goals (a failure even if it works)

- A QA finishes a recording and can't tell whether it was saved or where it went.
- Two lists of the same tests, anywhere.
- A place in the app you can only leave via the logo.
- A developer's hand edits replaced without the one-time warning.
- Recording without a project requires choosing a framework or a folder first.

## Changes to the parent spec

- **Decisions table, "Hand-edited recorded file":** was "code-owned, read-only
  (view + run), no fork". Now: every test is editable by hand and can be recorded
  over, with a one-time warning when hand edits would be replaced. Update the
  parent's table and §3/§4 wording when this lands.
- **§1 sidebar:** dropped in favour of top tabs.
- **§1 Quick record:** confirmed by the product owner (was the assistant's call).
- **Anti-goal "silent changes to code-owned tests' behaviour without the QA
  being told":** still holds — satisfied by the overwrite warning.

## Constraints

- Electron + React + react-router hash router (`src/renderer/src/Router.tsx`),
  zustand stores, react-i18next copy in `en.json`, Tailwind. Vitest + Playwright
  `_electron` e2e.
- Plan 2's file model stays: `<spec_path>/<slug>_spec.rb` + sidecar
  `.raider/tests/<relpath>.json`, v3 suite index, migration never drops a test.
- Today the recorder autosaves on every change and the main process refuses
  writes to code-owned files (`recordedTests.ts` `CodeOwnedError` /
  `refuseAsCodeOwned`, `suiteStore.ts` `error: 'codeOwned'`). Those refusals
  become the overwrite-confirmation path, not a hard stop.
- Ruby runs keep going through the validated rbenv/rvm command.
- A peer session is redesigning the failed-test card in `ProjectDashboard` /
  `TestResultCard` / `raiderResults.ts` and adding "open file at line" to the
  file editor (`/file-editor`, `location.state {fileName, filePath}` + optional
  `line`). Plan 4's "Edit code" should use that, and must not rework those files.

## Assistant's calls (product owner to check)

- **Finding the example to replace.** The name is matched by regex on the `it '<name>'` line. The end of the block is found with a real Ruby parser: Prism or Ripper through the project's validated Ruby, or an equivalent scanner that understands strings, heredocs and nested `do…end`. A regex alone can't find where a Ruby block ends.
  - If exactly one example doesn't match (no match, or several), Raider refuses to overwrite. It offers "Save as a new test" instead and never guesses.
  - The overwrite warning names the example and the file.
- **Developer files with several examples.** The test page lists the file's examples, as `readCodeTest` already returns them. Record, Continue and Start over act on the selected example. Raider-owned recorded files are rewritten whole, as they are today.
- **Record on a test edited in code.** Record starts over for the selected example, after the warning, because the sidecar's steps are out of date. "Continue" is shown only when Raider's steps match the file.
- **Leaving during a recording counts as Stop & save.** This covers the rail, a tab, the breadcrumb and closing the app.
  - The only exception is a brand-new test with zero steps, which leaves nothing behind.
  - Nothing is lost and there is no prompt.
- **Suites until Plan 5.** Existing memberships are kept. A suite filter dropdown sits above the list, with Run suite and New, Rename and Delete suite in its menu. "Not in a suite" stays protected.
  - A new test joins the suite being filtered, otherwise "Not in a suite".
  - Plan 5 replaces this with tags.
- **Quick record needs Ruby and the ruby_raider gem**, because projects are made with `raider new`. When they're missing, Raider shows the existing setup help; there's no bundled template.
  - Quick record always creates Selenium + RSpec. Cucumber waits for Plan 7.
- **Plan order: Plan 4 goes before Plan 3.** Run and Last run keep today's run paths. Plan 3 unifies them and fills the status slot on list rows.

## Left to the builder

- Route shape inside Overview (`/overview/tests/:id` nested vs `/tests/:id`
  rendering the Overview shell) and what `:id` is for code tests without a
  sidecar.
- Whether stop-and-save replaces autosave entirely during recording, and how step
  edits/deletes outside recording are saved (on change is fine for recorded
  tests).
- How "changed by hand" is detected for the warning (Plan 2's hash + marker is
  the obvious source).
- Rail/fold animation, exact copy (ask for copy review against the i18n file).
- Where the hidden Quick-record projects live and how "Save project to…" moves
  them.
