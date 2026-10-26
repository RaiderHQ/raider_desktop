# Ruby Raider Backend Parity Guide

> **Purpose**: Machine-readable reference for Claude agents working on raider_desktop.
> Describes every ruby_raider feature that requires desktop UI parity, its current
> CLI invocation, and whether raider_desktop already supports it.
>
> **Last synced**: 2026-10-26 against ruby_raider branch `feat/failure-video-replay`

---

## How raider_desktop invokes ruby_raider

All Ruby Raider interactions use **shell commands** via `safeExec()`:
```
ruby -S raider <command> [args] -p key:value key:value ...
```
The desktop app never loads Ruby modules directly.
Key handler files:
- `src/main/handlers/project/runRubyRaider.ts` — project creation
- `src/main/handlers/project/scaffoldGenerate.ts` — scaffolding

---

## 1. Project Creation (`raider new`)

### Supported Framework Combinations

The gem creates web projects (Selenium, Watir) and mobile projects (Appium: iOS, Android, cross-platform) with RSpec or Cucumber. The desktop New Project screen creates **web projects only** (Selenium, Watir).

| Automation | Frameworks | Desktop Status |
|------------|-----------|----------------|
| Selenium | Cucumber, RSpec | Supported |
| Watir | Cucumber, RSpec | Supported |
| Appium iOS (`ios`) | Cucumber, RSpec | Gem only (not offered on the New Project screen) |
| Appium Android (`android`) | Cucumber, RSpec | Gem only (not offered on the New Project screen) |
| Appium Cross-Platform (`cross_platform`) | Cucumber, RSpec | Gem only (not offered on the New Project screen) |

### CLI Flags for `raider new`

| Flag | CLI Usage | Desktop Status | Priority | Notes |
|------|-----------|---------------|----------|-------|
| `-p framework:X automation:Y` | Core params | Supported | — | Already in `runRubyRaider.ts` |
| `--accessibility` | `raider new foo -p framework:rspec automation:selenium --accessibility` | **MISSING** | HIGH | Adds axe gem + example accessibility test. Web-only; ignored for mobile. |
| CI provider | `-p ci:azure` | **MISSING** | LOW | Allowed values: `github` (default) and `azure`. Needs a UI selector for GitHub Actions vs Azure Pipelines. Azure for mobile projects prints a notice and has no template yet. |

### Implementation for Desktop

`--accessibility` should appear as a **checkbox** on the "New Project" screen, enabled only when automation is web-based (Selenium/Watir).

Shell command format:
```bash
ruby -S raider new "project_name" -p framework:rspec automation:selenium --accessibility
```

---

## 2. Scaffolding Commands (`raider g`)

### Scaffolding (already supported)

| Command | CLI | Desktop Status |
|---------|-----|---------------|
| `raider g page NAME` | Generate page object | Supported via `scaffoldGenerate.ts` |
| `raider g spec NAME` | Generate spec file | Supported |
| `raider g feature NAME` | Generate feature file | Supported |
| `raider g steps NAME` | Generate step definitions | Supported |
| `raider g scaffold NAME...` | Generate page + spec (or feature + steps) for one or more names | Supported |

### Other Scaffolding Commands

| Command | CLI Usage | Desktop Status | Priority | Notes |
|---------|-----------|---------------|----------|-------|
| `raider g component NAME` | Generates a component class | **MISSING** | MEDIUM | Inherits from `Component` base class |
| `raider g helper NAME` | Generates a helper file | **MISSING** | MEDIUM | |
| `--path` / `-p` on page, spec, feature, steps, helper, component | Custom output directory, e.g. `raider g page Foo -p custom/pages` | **MISSING** | LOW | Desktop has its own path config |

`raider g scaffold` takes only names. It has no flags; it picks spec or feature + steps from the project layout, plus a page object.

---

## 3. Utility Commands (`raider u`)

### Configuration

