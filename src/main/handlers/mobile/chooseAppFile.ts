import { dialog } from 'electron'
import { realpath, stat } from 'fs/promises'
import { basename, isAbsolute, relative, resolve, sep } from 'path'
import { safeError } from '../../utils/safeLog'
import { lastDialogDirectory, rememberDialogPick } from '../../utils/dialogDirectory'
import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'

const NOT_OPEN = 'This project is not open.'
const NOT_CHOSEN = "Couldn't choose the app file."
// The renderer maps this one to its own copy
const NOT_AN_APP = 'not-an-app'

// An iOS simulator build is a .app folder, so iOS also opens folders. Leaving out
// 'treatPackageAsDirectory' makes macOS pick a .app bundle whole rather than browse into it.
const PICKERS = {
  ios: {
    properties: ['openFile', 'openDirectory'] as Array<'openFile' | 'openDirectory'>,
    filters: [{ name: 'iOS app', extensions: ['app', 'ipa'] }]
  },
  android: {
    properties: ['openFile'] as Array<'openFile' | 'openDirectory'>,
    filters: [{ name: 'Android app', extensions: ['apk', 'aab'] }]
  }
}

/** The pick relative to the project (posix separators) when it's inside it, else as picked */
async function projectRelative(project: string, picked: string): Promise<string> {
  try {
    const inside = relative(await realpath(project), await realpath(picked))
    const outside = inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)
    if (inside && !outside) return inside.split(sep).join('/')
  } catch {
    // An unresolvable path can't be shown to be inside the project
  }
  return picked
}

/** A folder is only an app when it's a .app bundle; the iOS picker also lets plain folders through */
async function isAppPick(picked: string): Promise<boolean> {
  return !(await stat(picked)).isDirectory() || basename(picked).toLowerCase().endsWith('.app')
}

/** 'choose-app-file': a file picker for the app a mobile project tests; a plain folder gives { error: 'not-an-app' } */
export async function chooseAppFileHandler(
  projectPath: unknown,
  platform: unknown
): Promise<{ path: string } | { cancelled: true } | { error: string }> {
  await activationSettled()
  if (
    typeof projectPath !== 'string' ||
    !appState.projectPath ||
    resolve(projectPath) !== resolve(appState.projectPath)
  ) {
    return { error: NOT_OPEN }
  }
  if (platform !== 'ios' && platform !== 'android') return { error: NOT_CHOSEN }
  const project = appState.projectPath
  try {
    const result = await dialog.showOpenDialog({
      defaultPath: lastDialogDirectory() ?? project,
      properties: PICKERS[platform].properties,
      filters: PICKERS[platform].filters
    })
    if (result.canceled || result.filePaths.length === 0) return { cancelled: true }
    rememberDialogPick(result.filePaths)
    if (!(await isAppPick(result.filePaths[0]))) return { error: NOT_AN_APP }
    return { path: await projectRelative(project, result.filePaths[0]) }
  } catch (error) {
    safeError('choose-app-file failed:', error)
    return { error: NOT_CHOSEN }
  }
}
