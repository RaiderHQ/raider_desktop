import { app, shell, BrowserWindow, ipcMain, IpcMainEvent, dialog } from "electron";
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { randomUUID } from 'crypto'
import selectFolder from './handlers/selectFolder'
import readDirectory from './handlers/readDirectory'
import runRubyRaider from './handlers/runRubyRaider'
import readFile from './handlers/readFile'
import readImage from './handlers/readImage'
import openAllure from './handlers/openAllure'
import editFile from './handlers/editFile'
import runTests from './handlers/runTests'
import updateBrowserUrl from './handlers/updateBrowserUrl'
import updateBrowserType from './handlers/updateBrowserType'
import isMobileProject from './handlers/isMobileProject'
import runCommand from './handlers/runCommand'
import installRaider from './handlers/installRaider'
import updateMobileCapabilities from './handlers/updateMobileCapabilities'
import getMobileCapabilities from './handlers/getMobileCapabilities'
import isRubyInstalled from './handlers/isRubyInstalled'
import runRecording from './handlers/runRecording'
import fs from 'fs'
import commandParser from './handlers/commandParser'

const iconPath = join(
  __dirname,
  process.platform === 'darwin'
    ? '../../resources/ruby-raider.icns' // macOS
    : process.platform === 'win32'
      ? '../../resources/ruby-raider.ico' // Windows
      : '../../resources/ruby-raider.png' // Linux
)

// --- Define Types for our data structure ---
interface Test {
  id: string;
  name: string;
  url: string;
  steps: string[];
}
interface Suite {
  id: string;
  name: string;
  tests: Test[];
}

// --- Window and State Management ---
let mainWindow: BrowserWindow | null = null
let recorderWindow: BrowserWindow | null = null

const appState = {
  // Use a Map to store suites, with a unique ID as the key
  suites: new Map<string, Suite>(),
  projectBaseUrl: 'https://www.google.com'
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ruby-raider')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// --- IPC Handlers ---

// Your other handlers remain the same
ipcMain.handle('select-folder', selectFolder)
ipcMain.handle('read-directory', readDirectory)
ipcMain.handle('open-allure', openAllure)
ipcMain.handle('read-file', readFile)
ipcMain.handle('read-image', readImage)
ipcMain.handle('edit-file', editFile)
ipcMain.handle('run-ruby-raider', runRubyRaider)
ipcMain.handle('is-mobile-project', isMobileProject)
ipcMain.handle('run-tests', runTests)
ipcMain.handle('update-browser-url', updateBrowserUrl)
ipcMain.handle('update-browser-type', updateBrowserType)
ipcMain.handle('run-command', runCommand)
ipcMain.handle('install-raider', installRaider)
ipcMain.handle('update-mobile-capabilities', updateMobileCapabilities)
ipcMain.handle('get-mobile-capabilities', getMobileCapabilities)
ipcMain.handle('is-ruby-installed', isRubyInstalled)
ipcMain.handle('command-parser', async (_event, command: string) => {
  // The handler simply calls our utility function and returns the result.
  const friendlyText = commandParser(command);
  return friendlyText;
});

// --- Recorder and Suite IPC Handlers ---

ipcMain.handle('load-url-request', (event, url: string) => {
  appState.projectBaseUrl = url
  return { success: true }
})

ipcMain.handle('start-recording-main', () => {
  if (recorderWindow) {
    recorderWindow.focus()
    return { success: true }
  }
  recorderWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: true,
    title: 'Recording Session',
    webPreferences: {
      preload: join(__dirname, '../preload/recorderPreload.js')
    }
  })

  recorderWindow.on('closed', () => {
    mainWindow?.webContents.send('recording-stopped')
    recorderWindow = null
  })

  recorderWindow.loadURL(appState.projectBaseUrl)
  recorderWindow.focus()
  mainWindow?.webContents.send('recording-started', appState.projectBaseUrl)

  return { success: true }
})

ipcMain.handle('stop-recording-main', () => {
  if (recorderWindow) {
    recorderWindow.close()
  }
  return { success: true }
})

ipcMain.handle('get-suites', () => {
  return Array.from(appState.suites.values());
});

ipcMain.handle('create-suite', (event, suiteName: string) => {
  if (!suiteName || Array.from(appState.suites.values()).some(s => s.name === suiteName)) {
    return { success: false, error: 'A suite with this name already exists.' };
  }
  const newSuite: Suite = { id: randomUUID(), name: suiteName, tests: [] };
  appState.suites.set(newSuite.id, newSuite);
  mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()));
  return { success: true, suite: newSuite };
});

ipcMain.handle('delete-suite', (event, suiteId: string) => {
  const success = appState.suites.delete(suiteId);
  if (success) {
    mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()));
  }
  return { success };
});

ipcMain.handle('save-test', (event, { suiteId, testData }: { suiteId: string, testData: Test }) => {
  const suite = appState.suites.get(suiteId);
  if (!suite) {
    return { success: false, error: 'Suite not found' };
  }
  const testIndex = suite.tests.findIndex(t => t.id === testData.id);
  if (testIndex !== -1) {
    suite.tests[testIndex] = testData; // Update existing test
  } else {
    suite.tests.push({ ...testData, id: randomUUID() }); // Add new test with a new ID
  }
  mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()));
  return { success: true };
});

ipcMain.handle('run-test', (event, { suiteId, testId }: { suiteId: string, testId: string }) => {
  const suite = appState.suites.get(suiteId);
  const test = suite?.tests.find(t => t.id === testId);
  if (test) {
    return runRecording({ savedTest: test });
  }
  return { success: false, output: `Test with ID ${testId} not found in suite ${suiteId}` };
});


