# Live Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream a test run's states live from raider_reporter, through the Electron main process, to the renderer, using the `RunEvent` contract.

**Architecture:** raider_reporter writes one NDJSON event file per worker when `RAIDER_EVENTS_DIR` is set. The desktop main process spawns rspec/cucumber (serial or parallel_tests) in its own process group, tails those files, translates them into `RunEvent`s, tracks phases and counts in a pure session object, and pushes events on `run-event`. Pure modules (command building, tailing, session state) hold the logic; the process/IPC layer stays thin.

**Tech Stack:** Ruby 3.x gem (RSpec specs), Electron 37 main process, TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-live-runner-design.md`. Contract: `src/shared/types/runEvents.ts` (both in `~/raider_desktop-run-events`).

**Worktrees:**
- Reporter: `~/raider_reporter-run-events`, branch `feature/run-events` (off `feature/failure-card`). Test: `bundle exec rspec`.
- Desktop: `~/raider_desktop-run-events`, branch `feature/run-events-contract` (rebased on `origin/feature/14-quarantine`, which already has Plan 4). Test: `npx vitest run <path>`. Run `npm ci` first if `node_modules` is missing.

## Global Constraints

- Reporter version: `0.11.0`. The stream is on only when `RAIDER_EVENTS_DIR` is set; with it unset, behaviour is byte-for-byte unchanged.
- Events file: `<RAIDER_EVENTS_DIR>/worker-<n>.ndjson`. `n` is the `ShardDetector#shard["index"]`, or `1` with no shard. Append mode, `sync = true`, one JSON object per line, each with `"v":1`.
- Line types: `plan {tests:[{id,file,line,description,full_name}]}`, `started {id,file,line,description,full_name}`, `finished {id,status,duration_ms,attempts}`, `done {}`.
- Every reporter write is inside the formatter's `guard`. An IO error switches the stream off after one warning; it never fails the suite.
- Desktop: `runSpecFiles`, `toRunResult`, `runRaiderTests.ts` and the `run-raider-tests` IPC stay unchanged; the new runner is additive.
- Ruby command: rejected unless `isValidRubyCommand`. Every argument is quoted with `shellQuote` and the line is wrapped by `buildShellCommand` (both in `src/main/utils/shellCommand.ts`). `PATH` drops `node_modules/.bin` entries, as `runSpecFiles` does.
- Scope validation: `files`, and the file part of `locations`, must be listed project tests (same rule as `listedFile` in `projectTestIpc.ts`). Tags must match `/^[A-Za-z0-9_:-]+$/`.
- Tags mean OR. RSpec: repeated `--tag t`. Cucumber: one `--tags "@a or @b"`.
- `locations` always runs serially. Workers are clamped to `[1, maxWorkers]`; `workers` ≤ 1 or undefined means serial.
- `recommendedWorkers = clamp(floor(cpus/2), 1, 4)`, `maxWorkers = cpus`.
- One run per app. A second `startRun` returns `{error:'busy'}`.
- Output is batched every ~50 ms. Retained output is capped at 2 MB (2 * 1024 * 1024 chars), trimming the oldest `run:output` events and setting `truncated: true`.
- Live events need reporter ≥ 0.11.0 in `Gemfile.lock`; otherwise `liveEvents: false`.
- Cancel: SIGINT to the process group (`process.kill(-pid, 'SIGINT')`), then SIGKILL after 10 000 ms. Windows: `taskkill /pid <pid> /T /F`.
- No run timeout.
- Desktop main-process tests live in `test/integration/run/`, start with `// @vitest-environment node` (the default env is jsdom), and mock `electron` the way `test/integration/checkBundle.test.ts` does.
- Events temp dir: `path.join(app.getPath('temp'), 'raider-runs', runId)`, removed when the next run starts.

## Review Focus

1. **The process dies before the reporter loads** (bundler error, syntax error in spec_helper). The run must end `errored`, with the stderr in `run:output`, not stay in `booting`. Test in Task 5.
2. **A partial NDJSON line at a read boundary, or a file that appears after the first poll.** No event may be lost or duplicated. Test in Task 4.
3. **A quarantined-only failure** (exit 1, 0 failed, 1 quarantined): `passed` by default, `failed` with `quarantinedFails`. Test in Task 5.
4. **Cancel when the child ignores SIGINT:** SIGKILL lands after the grace period and the status is `cancelled`. Test in Task 6.
5. **Cucumber retry:** two `started`/`finished` pairs for one id. Counts use the latest status only, and the total isn't double-counted. Test in Task 5.

---

### Task 1: Reporter event stream + RSpec hooks

