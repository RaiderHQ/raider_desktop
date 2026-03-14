# Ruby Raider Backend Parity Guide

> **Purpose**: Machine-readable reference for Claude agents working on raider_desktop.
> Describes every ruby_raider feature that requires desktop UI parity, its current
> CLI invocation, and whether raider_desktop already supports it.
>
> **Last synced**: 2026-03-13 against ruby_raider branch `add-e2e-and-content-tests`

---

## How raider_desktop invokes ruby_raider

All Ruby Raider interactions use **shell commands** via `safeExec()`:
```
ruby -S raider <command> [args] -p key:value key:value ...
```
The desktop app never loads Ruby modules directly.
Key handler files:
- `src/main/handlers/project/runRubyRaider.ts` — project creation
- `src/main/handlers/project/adoptAnalyze.ts` / `adoptExecute.ts` — adopt flow
- `src/main/handlers/project/scaffoldGenerate.ts` — scaffolding

---

## 1. Project Creation (`raider new`)

### Supported Framework Combinations

| Automation | Frameworks | Desktop Status |
|------------|-----------|----------------|
| Selenium | Cucumber, RSpec, Minitest | Supported |
| Capybara | Cucumber, RSpec, Minitest | Supported |
| Watir | Cucumber, RSpec, Minitest | Supported |
| Appium iOS | Cucumber, RSpec, Minitest | Supported |
| Appium Android | Cucumber, RSpec, Minitest | Supported |
| Appium Cross-Platform | Cucumber, RSpec, Minitest | Supported |

### CLI Flags for `raider new`

| Flag | CLI Usage | Desktop Status | Priority | Notes |
|------|-----------|---------------|----------|-------|
| `-p framework:X automation:Y` | Core params | Supported | — | Already in `runRubyRaider.ts` |
| `--accessibility` | `raider new foo --accessibility` | **MISSING** | HIGH | Adds axe gem + example accessibility test. Web-only. |
| `--visual` | `raider new foo --visual` | **MISSING** | HIGH | Adds chunky_png gem + visual comparison helper + example visual test. Web-only. |
| `--performance` | `raider new foo --performance` | **MISSING** | HIGH | Adds Lighthouse performance helper + example perf test. Web-only. Requires `npm install -g lighthouse`. |
| `--reporter CHOICE` | `raider new foo -r allure` | **MISSING** | MEDIUM | Options: `allure`, `junit`, `json`, `both`, `all`, `none`. Replaces previous allure-only default. |
| `--skip_ci` | `raider new foo --skip_ci` | **MISSING** | LOW | Omits CI/CD configuration files. |
| `--skip_allure` | `raider new foo --skip_allure` | **MISSING** | LOW | Omits Allure reporting setup. |
| `--skip_video` | `raider new foo --skip_video` | **MISSING** | LOW | Omits video recording helper. |
| CI platform | `-p ci_platform:github` or `gitlab` | **PARTIAL** | MEDIUM | Desktop may already pass this but needs UI selector for GitHub Actions vs GitLab CI. |

### Implementation for Desktop

Add-ons (`--accessibility`, `--visual`, `--performance`) should appear as **checkboxes** on the "New Project" screen, enabled only when automation is web-based (Selenium/Capybara/Watir). Disable them when Appium is selected.

Reporter selection should be a **dropdown** with: Allure, JUnit, JSON, Both, All, None.

Shell command format:
```bash
ruby -S raider new "project_name" -p framework:rspec automation:selenium \
  --accessibility --visual --performance -r allure
```

---

## 2. Scaffolding Commands (`raider g`)

### Basic Scaffolding (already supported)

| Command | CLI | Desktop Status |
|---------|-----|---------------|
| `raider g page NAME` | Generate page object | Supported via `scaffoldGenerate.ts` |
| `raider g spec NAME` | Generate spec file | Supported |
| `raider g feature NAME` | Generate feature file | Supported |
| `raider g steps NAME` | Generate step definitions | Supported |
| `raider g scaffold NAME` | Generate page + spec/feature + steps | Supported |

### New Scaffolding Features

