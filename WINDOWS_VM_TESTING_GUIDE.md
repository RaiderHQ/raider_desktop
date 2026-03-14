# Windows VM Testing Guide

Complete guide to testing Raider Desktop Windows compatibility in a VM on your Mac.

## Quick Start (Fastest Path to Testing)

### Step 1: Wait for GitHub Actions Build (~20 minutes)

While waiting for the build, you can set up your VM!

**Check build status:**
🔗 https://github.com/RaiderHQ/raider_desktop/actions

Look for: ✅ **Windows Compatibility Tests** workflow

---

## VM Setup Options

### 🚀 Recommended: Parallels Desktop (Best Experience)

**Pros:**
- ✅ Fastest performance
- ✅ Built-in Windows 11 installer
- ✅ Seamless file sharing with Mac
- ✅ Best for M1/M2 Macs

**Cons:**
- ❌ Costs $99/year (14-day free trial available)

**Setup:**
1. Download Parallels: https://www.parallels.com/products/desktop/trial/
2. Install and launch
3. Click "Install Windows"
4. Parallels downloads and installs Windows 11 automatically
5. Done in ~20 minutes!

---

### 💰 Free Option: UTM (M1/M2 Macs)

**Pros:**
- ✅ Completely free
- ✅ ARM-native for M1/M2
- ✅ Open source

**Cons:**
- ❌ Slower than Parallels
- ❌ Requires manual Windows ISO download
- ❌ Setup is more manual

**Setup:**

1. **Download UTM:**
   ```bash
   # Via Homebrew
   brew install --cask utm

   # Or download from: https://mac.getutm.app/
   ```

2. **Download Windows 11 ARM Insider Preview:**
   - Go to: https://www.microsoft.com/software-download/windowsinsiderpreviewarm64
   - Sign up for Windows Insider (free)
   - Download ARM64 ISO

3. **Create VM in UTM:**
   - Open UTM → Create New VM
   - Select "Virtualize"
   - Choose Windows
   - Select downloaded ISO
   - Allocate 4GB RAM, 2 CPU cores
   - Create 60GB disk
   - Finish setup

4. **Install Windows:**
   - Start VM
   - Follow Windows installation
   - Skip/enter fake Microsoft account
   - Complete setup (~15 minutes)

---

### 🆓 Alternative: VMware Fusion (Free for Personal Use)

**Pros:**
- ✅ Free for personal use
- ✅ Good performance
- ✅ Works on Intel and M1/M2

**Cons:**
- ❌ Requires registration
- ❌ Manual Windows ISO download

**Setup:**

1. **Download VMware Fusion:**
   - Go to: https://www.vmware.com/products/fusion.html
   - Get free license for personal use

2. **Download Windows 11 ISO:**
   - Go to: https://www.microsoft.com/software-download/windows11
   - Download Windows 11 ISO (x64 for Intel, ARM64 for M1/M2)

3. **Create VM:**
   - Open Fusion → File → New
   - Select ISO
   - Follow wizard
   - Allocate 4GB RAM, 40GB disk
   - Install Windows

---

### 📥 Fastest: Microsoft Dev VM (Pre-Built)

**Pros:**
- ✅ Pre-configured Windows 11
- ✅ Already activated
- ✅ Expires in 90 days (enough for testing)

**Cons:**
- ❌ Large download (~20GB)
- ❌ Temporary (expires after 90 days)

**Setup:**

1. **Download:**
   - Go to: https://developer.microsoft.com/en-us/windows/downloads/virtual-machines/
   - Select "VMware" or "Parallels" format
   - Download (~20GB, takes 30-60 min)

2. **Import:**
   - **Parallels:** File → Open → Select .pvm file
   - **VMware:** File → Open → Select .vmwarevm file
   - **UTM:** Convert with: `qemu-img convert -O qcow2 input.vmdk output.qcow2`

3. **Start VM:**
   - VM is ready to use immediately
   - Password: `Passw0rd!`

---

## VM Configuration

### Recommended VM Specs

```yaml
RAM: 4GB minimum (8GB recommended)
CPU: 2 cores minimum (4 cores recommended)
Disk: 40GB minimum (60GB recommended)
Network: NAT or Bridged
Display: 1920x1080 or higher
```

### Enable Shared Folders (Parallels/VMware)

**Parallels:**
1. VM → Configure → Options
2. Sharing → Share Mac folders with Windows
3. Enable shared folders
4. Mac folders appear in `\\Mac\Home\Downloads`

**VMware Fusion:**
1. VM → Settings → Sharing
2. Enable Shared Folders
3. Add Mac folders

---

## Testing Setup (In Windows VM)

### Step 1: Install Ruby

**Option A: RubyInstaller (Recommended)**

