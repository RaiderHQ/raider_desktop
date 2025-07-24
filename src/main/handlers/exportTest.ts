import { BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import type { TestData } from '@foundation/Types/testData'

export default async ({
  testName,
  steps
}: TestData): Promise<{ success: boolean; path?: string; error?: string }> => {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) {
    return { success: false, error: 'No focused window available to show the save dialog.' }
  }

  const defaultFileName = `${testName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.rb`

  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Export Test Script',
    defaultPath: defaultFileName,
    buttonLabel: 'Export',
    filters: [
      { name: 'Ruby Scripts', extensions: ['rb'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (canceled || !filePath) {
    return { success: false, error: 'Export cancelled by user.' }
  }

  const stepsContent = steps.map((step) => `  ${step}`).join('\n')
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
`

  try {
    fs.writeFileSync(filePath, scriptContent, 'utf8')

    if (process.platform !== 'win32') {
      fs.chmodSync(filePath, '755')
    }

    return { success: true, path: filePath }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Failed to write or set permissions for the script:', error)
    return { success: false, error: errorMessage }
  }
}