| Command | CLI Usage | Desktop Status | Priority | Notes |
|---------|-----------|---------------|----------|-------|
| `raider g component NAME` | Generates a component class | **MISSING** | MEDIUM | Inherits from `Component` base class |
| `raider g helper NAME` | Generates a helper file | **MISSING** | MEDIUM | |
| `raider g scaffold NAME --crud` | CRUD pages (list, create, detail, edit) + tests + model | **MISSING** | HIGH | Generates 4 page objects, 4 specs, model YAML |
| `raider g scaffold NAME --with page,spec,model` | Selective scaffold | **MISSING** | MEDIUM | Only generates chosen components |
| `raider g scaffold` (no args) | Interactive scaffold menu | N/A | — | Desktop should use its own UI instead |
| `raider g destroy NAME` | Deletes scaffolded files | **MISSING** | MEDIUM | Alias: `raider g d NAME` |
| `raider g destroy NAME --with page,spec` | Selective destroy | **MISSING** | LOW | |
| `--dry_run` | Preview files without creating them | **MISSING** | LOW | Could show in a confirmation modal |
| `--uses page1,page2` | Adds `require_relative` for dependent pages | **MISSING** | LOW | |
| `--delete` / `-d` on any scaffold type | Delete individual scaffold file | **MISSING** | LOW | e.g., `raider g page Foo -d` |

### URL-Based Generation

| Command | CLI Usage | Desktop Status | Priority | Notes |
|---------|-----------|---------------|----------|-------|
| `raider g from_url URL` | Scrape URL → page object + spec | **MISSING** | HIGH | Core feature — auto-generates page object from live URL |
| `raider g from_url URL --ai` | LLM-enhanced analysis | **MISSING** | MEDIUM | Requires LLM configuration. Falls back to non-AI. |
| `raider g from_url URL --name Foo` | Override page name | **MISSING** | LOW | |

### Spec From Page

| Command | CLI Usage | Desktop Status | Priority | Notes |
|---------|-----------|---------------|----------|-------|
| `raider g spec NAME --from path/to/page.rb` | Generate spec stubs from existing page | **MISSING** | HIGH | Reads page object methods and generates matching test stubs |
| `raider g spec NAME --from page.rb --ai` | LLM-enhanced spec generation | **MISSING** | MEDIUM | Uses AI to generate meaningful test scenarios |

### Implementation for Desktop

**CRUD scaffold**: Add a "CRUD" checkbox/toggle on the scaffold panel. When enabled, a single name generates: `{name}_list_page.rb`, `{name}_create_page.rb`, `{name}_detail_page.rb`, `{name}_edit_page.rb`, matching specs, and `models/data/{name}.yml`.

**from_url**: Add a "Generate from URL" input field. The user pastes a URL, optionally toggles AI enhancement, and the system runs:
```bash
ruby -S raider g from_url "https://example.com/login" --ai
```

**Spec from page**: In the file tree or editor, add a context-menu action "Generate spec from this page" that runs:
```bash
ruby -S raider g spec PageName --from path/to/page.rb --ai
```

---

## 3. Utility Commands (`raider u`)

### Configuration

| Command | CLI Usage | Desktop Status | Priority | Notes |
|---------|-----------|---------------|----------|-------|
| `raider u browser BROWSER` | Set default browser | Supported (ProjectSettings) | — | |
| `raider u url URL` | Set project URL | Supported | — | |
| `raider u path PATH` | Set default page path | **MISSING** | LOW | Desktop has its own path config |
| `raider u path PATH -f` | Set default feature path | **MISSING** | LOW | |
| `raider u path PATH -s` | Set default spec path | **MISSING** | LOW | |
| `raider u path PATH -h` | Set default helper path | **MISSING** | LOW | |
| `raider u timeout SECONDS` | Set test timeout | **MISSING** | MEDIUM | New feature — sets `timeout` in config.yml |
| `raider u viewport 1920x1080` | Set viewport dimensions | **MISSING** | MEDIUM | New feature — sets `viewport.width` and `viewport.height` |
| `raider u platform PLATFORM` | Set mobile platform | **MISSING** | LOW | For cross-platform projects |
| `raider u browser_options --opts headless,no-sandbox` | Set browser options | **MISSING** | MEDIUM | Array of chrome/firefox flags |
| `raider u debug on/off` | Toggle debug mode | **MISSING** | MEDIUM | New feature — enables failure diagnostics helper |

