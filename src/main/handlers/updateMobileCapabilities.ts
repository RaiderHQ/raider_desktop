import fs from 'fs/promises'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'

interface MobileCapabilities {
  platformVersion: string
  automationName: string
  deviceName: string
  app: string
}

const updateMobileCapabilities = async (
  _event: IpcMainInvokeEvent,
  projectPath: string,
  capabilities: MobileCapabilities
): Promise<{ success: boolean; output?: string; error?: string }> => {
  try {
    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      throw new Error('Invalid projectPath: Must be a non-empty string')
    }
    if (!capabilities || typeof capabilities !== 'object') {
      throw new Error('Invalid capabilities: Must be an object')
    }
    const { platformVersion, automationName, deviceName, app } = capabilities
    if (typeof platformVersion !== 'string' || !platformVersion.trim()) {
      throw new Error('Invalid platformVersion: Must be a non-empty string')
    }
    if (typeof automationName !== 'string' || !automationName.trim()) {
      throw new Error('Invalid automationName: Must be a non-empty string')
    }
    if (typeof deviceName !== 'string' || !deviceName.trim()) {
      throw new Error('Invalid deviceName: Must be a non-empty string')
    }
    if (typeof app !== 'string' || !app.trim()) {
      throw new Error('Invalid app: Must be a non-empty string')
    }

    const normalizedProjectPath = path.resolve(projectPath)
    const capabilitiesFilePath = path.join(normalizedProjectPath, 'config/capabilities.yml')

    const fileContent = await fs.readFile(capabilitiesFilePath, 'utf8')

    const appiumRegex = /^appium:options:\n((?:[ \t]+.*\n)+)/m
    const match = fileContent.match(appiumRegex)
    if (!match) {
      throw new Error('appium:options block not found in the capabilities file.')
    }

    const oldBlock = match[0]

    const urlRegex = /^[ \t]+url:\s*(.*)$/m
    const urlMatch = oldBlock.match(urlRegex)
    const oldUrl = urlMatch ? urlMatch[1].trim() : ''

    const newBlockLines = ['appium:options:']
    if (oldUrl) {
      newBlockLines.push(`  url: ${oldUrl}`)
    }
    newBlockLines.push(`  platformVersion: '${platformVersion}'`)
    newBlockLines.push(`  automationName: '${automationName}'`)
    newBlockLines.push(`  deviceName: '${deviceName}'`)
    newBlockLines.push(`  app: '${app}'`)
    const newBlock = newBlockLines.join('\n') + '\n'

    const updatedContent = fileContent.replace(appiumRegex, newBlock)

    await fs.writeFile(capabilitiesFilePath, updatedContent, 'utf8')

    return { success: true, output: 'Mobile capabilities updated successfully.' }
  } catch (error) {
    console.error('Error updating mobile capabilities:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export default updateMobileCapabilities
