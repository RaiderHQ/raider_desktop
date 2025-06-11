import { app, shell, BrowserWindow, ipcMain, IpcMainEvent } from 'electron'
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