1. Open Edge browser in VM
2. Go to: https://rubyinstaller.org/downloads/
3. Download **Ruby+Devkit 3.1.6 (x64)**
4. Run installer
5. ✅ **IMPORTANT:** Check "Add Ruby to PATH"
6. Select "MSYS2 and MINGW development toolchain"
7. Finish installation
8. In CMD window that appears, press Enter to install MSYS2
9. Wait for MSYS2 installation to complete

**Verify installation:**
```powershell
# Open PowerShell
ruby -v
# Should show: ruby 3.1.6...

gem -v
# Should show: 3.3.x or higher
```

**Option B: Chocolatey (Alternative)**

1. Open PowerShell as Administrator
2. Install Chocolatey:
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```
3. Install Ruby:
   ```powershell
   choco install ruby -y
   ```
4. Restart PowerShell
5. Verify: `ruby -v`

---

### Step 2: Install Required Gems

```powershell
# Open PowerShell (regular user, not admin)
gem install ruby_raider selenium-webdriver rspec

# Verify installation
gem list | Select-String "ruby_raider|selenium|rspec"
```

**Expected output:**
```
ruby_raider (0.x.x)
selenium-webdriver (4.x.x)
rspec (3.x.x)
rspec-core (3.x.x)
rspec-expectations (3.x.x)
rspec-mocks (3.x.x)
rspec-support (3.x.x)
```

---

### Step 3: Get Raider Desktop Installer

#### Option A: Download from GitHub Actions (Build Complete)

1. **On Mac:** Go to https://github.com/RaiderHQ/raider_desktop/actions
2. Click **Windows Compatibility Tests** workflow
3. Scroll to **Artifacts** section
4. Download **windows-installer** artifact
5. Unzip to get `ruby-raider-1.1.4-setup.exe`
6. **Transfer to VM:**
   - **Parallels/VMware:** Copy to shared folder
   - **UTM:** Use file sharing or network transfer

#### Option B: Build Locally on Mac (If GitHub Actions Not Ready)

```bash
# On Mac
cd /Users/augustingottlieb/raider_desktop
npm run build:win

# Installer created at: dist/ruby-raider-1.1.4-setup.exe
# Copy to VM shared folder
```

---

### Step 4: Install Raider Desktop

1. **In Windows VM:** Navigate to installer location
2. Double-click `ruby-raider-1.1.4-setup.exe`
3. Windows SmartScreen warning may appear:
   - Click "More info"
   - Click "Run anyway"
4. Follow installer wizard
5. Choose installation directory (default: `C:\Users\<user>\AppData\Local\Programs\ruby-raider`)
6. Complete installation
7. Launch Raider Desktop from Start Menu or Desktop shortcut

---

## Testing Checklist

### Phase 1: Initial Launch ✅

- [ ] **App launches without errors**
  - No crash on startup
  - No console errors
  - UI renders correctly

- [ ] **Ruby auto-detection works**
  - App detects Ruby 3.1.6 automatically
  - No "Ruby not found" error modal
  - Dashboard shows Ruby version

**If Ruby not detected:**
```powershell
# Check Ruby in PATH
ruby -v
where.exe ruby

# Restart Raider Desktop
# Still not working? Check logs at:
# C:\Users\<user>\AppData\Roaming\ruby-raider\logs
```

---

### Phase 2: Project Creation ✅

#### Test 1: Create Selenium Project

1. Click **"Create New Project"**
2. Enter project name: `test_selenium_windows`
3. Select:
   - **Automation:** Selenium
   - **Framework:** RSpec
4. Choose location: `C:\Users\<user>\Documents\raider_projects\`
5. Click **"Create Project"**

**Verify:**
- [ ] Project folder created
- [ ] `Gemfile` exists
- [ ] `spec/` directory exists
- [ ] No permission errors
- [ ] Project appears in Overview page

**Check project structure:**
```powershell
cd C:\Users\<user>\Documents\raider_projects\test_selenium_windows
dir
# Should see: Gemfile, spec/, lib/, etc.

type Gemfile
# Should contain: selenium-webdriver, rspec, etc.
```

#### Test 2: Create Appium Project (Optional)

1. Create new project
2. Select **Appium** automation
3. Select **Android** or **iOS**
4. Verify mobile-specific config created

---

### Phase 3: Test Recording ✅

1. **Open existing project** (or create new one)
2. Navigate to **Recorder** page
3. Enter URL: `https://example.com`
4. Click **"Start Recording"**

**Verify:**
- [ ] Browser launches (Chrome or Edge)
- [ ] No browser launch errors
- [ ] Recording controls appear
- [ ] Can interact with page

**Record some steps:**
- [ ] Click on links → Steps appear in UI
- [ ] Fill in forms → Steps recorded
- [ ] Navigate pages → Navigation recorded