const keyMap: { [key: string]: string } = {
  'Enter': ':enter',
  'Tab': ':tab',
  'ArrowUp': ':arrow_up',
  'ArrowDown': ':arrow_down',
  'ArrowLeft': ':arrow_left',
  'ArrowRight': ':arrow_right',
  'Escape': ':escape',
};

ipcMain.on('recorder-event', (event: IpcMainEvent, data: any) => {
  let commandString = ''
  switch (data.action) {
    case 'click':
      const escapedClickSelector = data.selector.replace(/"/g, '\\"')
      commandString = `@driver.find_element(:css, "${escapedClickSelector}").click # Clicked <${data.tagName.toLowerCase()}>`
      break;

    case 'type':
      const escapedTypeSelector = data.selector.replace(/"/g, '\\"')
      const escapedValue = data.value.replace(/"/g, '\\"')
      commandString = `@driver.find_element(:css, "${escapedTypeSelector}").clear\n`
      commandString += `    @driver.find_element(:css, "${escapedTypeSelector}").send_keys("${escapedValue}")`
      break;

    case 'sendKeys':
      const keySymbol = keyMap[data.value]
      if (keySymbol) {
        const escapedKeySelector = data.selector.replace(/"/g, '\\"')
        commandString = `@driver.find_element(:css, "${escapedKeySelector}").send_keys(${keySymbol}) # Pressed ${data.value} on <${data.tagName.toLowerCase()}>`
      }
      break;
  }

  if (commandString) {
    mainWindow?.webContents.send('new-recorded-command', commandString)
  }
})

ipcMain.handle('run-suite', async (event, suiteId: string) => {
  const suite = appState.suites.get(suiteId);
  if (!suite) {
    return { success: false, output: `Suite with ID ${suiteId} not found.` };
  }

  let fullOutput = `Running suite: ${suite.name}\n==========================\n\n`;
  let overallSuccess = true;

  // Loop through each test in the suite and execute it
  for (const test of suite.tests) {
    fullOutput += `--- Running test: ${test.name} ---\n`;
    const result = await runRecording({ savedTest: test }); // Call the existing runner
    fullOutput += result.output + '\n';

    // If a test fails, mark the whole suite as failed and stop
    if (!result.success) {
      overallSuccess = false;
      fullOutput += `\n--- TEST FAILED: ${test.name}. Stopping suite run. ---\n`;
      break;
    }
    fullOutput += `--- TEST PASSED: ${test.name} ---\n\n`;
  }

  fullOutput += `==========================\nSuite run finished.`;
  return { success: overallSuccess, output: fullOutput };
});

ipcMain.handle('export-test', async (_event, { testName, steps }) => {
  // Get the currently focused window to attach the dialog to.
  const window = BrowserWindow.getFocusedWindow();
  if (!window) {
    // This can happen if the main window is not in focus.
    return { success: false, error: 'No focused window available to show the save dialog.' };
  }

  // Sanitize the test name for use as a file name
  const defaultFileName = `${testName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.rb`;

  // Use the imported 'dialog' object to show the save dialog.
  // The 'await' here is crucial as this is an asynchronous operation.
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Export Test Script',
    defaultPath: defaultFileName,
    buttonLabel: 'Export',
    filters: [
      { name: 'Ruby Scripts', extensions: ['rb'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  // If the user cancels the dialog or doesn't provide a path, exit gracefully.
  if (canceled || !filePath) {
    return { success: false, error: 'Export cancelled by user.' };
  }

  // Format the steps into a complete, runnable script
  const stepsContent = steps.map(step => `  ${step}`).join('\n');
  const scriptContent = `#!/usr/bin/env ruby

# Test: ${testName}
# Exported from IDE on ${new Date().toLocaleString()}

require 'selenium-webdriver'

# --- Setup ---
driver = Selenium::WebDriver.for :chrome
wait = Selenium::WebDriver::Wait.new(timeout: 10)

puts "Starting test: ${testName}"

# --- Test Steps ---
begin
${stepsContent}
  puts "Test '${testName}' passed successfully!"
rescue => e
  puts "Test '${testName}' failed: #{e.message}"
ensure
  # --- Teardown ---
  puts "Closing driver."
  driver.quit
end
`;

  try {
    // Write the script to the selected file path
    fs.writeFileSync(filePath, scriptContent, 'utf8');

    // On macOS and Linux, make the script executable
    if (process.platform !== 'win32') {
      fs.chmodSync(filePath, '755');
    }

    return { success: true, path: filePath };
  } catch (error: any) {
    console.error('Failed to write or set permissions for the script:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-test', async (_event, { suiteId, testId }: { suiteId: string, testId: string }) => {
  // 1. Get the specific suite from the in-memory Map
  const suite = appState.suites.get(suiteId);

  if (!suite) {
    console.error(`Error: Attempted to delete test from a non-existent suite (ID: ${suiteId}).`);
    return { success: false, error: `Suite with ID ${suiteId} not found.` };
  }

  const initialTestCount = suite.tests.length;

  // 2. Filter the tests array to remove the specified test
  suite.tests = suite.tests.filter(test => test.id !== testId);

  // Optional: Check if a test was actually deleted
  if (suite.tests.length === initialTestCount) {
    console.warn(`Warning: Test with ID ${testId} was not found in suite "${suite.name}".`);
  }

  // The 'appState' object is now updated in memory.
  // There is no need to save to a file.

  // 3. Notify the renderer process that the suites have been updated.
  //    This is the same mechanism your 'createSuite' function uses.
  mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()));

  return { success: true };
});