| Command | CLI Usage | Desktop Status | Priority | Notes |
|---------|-----------|---------------|----------|-------|
| `raider u browser BROWSER` | Set default browser | Supported (Overview toolbar; Chrome and Firefox) | — | |
| `raider u url URL` | Set project URL | Supported | — | |
| `raider u headless on/off` | Toggle headless mode | Supported (Overview toolbar) | — | |
| `raider u path PATH` | Set default page path | Supported (ProjectSettings) | — | |
| `raider u path PATH -f` | Set default feature path | Supported | — | |
| `raider u path PATH -s` | Set default spec path | Supported | — | |
| `raider u path PATH -h` | Set default helper path | Supported | — | |
| `raider u timeout SECONDS` | Set test timeout | Supported (ProjectSettings) | — | Sets `timeout` in config.yml |
| `raider u viewport 1920x1080` | Set viewport dimensions | Handler exists (`updateViewport.ts`), no UI | LOW | Sets `viewport.width` and `viewport.height`. The viewport presets and settings card were removed from the UI. |
| `raider u platform PLATFORM` | Set mobile platform | **MISSING** | LOW | For cross-platform projects |
| `raider u browser_options OPTS...` | Set browser options | Supported (ProjectSettings) | — | e.g. `raider u browser_options headless no-sandbox` |
| `raider u browser BROWSER --opts a b` / `--delete` | Set browser and options together, or delete options | **PARTIAL** | LOW | `-o` and `-d` are aliases |

### Other Utilities

| Command | CLI Usage | Desktop Status | Priority | Notes |
|---------|-----------|---------------|----------|-------|
| `raider u raid` | Run all tests | Supported (runRaiderTests) | — | |
| `raider u raid -p` | Run tests in parallel | **MISSING** | MEDIUM | Uses `parallel_rspec` / `parallel_cucumber` |
| `raider u raid -o "--format doc"` | Pass extra test options | **PARTIAL** | LOW | Desktop may pass some options |
| `raider u desktop` | Download Raider Desktop | N/A | — | Not needed in desktop app |
| `raider u start_appium` | Start Appium server | Supported (ProjectSettings, mobile projects) | — | |
| `raider u video install\|status\|on\|off` | Manage failure video recording | **MISSING** | MEDIUM | `install` fetches ffmpeg, `status` shows which ffmpeg is used, `on`/`off` toggles `video.enabled` |

### Implementation for Desktop

**Viewport**: If a UI returns, use width × height inputs wired to the existing `updateViewport` handler.

Shell commands:
```bash
ruby -S raider u timeout 30
ruby -S raider u viewport 1920x1080
ruby -S raider u video status
```

---

## 4. Failure Video

| Feature | Description | Desktop Status | Priority |
|---------|-------------|---------------|----------|
| Video playback | Failed result card on the Dashboard shows a "Failure video" section | Supported | — |
| ffmpeg | Recording needs ffmpeg. Set `RAIDER_FFMPEG_PATH` to your ffmpeg binary until the bundled-ffmpeg release exists, or run `raider u video install` | N/A (gem) | — |
| `raider u video on/off` | Toggle recording (`video.enabled` in config.yml) | **MISSING** | MEDIUM |

---

## 5. Template Rendering System (Internal)

Not directly exposed to users but relevant for performance:

| Optimization | Description | Affects Desktop? |
|-------------|-------------|-----------------|
| Batch mode (skip mtime) | Faster project generation | Yes — `raider new` runs faster |
| Cached partial directory index | Fewer filesystem scans | Yes — `raider new` runs faster |
| Lazy-loaded commands | Faster CLI startup | Yes — all `ruby -S raider` calls start faster |
| HTTP timeouts on GitHub API | Prevents `raider u desktop` hanging | N/A for desktop |

These optimizations are **transparent** to raider_desktop — no code changes needed in the desktop app, but users will notice faster project generation.

---

## Priority Summary

### HIGH — Should implement next
1. **Accessibility checkbox**: `--accessibility` on New Project screen

### MEDIUM — Valuable additions
2. **Parallel test execution**: Toggle in test runner
3. **Component/Helper scaffolding**: Additional scaffold types
4. **Failure video toggle**: `raider u video on/off`

### LOW — Nice to have
5. **CI provider selector**: GitHub Actions or Azure Pipelines
6. **Viewport**: UI for the existing `updateViewport` handler
7. **Platform**: `raider u platform` for cross-platform projects
8. **Scaffold output path**: `--path` on individual generators

---

## Shell Command Reference

Quick reference for all commands raider_desktop needs to invoke:

```bash
# Project creation
ruby -S raider new "name" -p framework:rspec automation:selenium ci:github --accessibility

# Scaffolding
ruby -S raider g page PageName
ruby -S raider g spec SpecName
ruby -S raider g scaffold UserProfile
ruby -S raider g component Header
ruby -S raider g helper AuthHelper

# Configuration
ruby -S raider u timeout 30
ruby -S raider u viewport 1920x1080
ruby -S raider u browser_options headless no-sandbox
ruby -S raider u video status
ruby -S raider u raid -p
```
