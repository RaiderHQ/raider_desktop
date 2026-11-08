import type { FileNode } from '@foundation/Types/fileNode'

// Tree paths come from path.join in main, so they use the OS separator
const posix = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')

/** The project-relative POSIX path of a tree path; '' for the root, null outside the project. */
export function toProjectRel(projectPath: string, abs: string): string | null {
  const root = posix(projectPath)
  const path = posix(abs)
  if (path === root) return ''
  return path.startsWith(root + '/') ? path.slice(root.length + 1) : null
}

export const toProjectAbs = (projectPath: string, rel: string): string =>
  rel === '' ? projectPath : `${projectPath}/${rel}`

/** The folder holding `rel`; '' is the project root. */
export const parentRel = (rel: string): string =>
  rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''

/** True when `path` is `entry` itself or lies inside it. */
export function isUnder(path: string, entry: string): boolean {
  const p = posix(path)
  const e = posix(entry)
  return p === e || p.startsWith(e + '/')
}

/** The names in the folder `rel` of the tree ('' = root); empty when it isn't in the tree. */
export function namesAt(files: FileNode[], rel: string): string[] {
  let level: FileNode[] = files
  for (const part of rel === '' ? [] : rel.split('/')) {
    const folder = level.find((node) => node.type === 'folder' && node.name === part)
    if (!folder) return []
    level = folder.children ?? []
  }
  return level.map((node) => node.name)
}

/** The i18n key of what's wrong with a new entry name, or null when it can be used. */
export function entryNameProblem(name: string, taken: string[]): string | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'files.name.empty'
  if (trimmed === '.' || trimmed === '..' || /[/\\\0]/.test(trimmed)) return 'files.name.invalid'
  if (taken.includes(trimmed)) return 'files.name.taken'
  return null
}
