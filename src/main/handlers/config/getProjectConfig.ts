import { readFile } from 'fs/promises'
import { join } from 'path'
import yaml from 'js-yaml'

export interface ProjectConfig {
  baseUrl?: string
  browser?: string
  headless?: boolean
  timeout?: number
  browserArguments?: string[]
}

const handler = async (
  projectPath: string
): Promise<{ success: boolean; config?: ProjectConfig; error?: string }> => {
  try {
    if (!projectPath || typeof projectPath !== 'string') {
      return { success: false, error: 'Invalid project path' }
    }

    const result: ProjectConfig = {}

    // Ruby Raider v3 stores all config in config/config.yml
    try {
      const configFilePath = join(projectPath, 'config', 'config.yml')
      const configContent = await readFile(configFilePath, 'utf-8')
      const config = yaml.load(configContent) as Record<string, unknown>
      if (config) {
        if (typeof config['url'] === 'string') {
          result.baseUrl = config['url']
        } else if (typeof config['base_url'] === 'string') {
          result.baseUrl = config['base_url']
        }
        if (typeof config['browser'] === 'string') {
          result.browser = config['browser']
        }
        if (typeof config['headless'] === 'boolean') {
          result.headless = config['headless']
        }
        if (typeof config['timeout'] === 'number') {
          result.timeout = config['timeout']
        }
        const browserArgs = config['browser_arguments']
        if (
          typeof config['browser'] === 'string' &&
          browserArgs &&
          typeof browserArgs === 'object'
        ) {
          const args = (browserArgs as Record<string, unknown>)[config['browser']]
          if (Array.isArray(args)) {
            result.browserArguments = args.filter((a): a is string => typeof a === 'string')
          }
        }
      }
    } catch {
      // config.yml may not exist; that's OK
    }

    return { success: true, config: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export default handler