**Stop recording:**
- [ ] Click "Stop Recording"
- [ ] Steps saved to UI
- [ ] Can view in "Code View" and "Friendly View"

---

### Phase 4: Test Execution ✅

1. With recorded test open, click **"Run Test"**

**Verify:**
- [ ] Test execution starts
- [ ] Browser launches
- [ ] Steps execute in sequence
- [ ] Test output appears in panel
- [ ] Green/red result displayed

**Check RSpec output:**
```
Running test...

Finished in 5.23 seconds
1 example, 0 failures
```

**If test fails:**
- Check error message in output panel
- Verify browser driver installed (ChromeDriver/EdgeDriver)
- Check Ruby gems installed

---

### Phase 5: Gem Management ✅

1. Navigate to **Settings** → **General**
2. If missing gems detected, should show "Install Gems" button

**Test gem installation:**
- [ ] Click "Install Gems"
- [ ] Progress shown
- [ ] Success message appears
- [ ] Gems verified installed

**Manual verification:**
```powershell
cd C:\Users\<user>\Documents\raider_projects\test_selenium_windows
bundle check
# Should say: "The Gemfile's dependencies are satisfied"
```

---

### Phase 6: Error Handling ✅

#### Test: No Ruby Installed

1. Uninstall Ruby temporarily (or create new VM snapshot)
2. Launch Raider Desktop

**Verify:**
- [ ] Clear error modal appears
- [ ] Error message mentions Ruby installation
- [ ] Provides link to RubyInstaller.org
- [ ] Provides Chocolatey command
- [ ] Modal dismissible

#### Test: Wrong Ruby Version

1. Install Ruby 2.7 (older version)
2. Launch Raider Desktop

**Verify:**
- [ ] Error message mentions version requirement
- [ ] Says "Ruby 3.0.0+ required"
- [ ] Shows detected version

#### Test: Permission Denied

