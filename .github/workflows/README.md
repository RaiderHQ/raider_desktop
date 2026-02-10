# GitHub Actions Workflows

This directory contains GitHub Actions workflows for automated testing, building, and releasing Raider Desktop across all supported platforms.

## Workflows Overview

### 1. CI Workflow (`ci.yml`)

**Trigger:** Automatic on every push and pull request

**Purpose:** Fast cross-platform validation to catch issues early

**What it does:**
- ✅ Runs linting (ESLint)
- ✅ Runs TypeScript type checking
- ✅ Runs unit tests on all platforms (Linux, Windows, macOS)
- ✅ Verifies builds succeed on all platforms

**Duration:** ~5-10 minutes

**Use case:** Everyday development - runs automatically to ensure code quality

---

### 2. Windows Compatibility Tests (`test-windows.yml`)

**Trigger:** Automatic on push/PR + manual trigger available

**Purpose:** Comprehensive Windows-specific testing with Ruby installed

**What it does:**
- ✅ Tests with Ruby 3.1 and 3.2
- ✅ Tests RubyInstaller detection
- ✅ Tests Chocolatey Ruby detection
- ✅ Runs integration tests (project creation)
- ✅ Tests on Windows 2019 and 2022
- ✅ Builds Windows .exe installer
- ✅ Uploads installer as artifact

**Duration:** ~15-20 minutes

**Use case:**
- Validating Windows compatibility changes
- Pre-release testing for Windows
- Debugging Windows-specific issues

**Artifacts produced:**
- `windows-installer` - Built .exe file (7 days retention)
- `build-logs-*` - Build logs if tests fail (7 days retention)
- `integration-test-results` - Test project files (3 days retention)

---

### 3. Build and Package (`build.yml`)

**Trigger:** Manual only (`workflow_dispatch`)

**Purpose:** Create official release builds for all platforms

**What it does:**
- ✅ Builds Linux (AppImage, snap, deb)
- ✅ Builds Windows (NSIS installer .exe)
- ✅ Builds macOS Silicon (ARM64)
- ✅ Builds macOS Intel (x64)
- ✅ Creates GitHub release with all artifacts

**Duration:** ~20-30 minutes

**Use case:**
- Creating official releases
- Manual testing of release candidates

---

## Workflow Decision Tree

```
┌─────────────────────────────────────┐
│  Code Change / Pull Request         │
└──────────────┬──────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  ci.yml runs         │  ← Fast feedback (5-10 min)
    │  - Lint, typecheck   │
    │  - Unit tests        │
    │  - Build verification│
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ test-windows.yml     │  ← Windows validation (15-20 min)
    │ - Ruby detection     │
    │ - Integration tests  │
    │ - Multi-version test │
    └──────────┬───────────┘
               │
               ▼ (Manual trigger)
    ┌──────────────────────┐
    │  build.yml           │  ← Release builds (20-30 min)
    │  - All platforms     │
    │  - Create release    │
    └──────────────────────┘
```

---

## Manual Workflow Triggers

You can manually trigger workflows from the GitHub Actions tab:

### Trigger Windows Tests Manually

1. Go to **Actions** tab on GitHub
2. Select **Windows Compatibility Tests**
3. Click **Run workflow**
4. Select branch
5. Click **Run workflow** button

Use this when:
- Testing Windows-specific changes
- Investigating Windows issues
- Pre-release validation

### Trigger Release Build Manually

1. Go to **Actions** tab on GitHub
2. Select **Build and Package**
3. Click **Run workflow**
4. Select branch (usually `main`)
5. Click **Run workflow** button

Use this when:
- Creating a new release
- Testing release candidate builds

---

## Artifacts

### Accessing Artifacts

After a workflow run completes:

1. Go to the workflow run page
2. Scroll to **Artifacts** section at the bottom
3. Download the artifact you need

### Available Artifacts

| Artifact Name | Workflow | Description | Retention |
|--------------|----------|-------------|-----------|
| `windows-installer` | test-windows.yml | Built .exe installer | 7 days |
| `build-logs-*` | test-windows.yml | Error logs if build fails | 7 days |
| `integration-test-results` | test-windows.yml | Test project files | 3 days |
| `*-build-test` | ci.yml | Quick build verification | 1 day |
| `*-build` | build.yml | Official release builds | Until release created |

---

## Environment Variables

### Required Secrets

- `GITHUB_TOKEN` - Automatically provided by GitHub Actions
- No additional secrets required for basic functionality

### Optional Environment Variables

For code signing (production releases):

- `CSC_LINK` - macOS code signing certificate (base64 encoded)
- `CSC_KEY_PASSWORD` - Certificate password
- `WIN_CSC_LINK` - Windows code signing certificate
- `WIN_CSC_KEY_PASSWORD` - Windows certificate password

---