**Files:**
- Create: `lib/raider_reporter/event_stream.rb`, `spec/raider_reporter/event_stream_spec.rb`
- Modify: `lib/raider_reporter.rb` (require; `event_stream` accessor; `reset!` closes and clears it), `lib/raider_reporter/rspec/formatter.rb`, `spec/raider_reporter/rspec/formatter_spec.rb`, `lib/raider_reporter/version.rb` (→ `0.11.0`), `CHANGELOG.md`, `README.md` (one short section: "Live events")

**Interfaces:**
- Produces:
  - `RaiderReporter::EventStream.open(env: ENV, shard: ShardDetector.new.shard, warn:) -> EventStream | nil`. Returns nil when `env["RAIDER_EVENTS_DIR"]` is unset or empty; it creates the directory.
  - Instance methods: `plan(tests)`, `started(test)`, `finished(id:, status:, duration_ms:, attempts:)`, `done`, `close`. A test is a Hash with `id, file, line, description, full_name`.
  - `RaiderReporter.event_stream`, memoized from `start_collector!` and nil-safe for callers (`RaiderReporter.event_stream&.started(...)`).
  - Strings in a test are capped with `Text.utf8(...)[0, Text::MAX_MESSAGE]`.

- [ ] **Step 1: Write failing specs** in `event_stream_spec.rb`:
  - `"returns nil without RAIDER_EVENTS_DIR"`
  - `"writes worker-1.ndjson without a shard"`
  - `"writes worker-3.ndjson for shard index 3"`
  - `"writes one JSON line per call with v 1"`. Parse each line and assert `{"v"=>1,"type"=>"finished","id"=>"./a_spec.rb[1:1]","status"=>"passed","duration_ms"=>12,"attempts"=>1}`.
  - `"stops writing after an IO error and warns once"`. Stub the file's `write` to raise `IOError` twice and expect one warning.

  In `rspec/formatter_spec.rb`, run the existing sample suite with `RAIDER_EVENTS_DIR` set to a tmpdir:
  - `"plans exactly the filtered examples"`. With `--tag focus`, the `plan.tests` ids equal the ids that ran.
  - `"emits started then finished per example, ending with done"`. The last line is `done`.
  - `"reports a retried example once with its attempts"`. Example metadata `retry_attempts: 1` → one `finished` with `attempts: 2`.
  - `"emits quarantined as the finished status"`
  - `"writes no events file when RAIDER_EVENTS_DIR is unset"`
- [ ] **Step 2: Run** `bundle exec rspec spec/raider_reporter/event_stream_spec.rb spec/raider_reporter/rspec/formatter_spec.rb`. Expected: the new examples fail.
- [ ] **Step 3: Implement the RSpec hooks.**
  - `start`: plan from `::RSpec.world.ordered_example_groups.flat_map(&:descendants).flat_map { |g| ::RSpec.world.filtered_examples[g] }`. `id = example.id`, `file` = `file_path` without `./`, `line`, `description = example.description`, `full_name = example.full_description`.
  - `example_started`: `started`.
  - `record`: `finished`, after `finish_test`, with the final status.
  - `close`: `done`, then `close`.
  - Each hook goes inside `guard`.
- [ ] **Step 4: Run** the whole suite with `bundle exec rspec`. Expected: all pass (469 or more examples, 0 failures).
- [ ] **Step 5: Commit** `Add the live NDJSON event stream for RSpec runs (0.11.0)`.

### Task 2: Reporter Cucumber hooks

**Files:**
- Modify: `lib/raider_reporter/cucumber/formatter.rb`, `spec/raider_reporter/cucumber/formatter_spec.rb`

**Interfaces:**
- Consumes: `RaiderReporter.event_stream` from Task 1.
- Cucumber values: `id` = `identity_for(test_case)[:identifier]`, `file` = `[:file_path]`, `line` = `[:line_number]`, `description` = `test_case.name`, `full_name` = `[:full_name]`.

- [ ] **Step 1: Write failing specs.** Using the existing Cucumber fixture with `RAIDER_EVENTS_DIR`:
  - `"plans every test case before the first starts"`
  - `"emits started and finished per attempt under --retry"`. A scenario that fails then passes gives two `finished` lines with `attempts` 1 then 2.
  - `"ends with done"`
  - `"writes nothing when RAIDER_EVENTS_DIR is unset"`
- [ ] **Step 2: Run** `bundle exec rspec spec/raider_reporter/cucumber/formatter_spec.rb`. Expected: the new examples fail.
- [ ] **Step 3: Implement the hooks.**
  - `expect_cases`: `plan`.
  - `case_started`: `started`.
  - `case_finished`: `finished`, with the final status (quarantined included) and `@attempts[key]`.
  - `run_finished`: `done`, after `finish!`.
  - All inside the existing `guard`.
