import fs from 'fs'
import { join } from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { safeExec } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'
import type { ScaffoldParams, ScaffoldResult } from '@shared/types/scaffoldTypes'
import { isFolderScaffoldType, isScaffoldName, scaffoldFileName } from '@shared/scaffoldName'
import { quoteShellArg } from '../../utils/shellQuote'
import { scaffoldTarget } from '../io/projectFiles'
import { detectProjectLayout, MOBILE_UNSUPPORTED } from './projectLayout'

const NAME_RULE = 'A name starts with a letter and has only letters, digits and underscores.'

type Prepared = { command: string; fileRel: string } | ScaffoldResult

/**
 * `raider g <type> <name> --path=<folder>` from the Files tab. The folder goes through the
 * same checks as New file (inside the open project, links followed, not Git's or Raider's),
 * the name is a plain identifier, and nothing may be at the file the gem will write: with
 * no one to answer its prompt it overwrites. `--path=` keeps a folder named like a flag
 * (`--force`) the option's value.
 */
const UNSAFE_FOLDER =
  "Ruby Raider can't generate into this folder: rename folders that start with - (or contain % or ! on Windows)."

/**
 * The gem's command line reads the folder too. A segment starting with - can be taken as an
 * option (Thor turns --no-path / --skip-path into "no path" and the gem then writes to the
 * config default, where nothing was checked), and cmd.exe expands %VAR% and !VAR! even
 * inside double quotes.
 */
export function isGemSafeFolder(path: string, platform: NodeJS.Platform): boolean {
  const segments = path.split('/')
  if (segments.some((segment) => segment.startsWith('-'))) return false
  if (platform === 'win32' && /[%!]/.test(path)) return false
  return true
}

async function prepareInFolder(params: ScaffoldParams, projectPath: string): Promise<Prepared> {
  // From IPC: every field is checked, whatever the type says
  const { type, name, path } = (params ?? {}) as Partial<ScaffoldParams>
  if (params?.operation !== 'generate' || !isFolderScaffoldType(type)) {
    return { success: false, output: '', error: `Unsupported type for a folder: ${String(type)}` }
  }
  if (!isScaffoldName(name)) {
    return { success: false, output: '', error: NAME_RULE, code: 'invalidName' }
  }
  if (typeof path !== 'string') return { success: false, output: '', error: 'Not a folder path' }
  if (!isGemSafeFolder(path, process.platform)) {
    return { success: false, output: '', error: UNSAFE_FOLDER, code: 'invalidName' }
  }
  const target = await scaffoldTarget(projectPath, path, scaffoldFileName(type, name))
  if (!target.success) {
    return { success: false, output: '', error: target.error, code: target.code }
  }
  if (!target.path) return { success: false, output: '', error: 'Not a folder path' }
  const command = ['raider', 'g', type, name, quoteShellArg(`--path=${path}`)].join(' ')
  return { command, fileRel: target.path }
}

const handler = async (
  _event: IpcMainInvokeEvent,
  params: ScaffoldParams,
  projectPath: string,
  _rubyCommand: string
): Promise<ScaffoldResult> => {
  const fixPath = (await import('fix-path')).default
  fixPath()

  try {
    // Validate project path exists
    if (!fs.existsSync(projectPath)) {
      return { success: false, output: '', error: `Project path does not exist: ${projectPath}` }
    }
    // Mobile (Appium) projects are not supported in this version, so nothing is generated into one
    if ((await detectProjectLayout(projectPath)).unsupportedReason === 'mobile') {
      return { success: false, output: '', error: MOBILE_UNSUPPORTED }
    }

    const prepared = await prepareInFolder(params, projectPath)
    if (!('command' in prepared)) return prepared
    const { command, fileRel } = prepared
    const shellCommand = buildShellCommand(projectPath, command)

    // stdin stays open on purpose: if a file appears at the target after the check, Thor's
    // "Overwrite?" prompt waits for the timeout instead of reading EOF as yes
    const result = await safeExec(shellCommand, { timeout: 30_000 })

    if (result.exitCode !== 0) {
      return {
        success: false,
        output: result.stderr.trim() || result.stdout.trim(),
        error: result.stderr.trim()
      }
    }
    const output = result.stdout.trim()
    if (!(await fs.promises.lstat(join(projectPath, fileRel)).catch(() => null))) {
      return { success: false, output, error: `Ruby Raider did not create ${fileRel}` }
    }
    return { success: true, output, files: [fileRel] }
  } catch (error) {
    return {
      success: false,
      output: '',
      error: (error as Error).message
    }
  }
}

export default handler