1. Create project in protected folder (e.g., `C:\Program Files\`)

**Verify:**
- [ ] Clear permission error
- [ ] Suggests running as admin or changing location
- [ ] Provides icacls command (Windows equivalent of chmod)

---

### Phase 7: UI/UX Verification ✅

**Check Windows-specific UI:**
- [ ] Fonts render correctly (Windows ClearType)
- [ ] Buttons properly sized
- [ ] Modals centered
- [ ] Scrollbars work
- [ ] Window resizing works
- [ ] Maximize/minimize works
- [ ] Dark mode (if supported)

**Check installation guide:**
1. Navigate to **Info** → **Install Guide** (if no Ruby)
2. Verify Windows-specific instructions shown
3. Links to RubyInstaller work
4. Chocolatey command displayed

---

### Phase 8: Performance ✅

**Check responsiveness:**
- [ ] App launches in <5 seconds
- [ ] Page navigation instant
- [ ] Recording starts quickly
- [ ] Test execution not slower than expected
- [ ] No UI freezing

**Compare to macOS:**
- Windows should be within 20% of macOS performance
- If significantly slower, investigate

---

## Common Issues & Solutions

### Issue: Ruby Not Detected

**Symptoms:** "Ruby not found" error on launch

**Solutions:**

1. **Verify Ruby in PATH:**
   ```powershell
   ruby -v
   where.exe ruby
   ```

2. **Restart Raider Desktop:**
   - Close completely (check Task Manager)
   - Relaunch

3. **Reinstall Ruby:**
   - Ensure "Add to PATH" checked
   - Restart computer after installation

4. **Check logs:**
   ```powershell
   type "C:\Users\<user>\AppData\Roaming\ruby-raider\logs\main.log"
   ```

---

### Issue: Browser Won't Launch

**Symptoms:** Recording starts but browser doesn't open

**Solutions:**

1. **Install Chrome or Edge:**
   - Edge is pre-installed on Windows 11
   - Chrome: https://www.google.com/chrome/

2. **Install browser driver manually:**
   ```powershell
   gem install selenium-webdriver
   ```

3. **Check browser driver in PATH:**
   ```powershell
   where.exe chromedriver
   # If not found, download from: https://chromedriver.chromium.org/
   ```

---

### Issue: Permission Denied

**Symptoms:** Can't create project or save files

**Solutions:**

1. **Choose different location:**
   - Use `C:\Users\<user>\Documents\`
   - Avoid `C:\Program Files\` or system folders

2. **Fix permissions:**
   ```powershell
   icacls "C:\path\to\project" /grant:r ${env:USERNAME}:F /T
   ```

3. **Run as Administrator:**
   - Right-click Raider Desktop
   - "Run as administrator"

---

### Issue: PowerShell Errors

**Symptoms:** Commands fail with "execution policy" error

**Solution:**
```powershell
# Run as Administrator
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

### Issue: Slow Performance

**Symptoms:** App sluggish, test execution slow

**Solutions:**

1. **Increase VM resources:**
   - Allocate more RAM (8GB recommended)
   - Add more CPU cores (4 recommended)

2. **Close other apps in VM:**
   - Check Task Manager
   - Close unnecessary processes

3. **Disable Windows Defender (for testing only):**
   - Temporarily disable real-time scanning
   - Re-enable after testing

---

## Debugging Tools

### Windows PowerShell

```powershell
# Check Ruby
ruby -v
gem list

# Check PATH
$env:PATH -split ';'

# Check running processes
Get-Process | Where-Object {$_.Name -like "*ruby*"}
Get-Process | Where-Object {$_.Name -like "*raider*"}

# View recent logs
Get-Content "C:\Users\$env:USERNAME\AppData\Roaming\ruby-raider\logs\main.log" -Tail 50

# Test PowerShell command translation
Get-Command ruby -ErrorAction SilentlyContinue
```

### Windows Event Viewer

```powershell
# Open Event Viewer
eventvwr.msc

# Check Application logs for crashes
# Windows Logs → Application → Look for errors
```

### Task Manager

```powershell
# Open Task Manager
taskmgr.exe

# Check CPU/RAM usage
# Look for Raider Desktop process
```

---

## Recording Results

### Take Screenshots

**Important moments to capture:**
1. Ruby detection success
2. Project creation
3. Test recording in progress
4. Test execution results
5. Any errors encountered

**How:**
- Press `Windows + Shift + S`
- Or use Snipping Tool

### Save Logs

```powershell
# Copy logs to shared folder
Copy-Item "C:\Users\$env:USERNAME\AppData\Roaming\ruby-raider\logs\*" "\\Mac\Home\Downloads\raider_logs\"
```

### Record Test Results

Create a test report:
```markdown
# Windows VM Test Results

## Environment
- Windows Version: Windows 11 Pro
- Ruby Version: 3.1.6
- Installation Method: RubyInstaller
- VM Software: Parallels Desktop

## Test Results

### Phase 1: Initial Launch
- ✅ App launched successfully
- ✅ Ruby detected automatically

### Phase 2: Project Creation
- ✅ Selenium project created
- ✅ All files generated correctly

### Phase 3: Test Recording
- ✅ Browser launched (Chrome)
- ✅ Steps recorded correctly

### Phase 4: Test Execution
- ✅ Test ran successfully
- ⏱️ Execution time: 5.2 seconds

### Issues Found
- None

### Performance Notes
- App responsive
- Comparable to macOS performance
```

---

## Cleanup

### After Testing

```powershell
# Uninstall Raider Desktop
# Settings → Apps → Ruby Raider → Uninstall

# Or keep for future testing
```

### VM Snapshot

**Parallels/VMware:**
1. VM → Snapshots → Take Snapshot
2. Name: "Ruby installed, ready for testing"
3. Restore later for fresh testing

---

## Next Steps

### If Tests Pass ✅

1. **Report success** to development team
2. **Share screenshots** and test results
3. **Consider merge** to main branch

### If Tests Fail ❌

1. **Document errors** with screenshots
2. **Check logs** for details
3. **Create GitHub issue** with:
   - Error message
   - Steps to reproduce
   - Windows version
   - Ruby version
   - Logs

---

## Quick Reference

### Essential Commands (PowerShell)

```powershell
# Check Ruby
ruby -v

# Check gems
gem list

# Install gems
gem install ruby_raider selenium-webdriver rspec

# Check PATH
$env:PATH -split ';'

# View logs
type "C:\Users\$env:USERNAME\AppData\Roaming\ruby-raider\logs\main.log"

# Fix permissions
icacls "C:\path\to\project" /grant:r ${env:USERNAME}:F /T
```

### Important Paths

```
Ruby (RubyInstaller): C:\Ruby31-x64\
Raider Desktop: C:\Users\<user>\AppData\Local\Programs\ruby-raider\
Logs: C:\Users\<user>\AppData\Roaming\ruby-raider\logs\
Projects: C:\Users\<user>\Documents\raider_projects\
```

---

## Support

### If You Get Stuck

1. **Check logs first**
2. **Try the "Common Issues" section**
3. **Search existing GitHub issues**
4. **Create new issue with details**

### Useful Links

- RubyInstaller: https://rubyinstaller.org/downloads/
- Chocolatey: https://chocolatey.org/install
- GitHub Actions: https://github.com/RaiderHQ/raider_desktop/actions
- Issues: https://github.com/RaiderHQ/raider_desktop/issues

---

**Testing should take 30-60 minutes for complete verification** ✅

Good luck! 🚀
