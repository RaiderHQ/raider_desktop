import { app } from 'electron'
import path from 'path'
import fs from 'fs'

export interface LongshipConfig {
  url: string
  apiKey: string
  enabled: boolean
}

const CONFIG_FILE = path.join(app.getPath('userData'), 'longship-config.json')

const DEFAULT_CONFIG: LongshipConfig = {
  url: '',
  apiKey: '',
  enabled: false
}

export function getLongshipConfig(): LongshipConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8')
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) }
    }
  } catch {
    // Return defaults on parse error
  }
  return DEFAULT_CONFIG
}

export function setLongshipConfig(config: Partial<LongshipConfig>): LongshipConfig {
  const current = getLongshipConfig()
  const updated = { ...current, ...config }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2))
  return updated
}