- [ ] **Step 4: Run** `bundle exec rspec`. Expected: all pass.
- [ ] **Step 5: Commit** `Emit live events from the Cucumber plugin`.

### Task 3: Desktop run command, defaults and version check (pure)

**Files:**
- Create: `src/main/handlers/run/runCommand.ts`, `src/main/handlers/run/runDefaults.ts`, `src/main/handlers/run/reporterVersion.ts`
- Tests: `test/integration/run/runCommand.test.ts`, `test/integration/run/runDefaults.test.ts`, `test/integration/run/reporterVersion.test.ts`

**Interfaces:**
- Produces:
  - `type Framework = 'rspec' | 'cucumber'`
  - `buildRunCommand(opts: { framework: Framework; scope: RunScope; workers: number; rubyCommand: string }): { command: string; workers: number }`. Returns the shell-safe command, not yet wrapped by `buildShellCommand`, and the effective workers.
  - `validateTags(tags: string[]): void`, which throws `Error('Invalid tag: <t>')`.
  - `runDefaults(cpus = os.cpus().length): RunDefaults`
  - `clampWorkers(requested: number | undefined, max: number): number`
  - `reporterVersion(lockText: string): string | null`
  - `supportsLiveEvents(version: string | null): boolean`, true when ≥ `0.11.0`.

- [ ] **Step 1: Write failing tests.** In `runCommand.test.ts`, with ruby `ruby`:
  - Serial, rspec, `all` → `ruby -S bundle exec rspec`
  - Serial, rspec, files `['spec/a b_spec.rb']` → ends with `rspec 'spec/a b_spec.rb'` (quoted with `shellQuote`)
  - rspec tags `['smoke','ui']` → `rspec --tag smoke --tag ui`
  - cucumber tags `['smoke','ui']` → `cucumber --tags '@smoke or @ui'`
  - workers 3, rspec, all → `ruby -S bundle exec parallel_rspec -n 3 --prefix-output-with-test-env-number spec`
  - workers 3, rspec, tags `['smoke']` → contains `-o '--tag smoke'`
  - workers 3, cucumber, files → `parallel_cucumber -n 3 --prefix-output-with-test-env-number <files>`
  - workers 3, locations → serial `rspec 'spec/a_spec.rb:12'`, and returned `workers === 1`
  - tag `'a;rm'` throws `Invalid tag: a;rm`

  Other tests:
  - `runDefaults`: `runDefaults(1)` → `{recommendedWorkers:1,maxWorkers:1}`, `runDefaults(6)` → `{3,6}`, `runDefaults(16)` → `{4,16}`.
  - `clampWorkers`: `clampWorkers(undefined,8)===1`, `clampWorkers(99,8)===8`, `clampWorkers(0,8)===1`.
  - `reporterVersion`: lock text containing `    raider_reporter (0.11.2)` → `'0.11.2'`, absent → `null`. `supportsLiveEvents('0.10.9')===false`, `('0.11.0')===true`, `('1.0.0')===true`, `(null)===false`.
- [ ] **Step 2: Run** `npx vitest run test/integration/run`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the signatures above. All rspec/cucumber/parallel commands run as `<ruby> -S bundle exec <tool>`.
- [ ] **Step 4: Run** `npx vitest run test/integration/run`. Expected: PASS.
- [ ] **Step 5: Commit** `Build live-run commands, worker defaults and reporter version check`.

### Task 4: NDJSON tail and translation (pure + fs)

**Files:**
- Create: `src/main/handlers/run/eventTail.ts`, `src/main/handlers/run/translate.ts`
- Tests: `test/integration/run/eventTail.test.ts`, `test/integration/run/translate.test.ts`

**Interfaces:**
- Produces:
  - `class EventTail { constructor(dir: string, onLine: (worker: number, line: unknown) => void, onBadLine: () => void); poll(): Promise<void> }`. Each `poll` reads new bytes from every `worker-<n>.ndjson` in `dir`, keeps a per-file offset and a held-back partial line, and parses each complete line with `JSON.parse`. A parse failure calls `onBadLine`.
  - `class Translator { constructor(runId: string, parallel: boolean); translate(worker: number, line: unknown): RunEvent[] }`.
    - It remembers `PlannedTest` by id from `plan`/`started`, so a `finished` line becomes a full `run:example`.
    - `worker` is set only when `parallel`. `full_name` maps to `fullName`, `duration_ms` to `durationMs`, `attempts` to `attempt`.
    - `done` and unknown `type` give `[]`. A line whose `v !== 1` gives `[]` and counts as bad.