## Windows-Specific Testing Details

### Ruby Installation Methods Tested

1. **ruby/setup-ruby action** (default)
   - Installs Ruby via RubyInstaller
   - Most common Windows installation method
   - Tests matrix: Ruby 3.1, 3.2

2. **Chocolatey** (separate job)
   - Tests detection of Chocolatey-installed Ruby
   - Validates alternative installation path

### Integration Tests Run

- ✅ Ruby detection from system PATH
- ✅ Ruby version verification (3.0.0+)
- ✅ Gem installation (ruby_raider, selenium-webdriver, rspec)
- ✅ Project creation via Ruby Raider CLI
- ✅ Gemfile generation
- ✅ Project structure validation

---

## Troubleshooting Workflow Failures

### CI Workflow Fails

**Lint errors:**
```bash
# Fix locally
npm run lint
```

**Type errors:**
```bash
# Fix locally
npm run typecheck
```

**Test failures:**
```bash
# Run tests locally
npm test
```

### Windows Tests Fail

**Ruby detection fails:**
- Check that `isWindowsRubyInstalled.ts` logic is correct
- Verify Registry query in `getRubyInstallerPath.ts`
- Check PowerShell command translation

**Build fails:**
- Download `build-logs-*` artifact
- Check for Windows-specific errors
- Verify electron-builder.yml configuration

**Integration tests fail:**
- Download `integration-test-results` artifact
- Check project structure
- Verify Ruby Raider CLI works on Windows

### Build Workflow Fails

**Platform-specific build errors:**
- Check electron-builder configuration
- Verify platform-specific dependencies
- Review build logs for each platform

**Release creation fails:**
- Ensure tag doesn't already exist
- Verify GitHub permissions
- Check GITHUB_TOKEN scope

---

## Adding New Tests

### Add to CI Workflow

Edit `.github/workflows/ci.yml`:

```yaml
- name: Your new test step
  run: npm run your-test-command
```

### Add to Windows Tests

Edit `.github/workflows/test-windows.yml`:

```yaml
- name: Your Windows-specific test
  run: |
    Write-Host "Running test..."
    # Your PowerShell commands
  shell: powershell
```

---

## Performance Optimization

### Caching

All workflows use npm caching to speed up dependency installation:

```yaml
- uses: actions/setup-node@v4
  with:
    cache: 'npm'
```

This reduces workflow time by 1-2 minutes.

### Parallelization

- **CI workflow**: Runs tests on all platforms in parallel
- **Windows tests**: Uses matrix strategy to test multiple Ruby versions simultaneously
- **Build workflow**: Builds all platforms in parallel

### fail-fast Strategy

Set to `false` to see results from all platforms even if one fails:

```yaml
strategy:
  fail-fast: false
```

---

## Workflow Status Badges

Add to README.md:

```markdown
![CI](https://github.com/RaiderHQ/raider_desktop/actions/workflows/ci.yml/badge.svg)
![Windows Tests](https://github.com/RaiderHQ/raider_desktop/actions/workflows/test-windows.yml/badge.svg)
```

---

## Cost Considerations

GitHub Actions is free for public repositories with generous limits:

- **Linux/Windows runners**: 2,000 minutes/month (free tier)
- **macOS runners**: 200 minutes/month (free tier)
- Multiply by 10 for paid tiers

**Estimated usage per push:**
- CI workflow: ~10 minutes (3 platforms × 3-4 min each)
- Windows tests: ~15 minutes
- Build workflow: ~25 minutes (manual only)

**Monthly estimate** (10 pushes/day):
- ~250 minutes (CI + Windows) per day
- ~7,500 minutes per month
- Well within free tier if public repository

---

## Best Practices

1. **Run CI on every push** - Catch issues early
2. **Run Windows tests on Windows-specific changes** - Validate platform behavior
3. **Run build workflow before releases** - Ensure all platforms build
4. **Check artifacts** - Download and test built installers
5. **Monitor workflow durations** - Optimize slow steps
6. **Use matrix strategy** - Test multiple versions efficiently
7. **Add meaningful test names** - Easy to identify failures

---

## Future Enhancements

Potential improvements to consider:

- [ ] Add Playwright E2E tests with browser automation
- [ ] Add visual regression testing
- [ ] Add performance benchmarks
- [ ] Add security scanning (Snyk, Dependabot)
- [ ] Add automatic changelog generation
- [ ] Add automatic version bumping
- [ ] Add Docker-based testing for Linux
- [ ] Add Windows VM snapshots for faster test setup

---

## Support

For workflow issues:
- Check workflow logs in GitHub Actions tab
- Review this README
- Open an issue on GitHub

For Windows compatibility issues:
- See `WINDOWS_COMPATIBILITY_SUMMARY.md`
- See `IMPLEMENTATION_COMPLETE.md`
