import { readFile } from 'fs/promises'
import { isAbsolute, join, normalize } from 'path'
import yaml from 'js-yaml'
import type { ProjectLayout } from '@shared/types/projectLayout'
import { detectMobilePlatform } from '../mobile/capabilitiesFile'
import { rubyRaiderPin, rubyRaiderVersion, supportsRuntime } from '../logins/rubyRaiderVersion'

const DEFAULT_PATHS = { specPath: 'spec', featurePath: 'features', helperPath: 'helpers' }

// Project files are read as text to look for a few lines; anything larger is not one of ours
const FILE_LIMIT = 1024 * 1024

async function readOptional(path: string): Promise<string | null> {
  try {
    const text = await readFile(path, 'utf-8')
    return text.length > FILE_LIMIT ? text.slice(0, FILE_LIMIT) : text
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
    runtimeSupported: true,
    recordable: true
  }
  if (gemfile === null) return { ...base, recordable: false, unsupportedReason: 'noGemfile' }

  // Commented-out lines don't install anything
  const active = gemfile
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
  const has = (gem: string): boolean => active.includes(`'${gem}'`) || active.includes(`"${gem}"`)
  const unsupported = (reason: NonNullable<ProjectLayout['unsupportedReason']>): ProjectLayout => ({
    ...base,
    recordable: false,
    unsupportedReason: reason
  })

  // The lock says what is installed; a project never bundled yet only has its pin, and a
  // project naming no version at all is given the benefit of the doubt (the run installs it)
  // An unreadable lock says nothing about the version; a missing one falls back to the pin
  const lock = await readOptional(join(projectPath, 'Gemfile.lock')).catch(() => null)
  const version = (lock !== null ? rubyRaiderVersion(lock) : null) ?? rubyRaiderPin(gemfile)
  if (version !== null) base.rubyRaiderVersion = version
  base.runtimeSupported = supportsRuntime(version)

  if (has('appium_lib')) {
    const caps = await readOptional(join(projectPath, 'config', 'capabilities.yml'))
    const mobilePlatform = (caps !== null && detectMobilePlatform(caps)) || undefined
    return { ...unsupported('mobile'), automation: 'appium', mobilePlatform }
  }
  if (has('minitest') && !has('rspec')) return unsupported('minitest')
  if (has('capybara')) return unsupported('capybara')
  if (!base.runtimeSupported) return unsupported('gemTooOld')
  return base
}
