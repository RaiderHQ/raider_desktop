# GitHub Actions Testing Guide

This guide explains how to test and validate the GitHub Actions workflows before pushing to GitHub.

## Pre-Push Validation

Before pushing your code, run these commands locally to simulate what CI will do:

### 1. Run All Tests Locally

```bash
# Run linting
npm run lint

# Run type checking
npm run typecheck

# Run unit tests
npm test

# Run all checks in sequence (simulates CI)
npm run lint && npm run typecheck && npm test
```

**Expected Result:** All commands should pass with exit code 0.

### 2. Test Build Process

```bash
# macOS
npm run build:mac

# Windows (on Windows VM)
npm run build:win

# Linux (on Linux or Docker)
npm run build:linux
```

**Expected Result:** Build completes successfully, `dist/` directory contains installer.

## First-Time Setup

### Push to GitHub and Watch Workflows

1. **Commit and push your changes:**
   ```bash
   git add .
   git commit -m "Add Windows compatibility"
   git push origin feature/recorder-improvements
   ```

2. **Watch workflows run:**
   - Go to: https://github.com/RaiderHQ/raider_desktop/actions
   - You'll see two workflows start automatically:
     - ✅ **CI** (runs on all platforms)
     - ✅ **Windows Compatibility Tests** (comprehensive Windows testing)

3. **Check results:**
   - Green checkmark = ✅ Success
   - Red X = ❌ Failed (click for details)

### Understanding Workflow Run Times

| Workflow | Duration | Triggers |
|----------|----------|----------|
| CI | 5-10 min | Every push/PR |
| Windows Tests | 15-20 min | Every push/PR |
| Build and Package | 20-30 min | Manual only |

## Viewing Test Results

### On GitHub Actions Tab

1. Click **Actions** tab at the top
2. Select a workflow run
3. View summary with ✅/❌ status
4. Click job name to see detailed logs

### Reading Logs

```
✅ Test on ubuntu-latest
  ├─ Setup Node.js
  ├─ Install dependencies
  ├─ Run linter          ✅ passed
  ├─ Run type checking   ✅ passed
  └─ Run unit tests      ✅ passed (23 tests)
```

### Downloading Artifacts

If tests pass, artifacts are available:

1. Scroll to bottom of workflow run page
2. **Artifacts** section shows available downloads
3. Click artifact name to download

**Example Artifacts:**
- `windows-installer` - Windows .exe file
- `build-logs-*` - Error logs (if failed)
- `integration-test-results` - Test project files

## Testing Workflows Without Pushing

You can test workflow syntax locally using `act`:

### Install act (macOS)

```bash
brew install act
```

### Test CI Workflow Locally

```bash
# Run CI workflow (requires Docker)
act -j test-cross-platform

# Run specific job
act -j test-cross-platform -P ubuntu-latest=node:18

# Dry run (check syntax only)
act --dryrun
```

**Note:** `act` has limitations:
- Requires Docker
- May not perfectly match GitHub Actions environment
- Good for syntax checking, not full testing

## Manual Workflow Triggers

### Trigger Windows Tests Manually

**When to use:**
- Testing Windows-specific changes
- Investigating Windows bugs
- Pre-release validation

**How to trigger:**

1. Go to GitHub Actions tab
2. Click **Windows Compatibility Tests**
3. Click **Run workflow** button (top right)
4. Select branch (e.g., `feature/recorder-improvements`)
5. Click green **Run workflow** button

**Watch it run:**
- Shows "Workflow run queued" → "In progress" → "Success"
- Takes ~15-20 minutes

### Trigger Release Build Manually

**When to use:**
- Creating official releases
- Testing release candidates

**How to trigger:**

1. Go to GitHub Actions tab
2. Click **Build and Package**
3. Click **Run workflow** button
4. Select branch (usually `main`)
5. Click green **Run workflow** button

**Result:**
- Builds all platforms (Linux, Windows, macOS)
- Creates GitHub release with artifacts
- Takes ~20-30 minutes

## Troubleshooting Failed Workflows

### Scenario 1: Lint Errors

**Error in workflow:**
```
Run npm run lint
  ✗ error  Unexpected trailing comma  comma-dangle
```

**Fix locally:**
```bash
npm run lint
# Fix errors manually or use --fix
npm run lint -- --fix
git add .
git commit -m "Fix lint errors"
git push
```

### Scenario 2: TypeScript Errors

**Error in workflow:**
```
Run npm run typecheck
  ✗ error TS2304: Cannot find name 'ShellExecutor'
```

**Fix locally:**
```bash
npm run typecheck
# Fix type errors in your IDE
git add .
git commit -m "Fix type errors"
git push
```

### Scenario 3: Test Failures

**Error in workflow:**
```
Run npm test
  ✗ FAIL test/shell/ShellExecutor.test.ts
    TypeError: Cannot read property 'execute'
```

**Fix locally:**
```bash
npm test
# Fix failing tests
npm test -- --run
git add .
git commit -m "Fix failing tests"
git push
```

