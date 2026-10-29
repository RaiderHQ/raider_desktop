import { readFile } from 'fs/promises'
import { isAbsolute, join, normalize } from 'path'
import yaml from 'js-yaml'
import type { ProjectLayout } from '@shared/types/projectLayout'

const DEFAULT_PATHS = { specPath: 'spec', featurePath: 'features', helperPath: 'helpers' }

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

// A path from config is only used when it stays inside the project
function safeRelativePath(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.trim() === '') return fallback
  const path = value.trim()
  if (isAbsolute(path) || path.split(/[\\/]/).includes('..')) return fallback
  // '.' or './' would point at the project root itself
  if (normalize(path).replace(/[\\/]+$/, '') === '.') return fallback
  return path
}

async function readPaths(projectPath: string): Promise<typeof DEFAULT_PATHS> {
  const text = await readOptional(join(projectPath, 'config', 'config.yml'))
  if (text === null) return { ...DEFAULT_PATHS }
  let config: unknown
  try {
    config = yaml.load(text)
  } catch {
    return { ...DEFAULT_PATHS }
  }
  const values = (config && typeof config === 'object' ? config : {}) as Record<string, unknown>
  return {
    specPath: safeRelativePath(values.spec_path, DEFAULT_PATHS.specPath),
    featurePath: safeRelativePath(values.feature_path, DEFAULT_PATHS.featurePath),
    helperPath: safeRelativePath(values.helper_path, DEFAULT_PATHS.helperPath)
  }
}

/**
 * Works out a project's framework, automation and paths. Gems are matched like
 * ruby_raider's ScaffoldProjectDetector: present when 'name' or "name" is in the Gemfile.
 */
export async function detectProjectLayout(projectPath: string): Promise<ProjectLayout> {
  const paths = await readPaths(projectPath)
  const gemfile = await readOptional(join(projectPath, 'Gemfile'))
  const base: ProjectLayout = {
    framework: 'rspec',
    automation: 'selenium',
    ...paths,
    recordable: true
  }
  if (gemfile === null) return { ...base, recordable: false, unsupportedReason: 'noGemfile' }

  // Commented-out lines don't install anything
  const active = gemfile
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
  const has = (gem: string): boolean => active.includes(`'${gem}'`) || active.includes(`"${gem}"`)
  // Cucumber Gemfiles often also list rspec, so cucumber wins
  const framework = has('cucumber') ? 'cucumber' : 'rspec'
  const unsupported = (reason: NonNullable<ProjectLayout['unsupportedReason']>): ProjectLayout => ({
    ...base,
    framework,
    recordable: false,
    unsupportedReason: reason
  })

  if (has('appium_lib')) return unsupported('mobile')
  if (has('minitest') && !has('rspec') && !has('cucumber')) return unsupported('minitest')
  if (has('capybara')) return unsupported('capybara')
  return { ...base, framework, automation: has('watir') ? 'watir' : 'selenium' }
}
