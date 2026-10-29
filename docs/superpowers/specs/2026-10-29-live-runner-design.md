# Live test runner (main process + reporter event stream)

Parity item #3, the half owned by the Playwright-parity session. The desktop
no-code session owns the UI (its Plan 3) and builds against
`src/shared/types/runEvents.ts`, mocking `RunApi` until this lands.

## Why

Running a suite from the desktop app today is a black box: `raider u raid`
runs through `safeExec` (120 s timeout), and nothing shows until it exits.
The user's complaint is **"not having clear states"**. Success means that at
every moment of a run, the app can say exactly what the run is doing and what
each test is doing.

## Goals

- **Run states**, always known: `installing` (gems missing, `bundle install`
  running) → `booting` (Ruby and bundler loading, no test planned yet) →
  `running` → ended as `passed | failed | errored | cancelled`.
- **Test states**, always known: queued → running → passed / failed / pending /
  skipped, plus the worker in a parallel run.
- **Totals up front**: the planned test list arrives before the first test
  runs, so the UI can show "12 of 40" and the queued tests.
- **Parallel runs**: the user picks the worker count; the app recommends one.
- **Cancel**: stops the run, keeps the partial results.

## Non-goals

- UI: that's the desktop session's Plan 3.
- Changing `runSpecFiles`, `toRunResult`, the `run-raider-tests` IPC or
  `runRaiderTests.ts`: these stay as they are until the peer's Plan 4 merges.
  The new runner is additive.
- Steps, console output or per-attempt detail in run.json (parity #2 closed
  at the failed-test card).
- A `raider u raid --workers` option in the gem: the desktop builds its own
  commands. It's possible later for CLI parity, but not part of this work.

## Anti-goals

- A run that sits in `booting` forever. Every path must end in a final
  state: no reporter events, a crash before the plan, a killed process.
- Writing the events into the project (git noise, and it would clash with
  `clean_output_dir`).
- A reporting bug that fails the user's suite: every reporter hook stays
  inside the existing `guard`.

## Contract additions (`src/shared/types/runEvents.ts`, additive)

1. `run:phase`: `{ type: 'run:phase'; runId; phase: 'installing' | 'booting' | 'running' }`.
   - Main sends `installing` only when `checkBundle` fails, and `booting`
     right after spawning.
   - It sends `running` when the **first** `run:planned` arrives.
   - In live mode, a process that exits before any plan finishes as `errored`.
2. `run:planned`: `{ type: 'run:planned'; runId; tests: PlannedTest[]; worker? }`,
   with `PlannedTest = { id; file; line: number | null; description; fullName }`.
   - Each worker sends one.
   - In a parallel run, the total **grows** until every worker has planned.
     The renderer must allow "of N" to rise, because parallel_tests decides
     the grouping, so main can't know N in advance.
3. `run:started` gains `liveEvents: boolean` (degraded mode, below), and
   `ActiveRun` gains `projectPath: string` (Busy, below).
4. `RunApi.getRunDefaults(): Promise<{ recommendedWorkers: number; maxWorkers: number }>`.
   - *My call:* `recommendedWorkers = clamp(floor(cpus / 2), 1, 4)`,
     `maxWorkers = cpus`. Browser tests are heavy, so half the cores, capped
     at 4.
   - Main clamps `RunRequest.workers` to `[1, maxWorkers]`.
5. **Correction** to `run:example.attempt`. Today's comment says "one event per
   attempt", but rspec-retry (0.6.2, used by generated projects) re-runs the
   example inside one `example_started`/`example_passed` pair. So:
   - RSpec sends **one** final event per example, with `attempt` set to the
     total number of attempts.
   - Cucumber `--retry` does fire one event per attempt.
   - The comment is reworded to say both.

6. **Quarantined tests:** `ExampleStatus` gains `'quarantined'`, and
   `RunCounts` gains `quarantined: number`.
   - The reporter's `finished` line already carries it, because `record`
     sets it.
   - The **user decides** what a quarantined failure does to the run:
     `RunRequest` gains `quarantinedFails?: boolean`.
   - Default `false`: a run whose only failures are quarantined ends
     `passed`, with the count shown. `true`: it ends `failed`.
   - The setting is persisted and shown by the desktop session's UI (Plan
     3). Main only reads it from the request.