- [ ] **Step 1: Write failing tests.**
  - `"reads lines appended across polls"`
  - `"holds a partial last line until its newline arrives"`. Write `{"v":1,"ty`, poll, expect 0 lines; append `pe":"done"}\n`, poll, expect 1.
  - `"picks up a worker file that appears after the first poll"`
  - `"reports bad JSON once per line and keeps going"`
  - `translate`:
    - a plan line → `run:planned` with `tests[0].fullName`
    - a `finished` after `started` → `run:example` with `file`, `line`, `description` from the started line, and `status`, `durationMs`, `attempt`
    - `worker` absent when not parallel and `2` for worker 2 when parallel
    - `v: 2` → `[]`
- [ ] **Step 2: Run** `npx vitest run test/integration/run`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** with tmpdir fixtures in the tests and `fs.promises` with `open`/`read` from an offset in the code.
- [ ] **Step 4: Run** `npx vitest run test/integration/run`. Expected: PASS.
- [ ] **Step 5: Commit** `Tail per-worker reporter event files and translate them to RunEvents`.

### Task 5: Run session state (pure)

**Files:**
- Create: `src/main/handlers/run/runSession.ts`, `src/main/handlers/run/outputPrefix.ts`
- Tests: `test/integration/run/runSession.test.ts`, `test/integration/run/outputPrefix.test.ts`

