# Ruby Raider Gem Integration Guide

Reference for how Raider Desktop should invoke every ruby_raider gem feature.
All commands go through `safeExec()` + `buildShellCommand()` as subprocess calls.
The gem manages `config/config.yml` internally — the desktop app should never write to it directly.

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

| Parameter | Values | Flag |
|-----------|--------|------|
| framework | `rspec`, `cucumber` | `-p framework:VALUE` |
| automation | `selenium`, `watir` | `-p automation:VALUE` |
| mobile | `ios`, `android`, `cross_platform` | `-p automation:VALUE` (overrides automation) |
| ci | `github` (default), `azure` | `-p ci:VALUE` |
| accessibility | boolean | `--accessibility` |

**Example:**
```bash
raider new "my_project" -p framework:rspec automation:selenium --accessibility
```

**Important:**
- `--accessibility` only works when `-p` (parameters hash) is provided. Without `-p`, the gem enters interactive TTY mode and ignores other flags.
- The gem runs `cd PROJECT_NAME && gem install bundler && bundle install` after creation. The desktop should verify the project directory exists after the command completes.
- `accessibility` is only supported for web automation types (selenium, watir). It is silently ignored for mobile.
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
  browser?: string          // 'chrome', 'firefox', 'safari', 'edge'
  url?: string              // base URL for tests
  timeout?: number          // seconds (default 10)
  headless?: boolean        // true/false
  viewport?: {
    width: number           // default 1920
    height: number          // default 1080
  }
  browser_arguments?: Record<string, string[]>  // per-browser args
  video?: {
    enabled: boolean
    fps: number
    max_width: number
  }
  platform?: string         // 'ios', 'android' (mobile only)
  page_path?: string        // custom page path override
  spec_path?: string        // custom spec path override
  feature_path?: string     // custom feature path override
  helper_path?: string      // custom helper path override
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

The gem strips any `:` prefix automatically, so both `raider u browser :firefox` and `raider u browser firefox` store `firefox`.

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

The arguments are stored per-browser. Setting arguments for `chrome` doesn't affect `firefox`'s arguments. The `--delete` flag removes arguments for the current browser only.

---

### 4.5 Timeout

**IPC Channel:** `update-timeout`

```bash
raider u timeout 30
raider u timeout 60
```

**Config key affected:** `timeout` (integer, in seconds)

Used for implicit waits and max wait time.

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
raider u video install    # downloads ffmpeg
```

**Config key affected:** `video.enabled` (boolean) for `on` / `off`

Recording needs ffmpeg. `RAIDER_FFMPEG_PATH` points the gem at an existing ffmpeg binary; `raider u video status` reports it as `(RAIDER_FFMPEG_PATH)`. See [Failure Video](#7-failure-video).

---

### 4.8 Custom Paths

**IPC Channel:** `update-paths`

```bash
raider u path /custom/pages              # page_path (default)
raider u path /custom/specs -s           # spec_path
raider u path /custom/features -f        # feature_path
raider u path /custom/helpers -h         # helper_path
```

**Config keys affected:** `page_path`, `spec_path`, `feature_path`, `helper_path`

These override where scaffolding generates files. When not set, defaults are:
- Pages: `page_objects/pages/`
- Specs: `spec/`
- Features: `features/`
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

**IPC Channel:** `scaffold-generate`

### 5.1 Generate Individual Files

```bash
raider g page LOGIN_PAGE                        # page object
raider g spec LOGIN_SPEC                        # spec/test file
raider g feature LOGIN                          # cucumber feature
raider g steps LOGIN_STEPS                      # step definitions
raider g helper AUTH_HELPER                     # helper module
raider g component HEADER                       # reusable component
```

**Flag (page, spec, feature, steps, helper, component):**

| Flag | Alias | Description |
|------|-------|-------------|
| `--path PATH` | `-p` | Custom output directory |

**Example:**
```bash
raider g page checkout -p custom/pages
```

### 5.2 Batch Scaffold

```bash
raider g scaffold users                          # page + spec (or feature + steps)
raider g scaffold users accounts products        # multiple resources
```

`scaffold` takes only names and has no flags. For an RSpec project (a `spec/` directory and no `features/`) it generates a spec and a page object. Otherwise it generates a feature, steps and a page object. Missing or unrecognised Gemfile entries produce a warning and default to selenium + rspec.

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

**Framework detection is automatic:**
- `spec/` directory exists → `rspec spec/`
- `features/` directory exists → `cucumber features`

**Parallel execution requires** `parallel_tests` gem in the project's Gemfile (`raid -p` runs `parallel_rspec spec/` or `parallel_cucumber features`).

---

## 7. Failure Video

Raider records a video of each test. The desktop shows it for failed tests: open a project, go to the **Dashboard** tab, click a failed result card, then expand **Failure video**.

- Recording needs ffmpeg. Until the bundled-ffmpeg release exists, set `RAIDER_FFMPEG_PATH` to an ffmpeg binary before launching the app and running tests, or run `raider u video install`.
- `raider u video status` prints the ffmpeg in use.
- `raider u video on` / `off` toggles `video.enabled` in `config/config.yml`. `VIDEO=off` also disables recording at runtime.
- Desktop's "push to Longship" (sent by the app after a run it launched) and raider_reporter's upload (run by the generated project's own test run) are separate paths. Enabling one does not enable the other.

---

## 8. Config File Schema

### Web Project (`config/config.yml`)

```yaml
browser: chrome
url: 'https://example.com'
timeout: 10
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

Appium capabilities are stored separately in `config/capabilities.yml`. The desktop app can read/write this file directly for mobile projects (this is the one exception to the "never write config directly" rule).

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

| Env Var | Overrides | Example |
|---------|-----------|---------|
| `HEADLESS` | `headless` config key | `HEADLESS=true bundle exec rspec` |
| `VIDEO` | `video.enabled` config key (`off` disables recording) | `VIDEO=off bundle exec rspec` |
| `RAIDER_FFMPEG_PATH` | Which ffmpeg binary recording uses | `RAIDER_FFMPEG_PATH=/opt/homebrew/bin/ffmpeg bundle exec rspec` |

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

### Template Overrides

Users can override default templates by placing `.tt` files in `.ruby_raider/templates/` inside their project. The desktop should be aware that generated file content may differ from defaults if overrides exist.

### Project Detection

The gem auto-detects the project's automation type and framework by reading the Gemfile when scaffolding:
- `selenium-webdriver` gem → selenium
- `watir` gem → watir
- `rspec` gem → rspec
- `cucumber` gem → cucumber

If nothing matches, it warns and defaults to selenium + rspec. The desktop can read the Gemfile directly and match against these gem names.
