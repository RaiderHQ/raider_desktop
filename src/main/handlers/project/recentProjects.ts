import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { quickProjectsDir } from './quickProject'
import type { RecentProject, RecentProjectEntry } from '../../../shared/types/recentProject'

/**
 * The projects opened with Raider on this computer, newest first, in a small JSON file
 * in userData. Main writes it on every successful activation; the renderer only reads
 * the list and asks for one entry or all of them to be removed (U8).
 */

export const RECENT_PROJECTS_LIMIT = 8
const FILE_VERSION = 1

const recentFile = (): string => path.join(app.getPath('userData'), 'recent-projects.json')

/** Only what is stored is accepted: a string path, a string name, a numeric time */
const asRecentProject = (value: unknown): RecentProject | null => {
  if (!value || typeof value !== 'object') return null
  const { path: projectPath, name, lastOpened } = value as Record<string, unknown>
  if (typeof projectPath !== 'string' || !projectPath) return null
  if (typeof name !== 'string') return null
  if (typeof lastOpened !== 'number' || !Number.isFinite(lastOpened)) return null
  return { path: projectPath, name, lastOpened }
}

export function readRecentProjects(): RecentProject[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(recentFile(), 'utf8'))
  } catch {
    return []
  }
  const projects = (parsed as { projects?: unknown } | null)?.projects
  if (!Array.isArray(projects)) return []
  const seen = new Set<string>()
  const kept: RecentProject[] = []
  for (const raw of projects) {
    const project = asRecentProject(raw)
    if (!project || seen.has(project.path)) continue
    seen.add(project.path)
    kept.push(project)
    if (kept.length === RECENT_PROJECTS_LIMIT) break
  }
  return kept
}

/** Written whole: a crash mid-write leaves the previous file, never a torn one */
function writeRecentProjects(projects: RecentProject[]): void {
  const target = recentFile()
  const temp = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify({ version: FILE_VERSION, projects }, null, 2))
  fs.renameSync(temp, target)
}

const isQuickRecording = (projectPath: string): boolean => {
  const relative = path.relative(quickProjectsDir(), projectPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

const isDirectory = (projectPath: string): boolean => {
  try {
    return fs.statSync(projectPath).isDirectory()
  } catch {
    return false
  }
}

/** Puts an opened project at the top; quick recordings keep their own list */
export function recordRecentProject(projectPath: string): void {
  const resolved = path.resolve(projectPath)
  if (isQuickRecording(resolved) || !isDirectory(resolved)) return
  const rest = readRecentProjects().filter((p) => p.path !== resolved)
  const entry: RecentProject = {
    path: resolved,
    name: path.basename(resolved),
    lastOpened: Date.now()
  }
  writeRecentProjects([entry, ...rest].slice(0, RECENT_PROJECTS_LIMIT))
}

/** Removes the entry whose stored path is exactly this one; anything else is a no-op */
export function removeRecentProject(projectPath: string): void {
  if (typeof projectPath !== 'string') return
  const projects = readRecentProjects()
  const rest = projects.filter((p) => p.path !== projectPath)
  if (rest.length !== projects.length) writeRecentProjects(rest)
}

export function clearRecentProjects(): void {
  writeRecentProjects([])
}

/** The list with what the user needs to know before opening one */
export function listRecentProjects(): RecentProjectEntry[] {
  return readRecentProjects().map((project) => {
    const exists = isDirectory(project.path)
    return {
      ...project,
      exists,
      isRaider: exists && fs.existsSync(path.join(project.path, 'config', 'config.yml'))
    }
  })
}
