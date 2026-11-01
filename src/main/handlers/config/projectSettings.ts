import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import yaml from 'js-yaml'
import type { RecorderSettings } from '@shared/types/recorderSettings'

export type { RecorderSettings }

export const DEFAULT_SELECTOR_PRIORITY: string[] = [
  'role',
  'label',
  'testId',
  'text',
  'id',
  'css',
  'xpath'
]
export const DEFAULT_TEST_ID_ATTRIBUTE = 'data-testid'

// The default before stable locators; a project still carrying it gets the new order.
const OLD_DEFAULT_PRIORITY = ['id', 'data-testid', 'css', 'xpath']
const ATTRIBUTE_NAME = /^[A-Za-z_][\w.:-]*$/

/**
 * Maps a configured selector_priority to the recorder's names. data-testid becomes
 * testId; any other unknown name is kept and read as a test-id style attribute.
 */
export function normalizePriority(list: string[] | undefined): string[] {
  if (
    !list ||
    list.length === 0 ||
    (list.length === OLD_DEFAULT_PRIORITY.length &&
      list.every((p, i) => p === OLD_DEFAULT_PRIORITY[i]))
  ) {
    return [...DEFAULT_SELECTOR_PRIORITY]
  }
  return list.map((p) => (p === 'data-testid' ? 'testId' : p))
}

export const DEFAULT_RECORDER_SETTINGS: RecorderSettings = {
  baseUrl: '',
  browser: 'chrome',
  headless: false,
  implicitWait: 0,
  explicitWait: 10,
  selectorPriority: [...DEFAULT_SELECTOR_PRIORITY],
  testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE
}

type WritableSettings = Partial<
  Pick<RecorderSettings, 'implicitWait' | 'explicitWait' | 'selectorPriority'>
>

const configPathFor = (projectPath: string): string => join(projectPath, 'config', 'config.yml')

async function readRaw(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function readRecorderSettings(projectPath: string): Promise<RecorderSettings> {
  let config: Record<string, unknown> = {}
  const raw = await readRaw(configPathFor(projectPath)).catch(() => null)
  if (raw !== null) {
    try {
      const parsed = yaml.load(raw)
      if (parsed && typeof parsed === 'object') config = parsed as Record<string, unknown>
    } catch {
      // unparseable config: fall back to defaults
    }
  }

  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined

  const priority = config['selector_priority']
  const selectorPriority = normalizePriority(
    Array.isArray(priority) && priority.every((p) => typeof p === 'string')
      ? (priority as string[])
      : undefined
  )
  const testId = config['test_id_attribute']
  const testIdAttribute =
    typeof testId === 'string' && ATTRIBUTE_NAME.test(testId) ? testId : DEFAULT_TEST_ID_ATTRIBUTE

  return {
    baseUrl:
      typeof config['url'] === 'string'
        ? config['url']
        : typeof config['base_url'] === 'string'
          ? config['base_url']
          : '',
    browser: typeof config['browser'] === 'string' ? config['browser'] : 'chrome',
    headless: typeof config['headless'] === 'boolean' ? config['headless'] : false,
    implicitWait: num(config['implicit_wait']) ?? 0,
    explicitWait: num(config['explicit_wait']) ?? num(config['timeout']) ?? 10,
    selectorPriority,
    testIdAttribute
  }
}

function formatValue(value: number | string[]): string {
  return Array.isArray(value) ? `[${value.join(', ')}]` : String(value)
}

export async function writeRecorderSettings(
  projectPath: string,
  patch: WritableSettings
): Promise<void> {
  const path = configPathFor(projectPath)
  const entries: Array<[string, number | string[]]> = []
  if (patch.implicitWait !== undefined) entries.push(['implicit_wait', patch.implicitWait])
  if (patch.explicitWait !== undefined) entries.push(['explicit_wait', patch.explicitWait])
  if (patch.selectorPriority !== undefined)
    entries.push(['selector_priority', patch.selectorPriority])
  if (entries.length === 0) return

  let text = (await readRaw(path)) ?? ''

  const lines = text.length > 0 ? text.split('\n') : []
  for (const [key, value] of entries) {
    const formatted = formatValue(value)
    const idx = lines.findIndex((l) => l.startsWith(`${key}:`))
    if (idx >= 0) {
      // Keep any trailing ` # comment` from the key line.
      const comment = lines[idx].slice(key.length + 1).match(/\s+#.*$/)?.[0] ?? ''
      // Consume continuation lines of a block-style or multi-line value.
      let end = idx + 1
      while (end < lines.length && /^(\s+\S|-(\s|$))/.test(lines[end])) end++
      lines.splice(idx, end - idx, `${key}: ${formatted}${comment}`)
    } else {
      // A trailing newline shows up as a final empty element; insert before it.
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
      lines.push(`${key}: ${formatted}`)
      lines.push('')
    }
  }
  text = lines.join('\n')

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf-8')
}
