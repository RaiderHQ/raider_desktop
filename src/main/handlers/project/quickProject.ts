import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import runRubyRaider from './runRubyRaider'
import updateBrowserUrl from '../config/updateBrowserUrl'
import { safeError } from '../../utils/safeLog'
import { slugify } from '../tests/recordedTests'
import type { QuickProject } from '../../../shared/types/quickProject'

type QuickProjectResult = { success: true; projectPath: string } | { success: false; error: string }

const FALLBACK_NAME = 'quick_record'

export function quickProjectsDir(): string {
  return path.join(app.getPath('userData'), 'quick-record')
}

export function quickProjectName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return host ? slugify(host) : FALLBACK_NAME
  } catch {
    return FALLBACK_NAME
  }
}

function freeName(dir: string, base: string): string {
  let name = base
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${base}_${i}`
  return name
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export async function createQuickProject(
  url: string,
  rubyCommand: string
): Promise<QuickProjectResult> {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad protocol')
  } catch {
    return { success: false, error: 'Enter a valid http or https address.' }
  }
  const dir = quickProjectsDir()
  let projectPath = ''
  try {
    fs.mkdirSync(dir, { recursive: true })
    const name = freeName(dir, quickProjectName(url))
    projectPath = path.join(dir, name)
    const created = await runRubyRaider(null as never, dir, name, 'rspec', 'selenium', rubyCommand)
    if (!created.success) {
      fs.rmSync(projectPath, { recursive: true, force: true })
      return { success: false, error: created.error ?? 'Could not create the project.' }
    }
    const updated = await updateBrowserUrl(null as never, projectPath, url)
    if (!updated.success) {
      fs.rmSync(projectPath, { recursive: true, force: true })
      return { success: false, error: updated.error ?? 'Could not set the project URL.' }
    }
    return { success: true, projectPath }
  } catch (e) {
    if (projectPath) fs.rmSync(projectPath, { recursive: true, force: true })
    return { success: false, error: message(e) }
  }
}

const isDirectory = (entry: fs.Dirent): boolean => entry.isDirectory() && !entry.isSymbolicLink()

/** The latest change in the folder or the folders two levels below (spec/, .raider/tests/, …) */
function lastChanged(folder: string, depth = 2): number {
  let latest = fs.statSync(folder).mtimeMs
  if (depth === 0) return latest
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (isDirectory(entry)) {
      latest = Math.max(latest, lastChanged(path.join(folder, entry.name), depth - 1))
    }
  }
  return latest
}

/** The quick-record projects, newest first; none when the folder doesn't exist yet. */
export function listQuickProjects(): QuickProject[] {
  const dir = quickProjectsDir()
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const projects: QuickProject[] = []
  for (const entry of entries.filter(isDirectory)) {
    const projectPath = path.join(dir, entry.name)
    try {
      projects.push({ path: projectPath, name: entry.name, modifiedAt: lastChanged(projectPath) })
    } catch (e) {
      // Gone or unreadable since it was listed: leave it out
      safeError('[quickProject] Could not read:', projectPath, message(e))
    }
  }
  return projects.sort((a, b) => b.modifiedAt - a.modifiedAt)
}

function realOrResolved(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

export function isQuickProject(projectPath: string): boolean {
  if (typeof projectPath !== 'string' || projectPath === '') return false
  const root = realOrResolved(quickProjectsDir())
  const rel = path.relative(root, realOrResolved(projectPath))
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

export async function saveQuickProjectTo(
  projectPath: string,
  destFolder: string
): Promise<QuickProjectResult> {
  let target = ''
  let copyStarted = false
  try {
    if (!isQuickProject(projectPath) || !fs.existsSync(projectPath)) {
      return { success: false, error: 'This is not a quick-record project.' }
    }
    if (typeof destFolder !== 'string' || !fs.statSync(destFolder).isDirectory()) {
      return { success: false, error: 'Choose an existing folder to save into.' }
    }
    target = path.join(path.resolve(destFolder), path.basename(projectPath))
    try {
      fs.lstatSync(target)
      return { success: false, error: `"${path.basename(target)}" already exists in that folder.` }
    } catch {
      // does not exist: good
    }
    copyStarted = true
    await fs.promises.cp(projectPath, target, { recursive: true, errorOnExist: true, force: false })
    copyStarted = false
    try {
      await fs.promises.rm(projectPath, { recursive: true, force: true })
    } catch (e) {
      // The copy is complete; keep it and leave the leftover source rather than risk data loss.
      safeError('[quickProject] Copied, but could not remove the source:', projectPath, message(e))
    }
    return { success: true, projectPath: target }
  } catch (e) {
    if (copyStarted) fs.rmSync(target, { recursive: true, force: true })
    return { success: false, error: message(e) }
  }
}
