# Ruby Raider Backend Parity Guide

> **Purpose**: Machine-readable reference for Claude agents working on raider_desktop.
> Describes every ruby_raider feature that requires desktop UI parity, its current
> CLI invocation, and whether raider_desktop already supports it.
>
> **Last synced**: 2026-10-26 against ruby_raider branch `feat/failure-video-replay`

---

## How raider_desktop invokes ruby_raider

All Ruby Raider interactions use **shell commands** via `safeExec()`. Project creation, config (`raider u ...`) and scaffold (`raider g ...`) handlers run a bare `raider <command>` through `buildShellCommand`, which sets the working directory and the rbenv version. Only the test runners use `${rubyCommand} -S bundle exec`. Values interpolated into these commands go through `quoteShellArg` (`src/main/utils/shellQuote.ts`).
```
raider <command> [args] -p key:value key:value ...
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
| `--accessibility` | `raider new foo -p framework:rspec automation:selenium --accessibility` | Supported (New Project checkbox) | — | Adds axe gem + example accessibility test. Web-only; ignored for mobile. |
| CI provider | `-p ci:azure` | Supported (New Project select) | — | Allowed values: `github` (default, nothing sent) and `azure`. The desktop sends `ci:azure` for web projects only. Azure for mobile projects prints a notice and has no template yet. |

### Implementation for Desktop

`--accessibility` is a **checkbox** on the "New Project" screen (`pages/New/index.tsx`), sent by `runRubyRaider.ts`.

Shell command format:
```bash
raider new project_name -p framework:rspec automation:selenium --accessibility
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
| `raider g scaffold NAME...` | Generate page + spec (or feature + steps) for one or more names | Handler accepts it, but the Scaffold panel has no `scaffold` option (no UI) |

### Other Scaffolding Commands

| Command | CLI Usage | Desktop Status | Priority | Notes |
|---------|-----------|---------------|----------|-------|
| `raider g component NAME` | Generates a component class | Supported (Scaffold panel) | — | Inherits from `Component` base class |
| `raider g helper NAME` | Generates a helper file | Supported (Scaffold panel) | — | |
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
| `raider u path PATH` | Set default page path | Supported (Overview toolbar) | — | |
| `raider u path PATH -f` | Set default feature path | Supported | — | |
| `raider u path PATH -s` | Set default spec path | Supported | — | |
| `raider u path PATH -h` | Set default helper path | Supported | — | |
| `raider u timeout SECONDS` | Set test timeout | Supported (Overview toolbar) | — | Sets `timeout` in config.yml |
| `raider u viewport 1920x1080` | Set viewport dimensions | Handler exists (`updateViewport.ts`), no UI | LOW | Sets `viewport.width` and `viewport.height`. The viewport presets and settings card were removed from the UI. |
| `raider u platform PLATFORM` | Set mobile platform | **MISSING** | LOW | For cross-platform projects |
| `raider u browser_options OPTS...` | Set browser options | Supported (Overview toolbar tag input) | — | e.g. `raider u browser_options headless no-sandbox` |
| `raider u browser BROWSER --opts a b` / `--delete` | Set browser and options together, or delete options | **PARTIAL** | LOW | `-o` and `-d` are aliases |

### Other Utilities

| Command | CLI Usage | Desktop Status | Priority | Notes |
|---------|-----------|---------------|----------|-------|
| `raider u raid` | Run all tests | Supported (runRaiderTests) | — | |
| `raider u raid -p` | Run tests in parallel | **MISSING** | MEDIUM | Uses `parallel_rspec` / `parallel_cucumber` |
| `raider u raid -o "--format doc"` | Pass extra test options | **PARTIAL** | LOW | Desktop may pass some options |
| `raider u desktop` | Download Raider Desktop | N/A | — | Not needed in desktop app |
| `raider u start_appium` | Start Appium server | Handler exists (`startAppium.ts`), no reachable UI | LOW | `pages/ProjectSettings` is not routed, so mobile capabilities and Start Appium have no UI today. |
| `raider u video install\|status\|on\|off` | Manage failure video recording | **MISSING** | MEDIUM | `install` is not usable yet: every asset in `lib/ruby_raider/ffmpeg.rb` has `sha256: nil`, so it fails until the release and checksums exist. Use `RAIDER_FFMPEG_PATH`.  `status` shows which ffmpeg is used, `on`/`off` toggles `video.enabled` |

### Implementation for Desktop

**Viewport**: If a UI returns, use width × height inputs wired to the existing `updateViewport` handler.

Shell commands:
```bash
raider u timeout 30
raider u viewport 1920x1080
raider u video status
```

---

## 4. Failure Video

| Feature | Description | Desktop Status | Priority |
|---------|-------------|---------------|----------|
| Video playback | Failed result card on the Dashboard shows a "Failure video" section | Supported | — |
| ffmpeg | Recording needs ffmpeg. Set `RAIDER_FFMPEG_PATH` to your ffmpeg binary until the bundled-ffmpeg release exists. `raider u video install` cannot succeed yet (assets have `sha256: nil`) | N/A (gem) | — |
| `raider u video on/off` | Toggle recording (`video.enabled` in config.yml) | **MISSING** | MEDIUM |

---

## 5. Template Rendering System (Internal)

Not directly exposed to users but relevant for performance:

| Optimization | Description | Affects Desktop? |
|-------------|-------------|-----------------|
| Batch mode (skip mtime) | Faster project generation | Yes — `raider new` runs faster |
| Cached partial directory index | Fewer filesystem scans | Yes — `raider new` runs faster |
| Lazy-loaded commands | Faster CLI startup | Yes — all `raider` calls start faster |
| HTTP timeouts on GitHub API | Prevents `raider u desktop` hanging | N/A for desktop |

These optimizations are **transparent** to raider_desktop — no code changes needed in the desktop app, but users will notice faster project generation.

---

## Priority Summary

Shipped: the `--accessibility` checkbox, the CI provider select, and component and helper scaffolding.

### MEDIUM — Valuable additions
1. **Parallel test execution**: Toggle in test runner
2. **Failure video toggle**: `raider u video on/off`

### LOW — Nice to have
3. **Scaffold UI for `g scaffold`**
4. **Mobile capabilities and Start Appium**: route or replace the unrouted ProjectSettings page
5. **Viewport**: UI for the existing `updateViewport` handler
6. **Platform**: `raider u platform` for cross-platform projects
7. **Scaffold output path**: `--path` on individual generators

---

## Shell Command Reference

Quick reference for all commands raider_desktop needs to invoke:

```bash
# Project creation
raider new name -p framework:rspec automation:selenium ci:github --accessibility

# Scaffolding
raider g page PageName
raider g spec SpecName
raider g scaffold UserProfile
raider g component Header
raider g helper AuthHelper

# Configuration
raider u timeout 30
raider u viewport 1920x1080
raider u browser_options headless no-sandbox
raider u video status
raider u raid -p
```