**Interfaces:**
- Consumes: `RunEvent` and friends from `src/shared/types/runEvents.ts`.
- Produces:
  - `class RunSession`, constructed with `{ runId, request: RunRequest, projectPath, framework, workers, liveEvents, emit: (e: RunEvent) => void, now?: () => Date }`. Methods:
    - `start(): void` → `run:started`
    - `phase(p: RunPhase): void` → `run:phase` only on change
    - `apply(events: RunEvent[]): void`. The first `run:planned` → phase `running`. It tracks the planned total (the sum over workers) and the latest status per id.
    - `output(stream, chunk, worker?)`, which buffers and is flushed by `flushOutput()` (the caller's 50 ms timer) into `run:output`
    - `requestCancel(): void`
    - `finish(exitCode: number | null, fallbackCounts?: RunCounts): void` → flushes output, then `run:finished`
    - `snapshot(): ActiveRun`
  - `finishStatus(...)`: export the rule as `finishStatus(input: { cancelled: boolean; liveEvents: boolean; planned: boolean; exitCode: number | null; counts: RunCounts; quarantinedFails: boolean }): RunFinishedStatus`, with the spec's order:
    1. `cancelled`
    2. `errored` when `liveEvents && !planned`, or when the exit code isn't 0 or 1 and no result has arrived
    3. `failed` when `failed > 0`, or `quarantinedFails && quarantined > 0`, or the exit code isn't 0 except for the case exit code 1 with `failed === 0 && quarantined > 0`
    4. otherwise `passed`
  - `parsePrefixedOutput(chunk: string): { worker: number | undefined; text: string }[]`. parallel_tests' `[TEST_ENV_NUMBER]` prefix; an empty number is worker 1.
  - Counts: `total` = the planned total (or the number of results when there's no plan); the other fields count the latest status per id.

- [ ] **Step 1: Write failing tests.**
  - `"emits running on the first plan only"`
  - `"total grows as each worker plans"`. Two plans of 2 and 3 → total 5.
  - `"counts the latest status per id under cucumber retry"`. failed then passed for one id → `{passed:1, failed:0}`.
  - `finishStatus` table:
    - cancelled wins
    - live with no plan and exit 1 → `errored`
    - exit 137 with no results → `errored`
    - exit 1, 0 failed, 1 quarantined → `passed`; the same with `quarantinedFails` → `failed`
    - exit 0, all passed → `passed`
    - exit 1, 1 failed → `failed`
    - degraded with exit 0 → `passed`
  - `"trims the oldest output past 2 MB and sets truncated"`. Push 3 chunks of 1 MB, so the snapshot keeps the last 2 and `run:finished.truncated === true`.
  - `parsePrefixedOutput`: `"[2] ..F\n[] done\n"` → workers `[2, 1]`; unprefixed text → `worker: undefined`.
- [ ] **Step 2: Run** `npx vitest run test/integration/run`. Expected: FAIL.
- [ ] **Step 3: Implement.** The 2 MB cap applies to the retained `run:output` chunks in `snapshot().events`. Live `emit` is never trimmed.
- [ ] **Step 4: Run** `npx vitest run test/integration/run`. Expected: PASS.
- [ ] **Step 5: Commit** `Track live-run phases, counts and final status`.

### Task 6: Runner process, IPC and preload

**Files:**
- Create: `src/main/handlers/run/runner.ts`, `src/main/handlers/run/runIpc.ts`, `test/integration/run/runner.test.ts`, `test/integration/run/fixtures/fake-run.mjs`
- Modify: `src/main/handlers/tests/projectTestIpc.ts` (export `listedFile` unchanged), `src/main/index.ts` (register handlers), `src/preload/index.ts` (expose `startRun`, `cancelRun`, `getActiveRun`, `getRunDefaults`, `onRunEvent` per `RunApi`), `src/preload/index.d.ts` if it declares `window.api`

**Interfaces:**
- Consumes:
  - Tasks 3–5 exports
  - `checkBundle` / `bundleInstall` (`src/main/handlers/ruby/`)
  - `buildShellCommand`, `shellQuote`, `isValidRubyCommand`
  - `listedFile`
  - `appState.projectPath`, `appState.mainWindow`
- Produces:
  - `startRun(request: RunRequest, deps?: Partial<RunnerDeps>): Promise<StartRunResult>`
  - `cancelRun(runId: string): Promise<void>`
  - `getActiveRun(): ActiveRun | null`
  - `RunnerDeps = { send(e: RunEvent): void; spawnCommand(cmd: string, cwd: string, env: NodeJS.ProcessEnv): ChildProcess; tempRoot: string; ensureBundle(projectPath, rubyCommand): Promise<{ ok: boolean; error?: string }>; graceMs: number }`. Tests inject a fake `spawnCommand` that runs `node fake-run.mjs`.
  - IPC channels: `start-run`, `cancel-run`, `get-active-run`, `get-run-defaults`, plus the push `run-event`.

- [ ] **Step 1: Write the fake child and failing tests.** `fake-run.mjs` reads `FAKE_SCRIPT` (JSON: lines to write into `$RAIDER_EVENTS_DIR/worker-1.ndjson` with delays, stdout text, an exit code, `ignoreSigint`). Tests:
  - `"streams started, phase booting→running, examples and finished passed"`
  - `"exit 1 with a failed example finishes failed"`
  - `"exit before any plan finishes errored with stderr in run:output"`
  - `"second startRun while running returns {error:'busy'}"`
  - `"cancel sends SIGINT and finishes cancelled"`
  - `"cancel escalates to SIGKILL after graceMs when SIGINT is ignored"` (graceMs 200)
  - `"degraded mode: liveEvents false, no plan, finishes by exit code"`. The lock file has reporter `0.10.0`; counts come from `raider-results/run.json` statuses when present.
  - `"rejects an unlisted file and an invalid ruby command without spawning"`
  - `"installing phase is sent only when ensureBundle reports missing gems"`
  - `"removes the previous run's temp dir on the next start"`

  Skip the signal tests on win32 (`it.skipIf(process.platform === 'win32')`).
- [ ] **Step 2: Run** `npx vitest run test/integration/run/runner.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `runner.ts`.**
  - Validate, then detect the framework (a `spec/` dir means rspec).
  - Read `Gemfile.lock`, then `ensureBundle` (phase `installing` only if gems are missing), then make the temp dir.
  - `spawn` through `buildShellCommand` with `{ shell: true, detached: process.platform !== 'win32' }`, env `RUBYOPT -EUTF-8`, `RAIDER_EVENTS_DIR`, and the cleaned `PATH`.
  - Run a 50 ms timer that polls `EventTail` and calls `session.flushOutput()`.
  - On `close`, do a final poll, then `session.finish(code)`.
  - Cancel: SIGINT to `-pid` → SIGKILL after `graceMs` (10 000 by default). On win32, `taskkill`.
  - Degraded counts: the latest `raider-results/run.json` or `run-*.json` results with `finished_at` ≥ the run's start.
  - Longship: `pushToLongship(status === 'passed' || status === 'failed', retainedStdout, durationMs)`.
- [ ] **Step 4: Wire the IPC.** `runIpc.ts` registers the channels; `get-run-defaults` → `runDefaults()`. Add the preload `RunApi`: `onRunEvent` returns an unsubscribe function that removes exactly its own listener.
- [ ] **Step 5: Run** `npx vitest run` (the whole suite), `npx tsc --noEmit -p tsconfig.node.json` and `npx tsc --noEmit -p tsconfig.web.json`. Expected: all pass, no type errors.
- [ ] **Step 6: Commit** `Add the live test runner: spawn, tail, cancel, IPC and preload RunApi`.
