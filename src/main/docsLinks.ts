import { shell } from 'electron'
import { isDocsLinkId, type DocsLinkId } from '../shared/docsLinkIds'

const SITE = 'https://ruby-raider.onrender.com'

export const DOCS_LINKS: Record<DocsLinkId, string> = {
  'docs.home': `${SITE}/docs/index.html`,
  'docs.gettingStarted': `${SITE}/docs/getting-started.html`,
  'docs.projects': `${SITE}/docs/projects.html`,
  'docs.recorder': `${SITE}/docs/recording.html`,
  'docs.assertions': `${SITE}/docs/recording.html#assertions`,
  'docs.recordingGuide': `${SITE}/docs/recording.html#first-recording-guide`,
  'docs.saving': `${SITE}/docs/saving.html`,
  'docs.shortcuts': `${SITE}/docs/keyboard-shortcuts.html`,
  'docs.running': `${SITE}/docs/running-and-results.html`,
  'docs.dashboard': `${SITE}/docs/running-and-results.html#dashboard`,
  'docs.testScreen': `${SITE}/docs/files-and-settings.html`,
  'docs.scaffolding': `${SITE}/docs/scaffolding.html`,
  'docs.errors': `${SITE}/docs/troubleshooting.html`,
  'docs.install': `${SITE}/docs/getting-started.html`,
  'docs.gem': 'https://github.com/RaiderHQ/ruby_raider#readme',
  'docs.site': `${SITE}/`
}

export const ALLOWED_DOCS_HOSTS = ['ruby-raider.onrender.com', 'github.com', 'ruby-raider.com'] as const

export function isAllowedDocsUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      u.port === '' &&
      (ALLOWED_DOCS_HOSTS as readonly string[]).includes(u.hostname)
    )
  } catch {
    return false
  }
}

const logId = (id: unknown): string => (typeof id === 'string' ? id.slice(0, 64) : typeof id)

/** Resolves a link id from the table and opens it; false when refused. */
export async function openDocs(
  id: unknown,
  open: (url: string) => Promise<void> = (url) => shell.openExternal(url),
  links: Record<string, string> = DOCS_LINKS
): Promise<boolean> {
  if (!isDocsLinkId(id) || !Object.prototype.hasOwnProperty.call(links, id)) {
    console.warn('open-docs refused', logId(id))
    return false
  }
  const url = links[id]
  if (!isAllowedDocsUrl(url)) {
    console.warn('open-docs refused', logId(id))
    return false
  }
  try {
    await open(url)
  } catch (e) {
    console.warn('open-docs failed', id, e)
    return false
  }
  return true
}
