// getMobileCapabilities.ts
import fs from 'fs/promises'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'
import yaml from 'js-yaml'

const getMobileCapabilities = async (
  _event: IpcMainInvokeEvent,
  projectPath: string
): Promise<{ success: boolean; capabilities?: any; error?: string }> => {
  try {
    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      throw new Error('Invalid projectPath: Must be a non-empty string')
    }

    const normalizedProjectPath = path.resolve(projectPath)
    const capabilitiesFilePath = path.join(normalizedProjectPath, 'config/capabilities.yml')

    const fileContent = await fs.readFile(capabilitiesFilePath, 'utf8')

    const platformMatch = fileContent.match(/^platformName:\s*.*$/m)
    const appiumMatch = fileContent.match(
      /^appium:options:\n(?:[ \t]+.*\n?)+/m
    )

    if (!platformMatch || !appiumMatch) {
      throw new Error('Required keys not found in capabilities file')
    }

    const filteredYaml = `${platformMatch[0]}\n${appiumMatch[0]}`

    const capabilities = yaml.load(filteredYaml)

    return { success: true, capabilities }
  } catch (error) {
    console.error('Error getting mobile capabilities:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export default getMobileCapabilities
