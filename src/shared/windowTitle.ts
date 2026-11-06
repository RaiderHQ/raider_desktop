import type { Platform } from './shortcuts'

export interface TitleParts {
  document?: { name: string; edited: boolean } | null
  project?: string | null
  platform: Platform
}

const APP = 'Ruby Raider'

/** "<name> — <project> — Ruby Raider" | "<project> — Ruby Raider" | "Ruby Raider"; "• " prefix when edited and not on a Mac */
export function windowTitle({ document, project, platform }: TitleParts): string {
  const parts = [document?.name || null, project || null, APP].filter(Boolean)
  const title = parts.join(' — ')
  return document?.edited && platform !== 'mac' ? `• ${title}` : title
}