The peer is told about all six in one message. Adding to the `RunEvent`
union breaks only an exhaustive `never` switch, so we ask them to check.

## raider_reporter: event stream (owner: reporter repo)

- **Turning it on:** the stream is on only when `RAIDER_EVENTS_DIR` is set.
  - Each process writes `<dir>/worker-<n>.ndjson`, where `n` is the
    `ShardDetector` index (so it matches `run-<n>.json`), or `1` with no shard.
  - With the variable unset, nothing changes.
- **Lines:** one JSON object per line, with `"v":1`. The file is opened in
  append mode, `sync = true`, so the tail sees each line as it's written.
- **Line types:**
  - `plan` `{tests:[{id,file,line,description,full_name}]}`
  - `started` `{id,file,line,description,full_name}`
  - `finished` `{id, status, duration_ms, attempts}`
  - `done` `{}`
- **RSpec hooks:**
  - `start` → `plan`, built from
    `RSpec.world.ordered_example_groups.flat_map(&:descendants).flat_map { |g| RSpec.world.filtered_examples[g] }`.
    This respects the filters, so the plan equals what actually runs.
  - `example_started` → `started`.
  - passed / failed / pending → `finished`, sent from `record`, which already
    holds the final status (quarantined included) and attempts.
  - `close` → `done`.
- **Cucumber hooks:**
  - the existing `expect_cases(test_cases)` (TestRunStarted) → `plan`
  - `case_started` → `started`
  - `case_finished` → `finished`
  - `run_finished` → `done`
- **Shared rules:**
  - `id` / `file` / `full_name` use the same `identity_for` / `example.id`
    values as the results in run.json, so the join holds.
  - Strings are capped with `Text`.
  - Each write is wrapped in `guard`; on an IO error the stream switches off
    with one warning.
- **Release:** both repos are in this plan. The desktop side doesn't wait
  for the gem: it's tested with the fake-ruby script, plus a local
  reporter checkout via a `path:` Gemfile for a manual check. Publishing
  0.11.0 to rubygems needs the user's okay, like any push.
- **Version:** this ships as **raider_reporter 0.11.0**. Generated projects
  already require `~> 0.10`, which allows 0.11.

## Main process runner (owner: desktop repo, `src/main/handlers/run/`)

- **IPC:** `start-run`, `cancel-run`, `get-active-run` and
  `get-run-defaults`, plus `run-event` pushes. The preload exposes `RunApi`.
- **Commands** are built as argv. The ruby command is checked with
  `isValidRubyCommand`, and every value is quoted with
  `shellQuote`/`buildShellCommand`. The serial forms run through
  `bundle exec`; the parallel forms are the same commands with `-n <workers>`.

  | | Serial | Parallel |
  |---|---|---|
  | RSpec | `<ruby> -S bundle exec rspec [paths \| --tag t…]` | `parallel_rspec -n <workers> --prefix-output-with-test-env-number [paths \| -o '--tag t']` |
  | Cucumber | `cucumber [paths \| --tags @t…]` | `parallel_cucumber` with the same options |

  - The framework is detected the way the gem does it: a `spec/` directory
    means RSpec, otherwise Cucumber.
  - *My call:* a `locations` scope always runs serially, because
    parallel_tests can't split `file:line`.
- **Spawning:** `spawn` with `cwd` set to `appState.projectPath`.
  - The environment adds `RUBYOPT -EUTF-8` (as today) and
    `RAIDER_EVENTS_DIR = <app temp>/raider-runs/<runId>/`.
  - The process is spawned `detached: true`, so it gets its own process
    group.
  - There is no timeout.
  - The temp directory is deleted when the next run starts.
- **Tailing the events:**
  - Poll `worker-*.ndjson` in the run directory (~100 ms; files can appear
    late).
  - Read new bytes since the last offset and hold back a partial last line.
  - Turn each line into a `RunEvent`. `worker` is set only when workers > 1.
  - `started` lines become `run:example` with status `started`.
  - Unknown `v` or bad JSON: skip the line, and warn once per run.
