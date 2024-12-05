import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import selectFolder from './handlers/selectFolder'
import readDirectory from './handlers/readDirectory'
import runRubyRaider from './handlers/runRubyRaider'
import readFile from './handlers/readFile'
import openAllure from './handlers/openAllure'
import editFile from './handlers/editFile'
import runTests from './handlers/runTests'
import updateBrowserUrl from './handlers/updateBrowserUrl'
import updateBrowserType from './handlers/updateBrowserType'
import isMobileProject from './handlers/isMobileProject'

// Select the appropriate icon based on the platform
const iconPath = join(
  __dirname,
  process.platform === 'darwin'
    ? '../../resources/ruby-raider.icns' // macOS
    : process.platform === 'win32'
      ? '../../resources/ruby-raider.ico' // Windows
      : '../../resources/ruby-raider.png' // Linux
)

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    show: false,
    autoHideMenuBar: true,
    icon: iconPath, // Set the icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev) {
    // Open the DevTools.
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ruby-raider') // Set a unique app ID

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
ipcMain.handle('select-folder', selectFolder)
ipcMain.handle('read-directory', readDirectory)
ipcMain.handle('open-allure', openAllure)
ipcMain.handle('read-file', readFile)
ipcMain.handle('edit-file', editFile)
ipcMain.handle('run-ruby-raider', runRubyRaider)
ipcMain.handle('is-mobile-project', isMobileProject)
ipcMain.handle('run-tests', runTests)
ipcMain.handle('update-browser-url', updateBrowserUrl)
ipcMain.handle('update-browser-type', updateBrowserType)