### LLM Configuration

| Command | CLI Usage | Desktop Status | Priority | Notes |
|---------|-----------|---------------|----------|-------|
| `raider u llm ollama` | Set LLM provider | **MISSING** | HIGH | Providers: `openai`, `anthropic`, `ollama` |
| `raider u llm openai -k sk-...` | Set API key | **MISSING** | HIGH | |
| `raider u llm anthropic -m claude-sonnet-4-6` | Set model | **MISSING** | MEDIUM | |
| `raider u llm ollama -u http://localhost:11434` | Set API URL | **MISSING** | MEDIUM | For self-hosted Ollama |
| `raider u llm --status` | Show current config | **MISSING** | LOW | |

### Other Utilities

| Command | CLI Usage | Desktop Status | Priority | Notes |
|---------|-----------|---------------|----------|-------|
| `raider u raid` | Run all tests | Supported (runRaiderTests) | — | |
| `raider u raid -p` | Run tests in parallel | **MISSING** | MEDIUM | Uses `parallel_rspec` / `parallel_cucumber` |
| `raider u raid -o "--format doc"` | Pass extra test options | **PARTIAL** | LOW | Desktop may pass some options |
| `raider u desktop` | Download Raider Desktop | N/A | — | Not needed in desktop app |
| `raider u start_appium` | Start Appium server | **MISSING** | MEDIUM | Needed for mobile testing |

### Implementation for Desktop

**LLM settings**: Add an "AI / LLM" section in Settings with:
- Provider dropdown (OpenAI, Anthropic, Ollama)
- API Key input (password field)
- Model input (text field with sensible defaults)
- API URL input (shown only for Ollama)
- "Test Connection" button that runs `raider u llm --status`

**Timeout/Viewport**: Add these to ProjectSettings:
- Timeout: number input (seconds)
- Viewport: width × height inputs or preset dropdown (Desktop, Tablet, Mobile)

**Debug mode**: Add a toggle switch in ProjectSettings.

Shell commands:
```bash
ruby -S raider u llm ollama -u http://localhost:11434
ruby -S raider u timeout 30
ruby -S raider u viewport 1920x1080
ruby -S raider u debug on
```

---

## 4. Adopt / Import (`raider adopt`)

| Feature | CLI Usage | Desktop Status | Notes |
|---------|-----------|---------------|-------|
| Analyze source project | `raider adopt project PATH --dry_run` | Supported | `adoptAnalyze.ts` |
| Execute adoption | `raider adopt project PATH -p target_automation:X target_framework:Y output_path:Z` | Supported | `adoptExecute.ts` |
| Target framework selection | All web combos | **Verify** | Ensure Minitest is available as target |
| Target automation selection | selenium, capybara, watir | **Verify** | Ensure Capybara is available as target |
| Progress streaming | IPC events | Supported | `adopt-progress`, `adopt-complete` |

---

## 5. Plugin System (`raider pm`)

| Command | CLI Usage | Desktop Status | Priority | Notes |
|---------|-----------|---------------|----------|-------|
| `raider pm add great_axe` | Install plugin | **MISSING** | LOW | Currently only `great_axe` available |
| `raider pm delete great_axe` | Remove plugin | **MISSING** | LOW | |
| `raider pm list` | List installed plugins | **MISSING** | LOW | |

### Implementation for Desktop

Low priority since only one plugin exists. Could be a simple "Plugins" tab in Settings with install/uninstall buttons per available plugin.

---

## 6. Video Recording Helper

| Feature | Description | Desktop Status | Priority |
|---------|-------------|---------------|----------|
| Video helper generation | Auto-generated with new projects (unless `--skip_video`) | **MISSING** (flag) | MEDIUM |
| Video in config.yml | `video.enabled`, `video.dir` keys | **MISSING** | LOW |