- **Output:**
  - stdout and stderr are batched every ~50 ms into `run:output`.
  - In a parallel run, the `[TEST_ENV_NUMBER]` prefix is parsed into `worker`
    (an empty number means worker 1).
  - Retained output is capped at ~2 MB, trimming the oldest and setting
    `truncated`.
- **Finishing:** the status is decided in this order:
  1. `cancelled` if a cancel was requested;
  2. `errored` if live mode saw no plan, or the exit code isn't 0 (including
     no exit code, i.e. killed by a signal) and no result came in, whether
     from the events or from run.json in degraded mode;
  3. `failed` if any test failed, or if `quarantinedFails` is set and any
     test was quarantined, or if the exit code isn't 0 for any reason other
     than quarantined failures (live mode: the exit code is 1 and every
     failure was quarantined, so this rule doesn't apply);
  4. otherwise `passed`.
  - Counts come from the events, or from run.json in degraded mode.
  - After `run:finished`, the renderer reads the failure details from
    run.json or the `run-<n>.json` shards. `raiderResults.ts` already merges
    shards, so no new merge is needed.
- **Cancelling:**
  - On macOS and Linux, send `SIGINT` to the process group. RSpec and
    Cucumber stop after the current test and still write run.json, so the
    partial results survive.
  - If it hasn't exited after 10 s, send `SIGKILL`.
  - On Windows (an electron-builder target), use `taskkill /pid <pid> /T /F`,
    which can't stop gracefully, so partial run.json may be missing.
  - *My call:* a cancelled run keeps showing whatever results it has.
- **Busy:** *my call:* one run **per app**, not per project. Browser runs
  are heavy, and `getActiveRun`/`cancelRun` then need no project argument.
  A second `startRun` gets `{error:'busy'}`. `ActiveRun` gains
  `projectPath: string`, so a renderer that switched project can tell the
  run isn't for the project it's showing. `getActiveRun` returns the current
  or last run, with its events, for a renderer that reloads.
- **Tags:** *my call:* several tags mean **any of them** (OR).
  - RSpec: repeated `--tag t`.
  - Cucumber: one `--tags "@a or @b"` expression, because repeated `--tags`
    would mean AND.
  - Parallel: the same, inside `-o`.
- **Degraded mode:**
  - Before spawning, read `raider_reporter (x.y.z)` from `Gemfile.lock`. If
    it's below 0.11.0, or missing, set `liveEvents: false`. The variable is
    still set; it does no harm.
  - Phases still go `installing`/`booting`, then straight to the finished
    state. There's no plan and no per-test events, and output still streams.
  - The renderer can show "Update raider_reporter for live test states"
    (text is the desktop session's call).
  - *My call:* if a live-mode run shows no plan, it ends as `errored` only
    when the process exits. There's no watchdog timer, because slow boots
    are real.
- **Longship:** *my call* to keep today's behaviour: `pushToLongship(success,
  output, durationMs)` on finish, with `success = status === 'passed' ||
  status === 'failed'`, matching today's "tests ran" meaning.

## Testing

- **Reporter (RSpec specs):**
  - a fixture suite run with `RAIDER_EVENTS_DIR`: the plan equals the
    filtered examples (`--tag`, `:focus`), and every line parses;
  - a retried example: one `finished` with `attempts: 2`;
  - Cucumber: plan, started, finished and done in order;
  - the variable unset: no file; an IO error: the stream switches off and the
    suite still passes.
- **Desktop unit tests (vitest):**
  - turning a scope into argv: all 4 scopes, serial and parallel, quoting,
    and locations forcing serial;
  - the NDJSON tail: a partial line, a file appearing late, bad JSON;
  - the phase and finish state machine;
  - the 2 MB trim;
  - parsing the parallel output prefix;
  - the Gemfile.lock version check;
  - `getRunDefaults`.
- **Runner integration:** a fake "ruby" script that writes NDJSON, prints
  output and exits with a chosen code, so no host Ruby is needed. Cases:
  - pass and fail;
  - errored before the plan;
  - cancel (SIGINT handled, and SIGINT ignored → SIGKILL);
  - degraded mode;
  - two workers.
- **e2e:** none. The peer's Plan 3 owns the UI e2e.

## Left to the builder

File layout under `src/main/handlers/run/`; the internal names of the
reporter's event writer; the exact poll interval and batching timer setup.
