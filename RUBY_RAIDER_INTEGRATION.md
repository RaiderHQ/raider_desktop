# Ruby Raider Gem Integration Guide

Reference for how Raider Desktop should invoke every ruby_raider gem feature.
All commands go through `safeExec()` + `buildShellCommand()` as subprocess calls.
The gem manages `config/config.yml` internally — the desktop app should never write to it directly.

**Gem version:** the desktop targets ruby_raider **4.0.0 or later** (its runtime: `require 'ruby_raider/runtime'`, no WaitHelper, no Watir, no Cucumber) and raider_reporter **1.0.0 or later**. A project whose `Gemfile.lock` (or Gemfile pin) names an older ruby_raider is neither recordable nor runnable; the Tests tab offers the update (section 10).

---

## Table of Contents

1. [Shell Execution Pattern](#1-shell-execution-pattern)
2. [Project Creation](#2-project-creation)
3. [Config Reading](#3-config-reading)
4. [Config Updates (Utility Commands)](#4-config-updates-utility-commands)
5. [Scaffolding Commands](#5-scaffolding-commands)
6. [Test Execution](#6-test-execution)
7. [Failure Video](#7-failure-video)
8. [Config File Schema](#8-config-file-schema)
9. [Common Pitfalls](#9-common-pitfalls)
10. [The 4.0 Runtime and Generated Specs](#10-the-40-runtime-and-generated-specs)

---

## 1. Shell Execution Pattern

Every raider command follows this pattern:

```typescript
import { safeExec } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'

// Extract Ruby version from rubyCommand for RBENV_VERSION pinning
const versionMatch = rubyCommand.match(/rbenv shell ([\d.]+)/)
const rubyVersion = versionMatch ? versionMatch[1] : undefined

const command = buildShellCommand(projectPath, 'raider u browser chrome', rubyVersion)
const result = await safeExec(command, { timeout: 30_000 })
```

**Platform behavior:**

- macOS/Linux: `eval "$(rbenv init - 2>/dev/null || true)" && export RBENV_VERSION=X.Y.Z && cd "/path" && raider ...`
- Windows: `cd /d "/path" && raider ...`

**Timeouts:**
| Operation | Timeout |
|-----------|---------|
| Config updates | 30s (default) |
| Project creation | 120s |
| Test execution | 120s |
| Bundle install | 120s |

---

## 2. Project Creation

**IPC Channel:** `run-ruby-raider`

**Command:**

```bash
raider new "PROJECT_NAME" -p framework:FRAMEWORK automation:AUTOMATION [flags]
```

**Parameters:**

| Parameter     | Values                             | Flag                                                                                                   |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| framework     | `rspec` (4.0 removed `cucumber`)   | `-p framework:VALUE`                                                                                   |
| automation    | `selenium` (4.0 removed `watir`)   | `-p automation:VALUE`                                                                                  |
| mobile        | `ios`, `android`, `cross_platform` | `-p automation:VALUE` (overrides automation; the desktop never sends it: it creates web projects only) |
| ci            | `github` (default), `azure`        | `-p ci:VALUE`                                                                                          |
| accessibility | boolean                            | `--accessibility`                                                                                      |

**Example:**

```bash
raider new "my_project" -p framework:rspec automation:selenium --accessibility
```

**Important:**

- `--accessibility` only works when `-p` (parameters hash) is provided. Without `-p`, the gem enters interactive TTY mode and ignores other flags.
- With `-p`, the gem does not run `bundle install`. Only the interactive menu path (`MenuGenerator#set_up_framework`) runs `cd PROJECT_NAME && gem install bundler && bundle install`. The desktop should verify the project directory exists after the command completes.
- `accessibility` is only supported for web projects (selenium). It is silently ignored for mobile.
- Invalid `framework`, `automation` or `ci` values make the gem exit non-zero with an error listing the allowed values.

**Verify success:**

```typescript
const expectedPath = path.join(folderPath, projectName)
fs.existsSync(expectedPath) // true = project created
```

---

## 3. Config Reading

**IPC Channel:** `get-project-config`

Read `config/config.yml` directly using `js-yaml`. This is the one case where the desktop reads the gem's file:

```typescript
import yaml from 'js-yaml'
import { readFile } from 'fs/promises'
import { join } from 'path'

const configPath = join(projectPath, 'config', 'config.yml')
const content = await readFile(configPath, 'utf-8')
const config = yaml.load(content) as Record<string, unknown>
```

**Available keys to read:**

```typescript
interface FullProjectConfig {
  browser?: string // 'chrome', 'firefox' (safari and edge also work once `raider u browser` seeds an empty `browser_arguments` entry)
  url?: string // base URL for tests
  timeout?: number // seconds (default 10)
  headless?: boolean // true/false
  viewport?: {
    width: number // default 1920
    height: number // default 1080
  }
  browser_arguments?: Record<string, string[]> // per-browser args
  video?: {
    enabled: boolean
    fps: number
    max_width: number
  }
  platform?: string // 'ios', 'android' (mobile only)
  page_path?: string // custom page path override
  spec_path?: string // custom spec path override
  feature_path?: string // custom feature path override
  helper_path?: string // custom helper path override
}
```

**Important:**

- The `browser` value is always stored WITHOUT a colon prefix (e.g. `chrome`, not `:chrome`). This was fixed in gem v3.0.1+.
- `browser_arguments` keys also have no colon prefix (e.g. `chrome`, `firefox`).
- Missing `config/config.yml` is not an error — it means no config exists yet.
- Never read from `config/browsers/default_browser.yml` — that path does not exist. Browser config lives in `config/config.yml` under the `browser` key.

---

## 4. Config Updates (Utility Commands)

All config writes go through `raider u` CLI commands. Never write to `config/config.yml` directly.

### 4.1 Browser

**IPC Channel:** `update-browser-type`

```bash
raider u browser chrome
raider u browser firefox
raider u browser safari
raider u browser edge
```

**Config key affected:** `browser`

Switching browser also ensures `browser_arguments[<name>]` exists (defaulting to `[]`), so safari and edge work like chrome and firefox. The gem strips any `:` prefix automatically, so both `raider u browser :firefox` and `raider u browser firefox` store `firefox`.

---

### 4.2 Base URL

**IPC Channel:** `update-browser-url`

```bash
raider u url https://example.com
raider u url http://localhost:3000
```

**Config key affected:** `url`

---

### 4.3 Headless Mode

**IPC Channel:** `update-headless-mode`

```bash
raider u headless on
raider u headless off
```

**Config key affected:** `headless` (boolean `true`/`false`)

Accepted "on" values: `on`, `true`, `1`, `yes`
Everything else is treated as off.

At runtime, tests also check `ENV['HEADLESS']`. Setting the env var overrides the config value. The desktop can use either approach:

- **Persistent:** `raider u headless on` (writes to config)
- **Per-run:** Pass `HEADLESS=true` as environment variable to test execution

---

### 4.4 Browser Options / Arguments

**IPC Channel:** `update-browser-options`

```bash
# Set arguments for the CURRENT browser
raider u browser_options no-sandbox disable-dev-shm-usage headless

# Or set browser + arguments together
raider u browser chrome --opts no-sandbox disable-dev-shm-usage

# Delete arguments for the current browser
raider u browser_options --delete

# Or via browser command
raider u browser --delete
```

**Config key affected:** `browser_arguments[BROWSER_NAME]` (array of strings)

The arguments are stored per-browser. Setting arguments for `chrome` doesn't affect `firefox`'s arguments. The `--delete` flag clears arguments for the current browser only: it writes `[]` for that browser rather than removing the key, so the generated driver keeps working.

---

### 4.5 Timeout

**IPC Channel:** `update-timeout`

```bash
raider u timeout 30
raider u timeout 60
```

**Config key affected:** `timeout` (integer, in seconds)

The one wait of the 4.0 runtime: how long `find_element`, the actions (`click`, `send_keys`, `clear`, `submit`) and the retrying matchers wait. The runtime asks for **no implicit wait** on the driver. `raider u strict on|off` and `raider u actionability on|off` set the two other runtime keys; `RAIDER_TIMEOUT`, `RAIDER_STRICT`, `RAIDER_ACTIONABILITY` override them per run.

---

### 4.6 Viewport

**IPC Channel:** `update-viewport`

```bash
raider u viewport 1920x1080    # desktop
raider u viewport 375x812      # iPhone
raider u viewport 768x1024     # tablet
```

**Config key affected:** `viewport.width` and `viewport.height` (integers)

Format must be `WIDTHxHEIGHT` (lowercase x separator).

---

### 4.7 Failure Video

```bash
raider u video on
raider u video off
raider u video status     # prints which ffmpeg is in use
raider u video install    # not usable yet: assets have sha256: nil, so it fails until the release exists
```

**Config key affected:** `video.enabled` (boolean) for `on` / `off`

Recording needs ffmpeg. `RAIDER_FFMPEG_PATH` points the gem at an existing ffmpeg binary; `raider u video status` reports it as `(RAIDER_FFMPEG_PATH)`. See [Failure Video](#7-failure-video).

---

### 4.8 Custom Paths

The desktop does not set these (4.0.0 removed its Paths settings and the `update-paths` channel): it always passes `--path` when it generates a file, and it reads `spec_path` and `helper_path` to find specs and helpers.

```bash
raider u path /custom/pages              # page_path (default)
raider u path /custom/specs -s           # spec_path
raider u path /custom/helpers -h         # helper_path
```

**Config keys affected:** `page_path`, `spec_path`, `helper_path`. `path` takes only `-s` and `-h` (`-f` is an error in 4.0), so the desktop offers no Features path; an older `feature_path` key is still read but nothing generates into it.

These set where `raider g` writes when no `--path` is given. When not set, defaults are:

- Pages: `page_objects/pages/`
- Specs: `spec/`
- Helpers: `helpers/`

---

### 4.9 Platform (Mobile)

```bash
raider u platform ios
raider u platform android
```

**Config key affected:** `platform`

Only relevant for cross-platform mobile projects.

---

## 5. Scaffolding Commands

**IPC Channel:** `scaffold-generate`. The desktop runs `raider g <page|spec|component|helper> <name> --path=<folder>` from the Files tab's folder menu; `path` is required.

### 5.1 Generate Individual Files

```bash
raider g page LOGIN_PAGE                        # page object
raider g spec LOGIN_SPEC                        # spec/test file
raider g helper AUTH_HELPER                     # helper module
raider g component HEADER                       # reusable component
```

**Flag (page, spec, helper, component):**

| Flag          | Alias | Description             |
| ------------- | ----- | ----------------------- |
| `--path PATH` | `-p`  | Custom output directory |

**Example:**

```bash
raider g page checkout -p custom/pages
```

### 5.2 Batch Scaffold

```bash
raider g scaffold users                          # page + spec
raider g scaffold users accounts products        # multiple resources
```

The desktop does not offer `raider g scaffold`. `scaffold` takes only names and has no flags. It generates a spec and a page object (4.0 removed `raider g feature`, `raider g steps` and `raider u path --feature`). Missing or unrecognised Gemfile entries produce a warning and default to selenium + rspec.

---

## 6. Test Execution

**IPC Channel:** `run-raider-tests`

### Pre-execution Check

Before running tests, verify gems are installed:

```bash
bundle check
```

If exit code != 0, run:

```bash
bundle install
```

### Run Tests

```bash
bundle exec raider u raid                   # run all tests
bundle exec raider u raid -p                # run in parallel
bundle exec raider u raid -o --seed 42      # with custom options
```

Projects are RSpec only (4.0 removed Cucumber): `raid` runs `rspec spec/`. The desktop's live runner runs `bundle exec rspec` / `parallel_rspec` itself (`src/main/handlers/run/runCommand.ts`) and reads raider_reporter's `raider-results/run.json` and events.

**Parallel execution requires** `parallel_tests` gem in the project's Gemfile (`raid -p` runs `parallel_rspec spec/`).

---

## 7. Failure Video

Raider records a video of each test. The desktop shows it for failed tests: open a project, go to the **Dashboard** tab, click a failed result card, then expand **Failure video**.

- Recording needs ffmpeg. Until the bundled-ffmpeg release exists, set `RAIDER_FFMPEG_PATH` to an ffmpeg binary before launching the app and running tests. `raider u video install` is not usable yet because every asset in `lib/ruby_raider/ffmpeg.rb` has `sha256: nil`.
- `raider u video status` prints the ffmpeg in use.
- `raider u video on` / `off` toggles `video.enabled` in `config/config.yml`. `VIDEO=off` also disables recording at runtime.
- Desktop's "push to Longship" (sent by the app after a run it launched) and raider_reporter's upload (run by the generated project's own test run) are separate paths. Enabling one does not enable the other.

---

## 8. Config File Schema

### Web Project (`config/config.yml`)

```yaml
browser: chrome
url: 'https://example.com'
timeout: 10 # seconds that finds, actions and assertions wait before failing
strict: true # find_element fails when a locator matches more than one element
actionability: true # actions wait until the element is ready; force: true skips it
headless: false

viewport:
  width: 1920
  height: 1080

browser_arguments:
  chrome:
    - no-sandbox
    - disable-dev-shm-usage
    - ignore-certificate-errors
    - search-engine-choice-country
  firefox:
    - acceptInsecureCerts
    - no-sandbox

video:
  enabled: true
  fps: 5
  max_width: 1280

# Optional — only present when explicitly set
page_path: 'custom/pages'
spec_path: 'custom/specs'
feature_path: 'custom/features'
helper_path: 'custom/helpers'
```

### Mobile Project (`config/config.yml` and `config/capabilities.yml`)

`config/config.yml` holds `platform` and `video`.

Appium capabilities are stored separately in `config/capabilities.yml`. The desktop does not read or write it: mobile (Appium) projects are not supported in this version, and opening one shows a not-supported message.

---

## 9. Common Pitfalls

### Browser Value Format

The gem stores browser names **without colon prefix**: `chrome`, `firefox`, `edge`, `safari`.

The desktop should:

- When reading config: use the value as-is (`config['browser']` → `'chrome'`)
- When displaying: show as-is (no need to add/remove colons)
- When setting: `raider u browser firefox` (no colon needed, gem strips it anyway)

The driver templates call `.to_sym` on the value, so `"chrome".to_sym` → `:chrome` works correctly. Storing `:chrome` (with colon) would produce `":chrome".to_sym` → `":chrome"` which breaks Selenium.

### Config File Location

All project configuration lives at **`config/config.yml`** inside the project root. There is no `config/browsers/` directory, no `default_browser.yml`. If the desktop needs browser info, read it from `config/config.yml` under the `browser` key.

### Config Memoization

The gem's `Utilities` module reloads `config/config.yml` from disk before every write operation. This means:

- Multiple sequential updates from the desktop are safe
- External changes to the file are picked up on the next write
- No stale cache between calls, even in long-running processes

### Environment Variables for Runtime Overrides

These env vars override config values at test execution time without modifying files:

| Env Var              | Overrides                                             | Example                                                         |
| -------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| `HEADLESS`           | `headless` config key                                 | `HEADLESS=true bundle exec rspec`                               |
| `VIDEO`              | `video.enabled` config key (`off` disables recording) | `VIDEO=off bundle exec rspec`                                   |
| `RAIDER_FFMPEG_PATH` | Which ffmpeg binary recording uses                    | `RAIDER_FFMPEG_PATH=/opt/homebrew/bin/ffmpeg bundle exec rspec` |

Pass these when spawning test processes:

```typescript
const command = buildShellCommand(projectPath, 'HEADLESS=true bundle exec raider u raid')
```

### `--accessibility` Requires `-p`

This flag only works when the `-p` (parameters) flag is also provided. Without `-p`, the gem enters the interactive TTY menu and ignores it. The desktop should always use `-p` for project creation.

### Name Normalization

The gem's `NameNormalizer` strips common suffixes from scaffold names:

- `_page` → stripped (e.g. `login_page` → `login`)
- `_spec` → stripped
- `_test` → stripped
- `_steps` → stripped
- `_helper` → stripped
- `_feature` → stripped

The desktop should pass clean resource names (e.g. `login`, not `login_page`). The gem adds appropriate suffixes based on the file type being generated.

### Project Detection

The gem auto-detects the project's automation type and framework by reading the Gemfile when scaffolding:

- `selenium-webdriver` gem → selenium
- `rspec` gem → rspec
- `appium_lib`, `eyes_selenium` and `axe-core-*` gems are also mapped (`project_detector.rb`)

If nothing matches, it warns and defaults to selenium + rspec. The desktop reads the Gemfile directly (`src/main/handlers/project/projectLayout.ts`): `appium_lib` → mobile (`unsupportedReason: 'mobile'`: not supported, nothing opens past the message, main refuses runs), `minitest` without `rspec` or `capybara` → not recordable, and the ruby_raider version from `Gemfile.lock` (`    ruby_raider (x.y.z)`) or the Gemfile pin → below 4 is not recordable or runnable (`unsupportedReason: 'gemTooOld'`).

---

## 10. The 4.0 Runtime and Generated Specs

What the desktop writes into a project (`src/main/codegen/steps.ts`, `testFile.ts`) and what the gem must provide for it.

**Every recorded spec** (in a project or exported standalone):

```ruby
require_relative '../helpers/spec_helper'   # standalone: require 'selenium-webdriver' and 'rspec'
require 'ruby_raider/runtime/rspec'

describe 'Login' do
  include Raider::Matchers
  include Raider::Helpers
  it 'Login' do
    driver.navigate.to('https://example.com/login')
    driver.find_element(label: ['Login name', { exact: true }]).clear
    driver.find_element(label: ['Login name', { exact: true }]).send_keys('aguspe')
    driver.find_element(id: 'loginFrm_password').send_keys(ENV.fetch('RAIDER_SECRET_1'))
    driver.find_element(by_role('button', name: 'Login', exact: true)).click
    expect { driver.find_element(text: ['Welcome back', { exact: true }]) }.to be_visible
    expect(driver).to have_title('My account')
    expect { driver.current_url }.to include('account/account')
  end
end
```

The require and the two includes are in the spec itself, so it also runs in a project whose `helpers/spec_helper.rb` predates 4.0 (pin bumped to `~> 4.0`, `bundle update ruby_raider`). Standalone files set `Raider.timeout = <explicit wait>` and no implicit wait.

**Locators** (`src/shared/types/step.ts` `Locator` → Ruby): `role` → `by_role('button', name: 'Save', exact: true)`; `label` → `label: ['Email', { exact: true }]`; `text` → `text: ['Sign in', { exact: true }]`; `testId` → `test_id: 'x'` (the attribute name is the project's `test_id_attribute`, the key both sides read); `id` → `id: 'x'`; `css` / `xpath` as the weak fallback. `exact: true` because the recorder proves uniqueness by exact text and the runtime's substring default under `strict` would raise `Raider::AmbiguousMatch`.

**Checks** (the `assert` and `wait` steps): element matchers in the block form, `expect { driver.find_element(loc) }.to be_visible | be_hidden | be_enabled | be_checked | have_text('x', exact: true) | have_text('x') | have_value('x')`; the block re-finds the element on every poll and lets `be_hidden` pass once the element is gone. Page checks: `expect(driver).to have_title('x')` and `expect { driver.current_url }.to include('x')` (`have_url` compares the whole URL).

**Actions**: `find_element(loc).click`, `.clear` + `.send_keys('x')`, `.send_keys(:enter)`, `driver.switch_to.frame(driver.find_element(loc))`. No `eventually`, no `WaitHelper`, no `displayed?` / `enabled?` / `selected?` / `attribute(loc, 'value')` / `find_elements(loc, timeout: 0)`: all removed in 4.0.

**Sidecars** (`.raider/tests/<spec>.json`) carry `codegen: 2`; on project open, `migrateRecordedTests` rewrites Raider-owned specs written in an older shape (hand-edited ones are left alone and marked code-owned).

**Traces** written by the runtime (`raider-trace` v1): action steps `click`, `send_keys`, `clear`, `submit` with `locator` (`strategy` one of Selenium's keys or `role` with selector text `button, name: Login, exact: true`, `label`, `text`, `test_id`, `placeholder`, `alt`, `title`), `within` and `waited_ms`, plus `navigate`, `match_screenshot` and `failure`. No `group` steps, no read steps. A passing test keeps its trace only with `TRACE=on`.

**Upgrade** (`upgrade-ruby-raider` IPC, after the user confirms): the active `gem 'ruby_raider', '…'` line of the Gemfile is set to `'~> 4.0'`, then `<rubyCommand> -S bundle update ruby_raider` runs in the project and the project is activated again.
