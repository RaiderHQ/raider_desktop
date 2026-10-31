import { promises as fs } from 'node:fs'
import path from 'node:path'
import { appState } from '../appState'
import { listedFiles } from '../tests/projectTestIpc'
import type { Framework } from './runCommand'

const FEATURE = /^features\/(?:[^/]+\/)*[^/]+\.feature$/

/** The renderer-given path must be a regular .feature file that really lives inside the project. */
async function isProjectFeature(projectPath: string, file: unknown): Promise<boolean> {
  if (typeof file !== 'string' || !FEATURE.test(file) || file.split('/').includes('..')) {
    return false
  }
  try {
    const root = await fs.realpath(projectPath)
    const resolved = await fs.realpath(path.join(projectPath, file))
    if (!resolved.startsWith(root + path.sep)) return false
    return (await fs.lstat(resolved)).isFile()
  } catch {
    return false
  }
}

/**
 * Checks that every file may be run: a listed spec for RSpec projects, a feature file
 * inside the project for Cucumber ones. Throws `Not a project test: <file>` otherwise.
 */
export async function runnableFiles(files: string[], framework: Framework): Promise<void> {
  if (framework !== 'cucumber') {
    await listedFiles(files)
    return
  }
  const projectPath = appState.projectPath
  if (!projectPath) throw new Error('No project is open.')
  for (const file of files) {
    if (!(await isProjectFeature(projectPath, file))) {
      throw new Error(`Not a project test: ${String(file)}`)
    }
  }
}