### Scenario 4: Windows Build Failure

**Error in workflow:**
```
Run npm run build:win
  ✗ Error: Cannot find module 'src/main/handlers/windows/...'
```

**Diagnose:**
1. Download `build-logs-*` artifact from workflow run
2. Check error message
3. Verify file paths are correct
4. Test build locally (if Windows VM available)

**Fix:**
```bash
# Fix import paths or missing files
git add .
git commit -m "Fix Windows build errors"
git push
```

### Scenario 5: Windows Tests Fail but CI Passes

**Meaning:**
- Unit tests pass (CI)
- But Windows integration tests fail (test-windows.yml)

**Common causes:**
- PowerShell command translation issue
- Ruby detection not working on Windows
- Windows-specific permission error

**Diagnose:**
1. Check `test-windows.yml` logs
2. Look for PowerShell errors
3. Check Ruby detection output
4. Download `integration-test-results` artifact

**Fix:**
- Update PowerShell translation in `PowerShellExecutor.ts`
- Fix Ruby detection logic in `isWindowsRubyInstalled.ts`
- Test locally on Windows VM if possible

## Verifying Windows Compatibility

After workflows pass, manually verify Windows functionality:

### Checklist

- [ ] Download `windows-installer` artifact from test-windows.yml
- [ ] Install on Windows 10/11 VM
- [ ] Install Ruby 3.1.6 from RubyInstaller.org
- [ ] Launch Raider Desktop
- [ ] Verify Ruby detected automatically
- [ ] Create new Selenium project
- [ ] Start test recording
- [ ] Verify browser launches
- [ ] Run recorded test
- [ ] Check error messages are clear

### Expected Behavior

**On launch:**
- App detects Ruby automatically
- No errors about rbenv/RVM

**On project creation:**
- Project files created in correct location
- Gemfile present
- No permission errors

**On test recording:**
- Browser launches (Chrome/Edge)
- Steps recorded correctly
- Code generated in Ruby syntax

**On test running:**
- Tests execute via RSpec
- Output displayed in UI
- Errors are clear and actionable

## Performance Monitoring

### Check Workflow Duration

1. Go to workflow run
2. Check total duration (top right)
3. Compare to expected times:
   - CI: ~5-10 min
   - Windows Tests: ~15-20 min
   - Build: ~20-30 min

### Optimize Slow Workflows

If workflows take significantly longer:

**Check npm install time:**
```yaml
- name: Install dependencies
  run: npm ci
  # Should be <2 min with caching
```

**Check test time:**
```yaml
- name: Run tests
  run: npm test
  # Should be <3 min
```

**Optimize:**
- Enable npm caching (already done)
- Reduce test parallelization
- Skip non-critical tests in CI

## Best Practices

### Before Pushing

✅ **DO:**
- Run `npm run lint && npm run typecheck && npm test` locally
- Fix all errors before pushing
- Test on macOS to ensure no regressions
- Read workflow logs if CI fails

❌ **DON'T:**
- Push without running tests locally
- Ignore lint/type errors
- Assume Windows works if macOS tests pass
- Force push to skip CI

### When Workflows Fail

✅ **DO:**
- Read the full error log
- Download artifacts if available
- Fix locally and re-push
- Ask for help if stuck

❌ **DON'T:**
- Click "Re-run jobs" without fixing the issue
- Disable failing tests
- Skip Windows tests
- Ignore warnings

### Before Releases

✅ **DO:**
- Manually trigger `test-windows.yml`
- Download and test Windows installer
- Test on real Windows machine
- Verify all platforms build successfully

❌ **DON'T:**
- Release without Windows testing
- Skip build verification
- Ignore workflow warnings
- Rush releases

## Getting Help

### Workflow Issues

1. **Check workflow logs** - Most issues are evident in logs
2. **Search GitHub Actions docs** - https://docs.github.com/actions
3. **Check this repo's issues** - Similar problems may exist
4. **Open new issue** - Provide workflow run URL and error logs

### Windows Compatibility Issues

1. **Check implementation docs:**
   - `WINDOWS_COMPATIBILITY_SUMMARY.md`
   - `IMPLEMENTATION_COMPLETE.md`
2. **Test locally on Windows VM** - Most reliable way to debug
3. **Check PowerShell translation** - Common source of issues
4. **Open issue with workflow run URL**

## Summary

### Quick Commands

```bash
# Pre-push validation
npm run lint && npm run typecheck && npm test

# Watch CI results
# https://github.com/RaiderHQ/raider_desktop/actions

# Download Windows installer
# Go to workflow run → Artifacts → windows-installer

# Manual trigger
# Actions tab → Select workflow → Run workflow
```

### Key Points

✅ CI runs automatically on every push
✅ Windows tests validate cross-platform behavior
✅ Artifacts available for 1-7 days
✅ Manual triggers available for comprehensive testing
✅ All workflows have detailed logs
✅ Fix issues locally before re-pushing

---

**Now you're ready to use GitHub Actions for automated Windows testing!** 🚀