The video helper (`helpers/video_helper.rb`) records browser sessions during test runs. It's generated by default. Desktop should offer a checkbox to skip it during project creation.

---

## 7. Debug Helper

| Feature | Description | Desktop Status | Priority |
|---------|-------------|---------------|----------|
| Debug helper generation | Auto-generated with new projects | N/A (always generated) | — |
| `raider u debug on/off` | Toggle debug mode | **MISSING** | MEDIUM |
| Debug diagnostics | Captures screenshots, HTML, console logs on failure | N/A (runtime) | — |

---

## 8. Template Rendering System (Internal)

Not directly exposed to users but relevant for performance:

| Optimization | Description | Affects Desktop? |
|-------------|-------------|-----------------|
| Batch mode (skip mtime) | Faster project generation | Yes — `raider new` runs faster |
| Cached partial directory index | Fewer filesystem scans | Yes — `raider new` runs faster |
| Lazy-loaded commands | Faster CLI startup | Yes — all `ruby -S raider` calls start faster |
| Cached Gemfile reads (plugin) | Fewer file reads | Only if plugins are used |
| HTTP timeouts on GitHub API | Prevents `raider u desktop` hanging | N/A for desktop |
| LLM retry scoping | Only retries network errors | Yes — `--ai` features fail fast on config errors |

These optimizations are **transparent** to raider_desktop — no code changes needed in the desktop app, but users will notice faster project generation.

---

## Priority Summary

### HIGH — Should implement next
1. **Add-on checkboxes**: `--accessibility`, `--visual`, `--performance` on New Project screen
2. **from_url generation**: "Generate from URL" feature in scaffold panel
3. **Spec from page**: Context-menu on page objects to auto-generate specs
4. **CRUD scaffold**: Toggle for generating full CRUD scaffolding
5. **LLM configuration**: Settings panel for AI provider/key/model

### MEDIUM — Valuable additions
6. **Reporter selection**: Dropdown for allure/junit/json/both/all/none
7. **Timeout/Viewport settings**: New ProjectSettings fields
8. **Debug mode toggle**: On/off switch in settings
9. **Parallel test execution**: Toggle in test runner
10. **Component/Helper scaffolding**: Additional scaffold types
11. **Browser options**: Array input for headless, no-sandbox, etc.
12. **Start Appium button**: For mobile project workflows

### LOW — Nice to have
13. **Skip flags**: `--skip_ci`, `--skip_allure`, `--skip_video` checkboxes
14. **Dry run preview**: Confirmation modal showing planned files
15. **Destroy scaffold**: Delete scaffolded files from UI
16. **Plugin management**: Install/remove plugins
17. **Path configuration**: Custom scaffold output paths

---

## Shell Command Reference

Quick reference for all commands raider_desktop needs to invoke:

```bash
# Project creation with all options
ruby -S raider new "name" -p framework:rspec automation:selenium ci_platform:github \
  --accessibility --visual --performance -r allure --skip_video

# Scaffolding
ruby -S raider g page PageName
ruby -S raider g spec SpecName --from path/to/page.rb --ai
ruby -S raider g scaffold UserProfile --crud
ruby -S raider g scaffold UserProfile --with page,spec,model
ruby -S raider g component Header
ruby -S raider g helper AuthHelper
ruby -S raider g from_url "https://example.com/login" --ai --name LoginPage
ruby -S raider g destroy UserProfile

# Configuration
ruby -S raider u timeout 30
ruby -S raider u viewport 1920x1080
ruby -S raider u browser_options --opts headless no-sandbox
ruby -S raider u debug on
ruby -S raider u llm ollama -u http://localhost:11434
ruby -S raider u llm openai -k sk-abc123 -m gpt-4
ruby -S raider u llm --status
ruby -S raider u raid -p

# Adopt (already implemented)
ruby -S raider adopt project "/path/to/source" -p target_automation:selenium target_framework:rspec output_path:/tmp/raider_dry_run --dry_run
ruby -S raider adopt project "/path/to/source" -p target_automation:capybara target_framework:minitest output_path:/path/to/output
```
