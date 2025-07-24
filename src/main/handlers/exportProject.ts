import { BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { appState } from './appState'

export default async (): Promise<{ success: boolean; path?: string; error?: string }> => {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) {
    return { success: false, error: 'No focused window found.' }
  }

  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Export Project',
    defaultPath: 'raider-project',
    buttonLabel: 'Export',
    properties: ['createDirectory']
  })

  if (canceled || !filePath) {
    return { success: false, error: 'Export cancelled.' }
  }

  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(filePath)
    }

    for (const suite of appState.suites.values()) {
      const suiteFolderPath = path.join(
        filePath,
        suite.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      )
      if (!fs.existsSync(suiteFolderPath)) {
        fs.mkdirSync(suiteFolderPath)
      }

      for (const test of suite.tests) {
        const testFileName = `${test.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.rb`
        const testFilePath = path.join(suiteFolderPath, testFileName)
        const stepsContent = test.steps.map((step) => `  ${step}`).join('\n')
        const scriptContent = `#!/usr/bin/env ruby\n\n# Test: ${test.name}\n# Suite: ${suite.name}\n# Exported from IDE on ${new Date().toLocaleString()}\n\nrequire 'selenium-webdriver'\n\n# --- Setup ---\ndriver = Selenium::WebDriver.for :chrome\nwait = Selenium::WebDriver::Wait.new(timeout: 10)\n\nputs "Starting test: ${test.name}"\n\n# --- Test Steps ---\nbegin\n${stepsContent}\n  puts "Test '${test.name}' passed successfully!"\nrescue => e\n  puts "Test '${test.name}' failed: #{e.message}"\nensure\n  # --- Teardown ---\n  puts "Closing driver."\n  driver.quit\nend\n`
        fs.writeFileSync(testFilePath, scriptContent, 'utf8')
        if (process.platform !== 'win32') {
          fs.chmodSync(testFilePath, '755')
        }
      }
    }

    return { success: true, path: filePath }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Failed to export project:', error)
    return { success: false, error: errorMessage }
  }
}
